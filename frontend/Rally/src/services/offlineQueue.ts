/**
 * offlineQueue.ts — durable, bounded, schema-versioned offline operation queue.
 *
 * This module is a *storage/ordering primitive* used by `SyncManager`; it is NOT
 * a second sync manager. It owns the canonical `OfflineOperation` record, the
 * monotonic `sequence` counter (the ordering key), the on-disk envelope, bounds +
 * archival, and schema migration/quarantine.
 *
 * ## Storage model (why two tiers)
 *
 * A naive "read the whole array, push, re-serialise the whole array" design is
 * O(n²) in bytes and blows up long before the 500-op bound under a burst of
 * enqueues. Instead the queue is stored as:
 *
 *   1. **Per-operation records** (append-only, the fast/durable path) under keys
 *      `offline_sync_queue:op:<padded-sequence>:<id>`. Enqueue writes exactly one
 *      small key → O(1). Order is recovered by sorting the keys (padded sequence).
 *   2. **A materialised envelope blob** under `offline_sync_queue` (the compact
 *      snapshot) produced by `flushEnvelope()` and consumed by export/migration.
 *
 * Exactly one tier is authoritative at rest; `ensureExpanded()` converts a blob
 * into per-op records on the first mutation and `flushEnvelope()` collapses
 * per-op records back into a blob. A legacy v1 bare JSON array is migrated into
 * the v2 form on load.
 *
 * ## Invariants (mirrors design §3, §4, §6, §13)
 *  - Ordering key is `sequence` (persisted monotonic); `timestamp` is display-only.
 *  - `id` is unique and NEVER re-derived from a clock.
 *  - Eviction is **archival, never deletion** (AC 14 reconciled with AC 10).
 *  - An unknown/newer schema version is **quarantined**, never silently dropped.
 *  - A corrupt **per-op** record is likewise copied to quarantine
 *    (`offline_sync_queue_quarantine:op:*`) before it can be cleaned up — a
 *    single unreadable record never destroys its bytes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Keys & constants
// ---------------------------------------------------------------------------

/** AsyncStorage key holding the materialised v2 envelope. */
export const QUEUE_KEY = 'offline_sync_queue';
/**
 * Legacy/snapshot key name for the archive. Archived records themselves are
 * stored **append-only** under `offline_sync_archive:op:*` keys (see
 * `ARCHIVE_PREFIX`) so eviction stays O(1); `readArchive()` is the accessor.
 */
export const ARCHIVE_KEY = 'offline_sync_archive';
/** Prefix for append-only archived-operation records. */
export const ARCHIVE_PREFIX = 'offline_sync_archive:op:';
/** AsyncStorage key holding whatever we could not understand (never discarded). */
export const QUARANTINE_KEY = 'offline_sync_queue_quarantine';
/** AsyncStorage key holding the persisted monotonic sequence counter. */
export const SEQUENCE_KEY = 'offline_sync_sequence';
/** AsyncStorage key holding the running archived-operation count. */
export const ARCHIVED_COUNT_KEY = 'offline_sync_archived_count';
/** Prefix for the append-only per-operation records. */
export const PER_OP_PREFIX = 'offline_sync_queue:op:';
/** Prefix for quarantined corrupt per-operation records (never discarded). */
export const PER_OP_QUARANTINE_PREFIX = 'offline_sync_queue_quarantine:op:';

/** Current envelope schema version. */
export const SCHEMA_VERSION = 2;
/** Hard cap on active (replayable) operations. */
export const MAX_OPERATIONS = 500;
/** Soft warning threshold (80%). */
export const SOFT_LIMIT = Math.floor(0.8 * MAX_OPERATIONS);
/** Hard cap on approximate active-queue bytes. */
export const MAX_TOTAL_BYTES = 1_500_000;
/** Retryable attempts before an op moves to `failed` (and is retained). */
export const MAX_ATTEMPTS = 8;
/** Base backoff in milliseconds. */
export const BACKOFF_BASE_MS = 2_000;
/** Backoff ceiling in milliseconds. */
export const BACKOFF_CAP_MS = 60_000;
/** Max random jitter added to the backoff, in milliseconds. */
export const BACKOFF_JITTER_MS = 1_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OperationState = 'queued' | 'syncing' | 'conflict' | 'failed';
export type OperationMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * The canonical operation record (design §3.1). `id`, `sequence`, `timestamp`,
 * `retryCount` and `state` are owned by the queue — callers must not re-stamp
 * them.
 */
export interface OfflineOperation {
  id: string; // unique — NEVER re-derived from a clock
  sequence: number; // monotonic int, assigned at enqueue, persisted. ORDERING KEY
  entity: string; // label only
  op: string; // label only
  payload: { method: OperationMethod; endpoint: string; body?: unknown };
  version?: number;
  timestamp: string; // advisory only
  identity: { deviceId: string; userId?: string };
  retryCount: number;
  state: OperationState;
  lastError?: { code: string; message: string; status?: number };
  firstAttemptAt?: string;
  lastAttemptAt?: string;
}

/** Caller-supplied shape for a new operation (queue owns the rest). */
export interface OfflineOperationInput {
  entity: string;
  op: string;
  payload: { method: OperationMethod; endpoint: string; body?: unknown };
  version?: number;
}

/** The on-disk envelope (design §3.3). */
export interface QueueEnvelope {
  schemaVersion: number;
  sequence: number;
  operations: OfflineOperation[];
  updatedAt: string;
}

export interface MigrationResult {
  migrated: boolean;
  quarantined: boolean;
  schemaVersion: number;
  count: number;
}

export interface MigrationState {
  schemaQuarantine: boolean;
  quarantinedAt: string | null;
  quarantinedReason: string | null;
  quarantinedRaw: string | null;
  /** Number of corrupt per-op records preserved under quarantine. */
  perOpQuarantinedCount: number;
}

export interface QueueStats {
  count: number;
  archivedCount: number;
  nearLimit: boolean;
  atLimit: boolean;
  bytes: number;
}

/** An archived record is a normal op plus an audit timestamp. */
export type ArchivedOperation = OfflineOperation & { archivedAt: string };

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Total-order comparator: ascending `sequence`, tie-broken by `id`. */
export function compareOperations(a: OfflineOperation, b: OfflineOperation): number {
  if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  return a.id.localeCompare(b.id);
}

/** Returns a new, fully sorted copy (never mutates the input). */
export function sortOperations(operations: OfflineOperation[]): OfflineOperation[] {
  return [...operations].sort(compareOperations);
}

/** Zero-padded sequence so string-sorting keys matches numeric ordering. */
function padSequence(sequence: number): string {
  return String(Math.max(0, Math.trunc(sequence))).padStart(12, '0');
}

/** Storage key for a single append-only operation record. */
function perOpKey(op: OfflineOperation): string {
  return `${PER_OP_PREFIX}${padSequence(op.sequence)}:${op.id}`;
}

/** True when an AsyncStorage key is a per-operation record. */
function isPerOpKey(key: string): boolean {
  return key.startsWith(PER_OP_PREFIX);
}

/**
 * Generate a unique id. Prefers `crypto.randomUUID()` (available on web and on
 * native once `react-native-get-random-values` is imported). The deterministic
 * fallback is collision-free because `sequence` is unique per enqueue, so it is
 * safe even when the polyfill is absent.
 */
export function createOperationId(sequence: number): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    try {
      return cryptoObj.randomUUID();
    } catch {
      /* fall through to the deterministic id */
    }
  }
  const randomSuffix = Math.random().toString(36).slice(2, 11);
  return `${sequence.toString(36)}-${Date.now().toString(36)}-${randomSuffix}`;
}

/**
 * Exponential backoff with jitter (design §4.3, AC 1):
 * `delay = min(2000 * 2^retryCount, 60000) ± jitter`, jitter ∈ (-1000, +1000).
 * The jitter is symmetric so retrying clients de-synchronise instead of
 * stampeding the server in lock-step.
 */
export function computeBackoffDelay(retryCount: number, random: () => number = Math.random): number {
  const safeCount = Math.max(0, Math.trunc(retryCount));
  const exponential = BACKOFF_BASE_MS * Math.pow(2, safeCount);
  const base = Math.min(exponential, BACKOFF_CAP_MS);
  const jitter = Math.round((random() * 2 - 1) * BACKOFF_JITTER_MS);
  return Math.max(0, base + jitter);
}

/** Approximate serialised size of an operation, in characters (≈ bytes). */
function operationByteLength(op: OfflineOperation): number {
  return JSON.stringify(op).length;
}

/** A minimal serial async mutex — serialises an async critical section. */
class Mutex {
  private tail: Promise<void> = Promise.resolve();

  runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(task, task);
    // Keep the chain alive even when `task` rejects.
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toState(value: unknown): OperationState {
  return value === 'syncing' || value === 'conflict' || value === 'failed' ? value : 'queued';
}

function toMethod(value: unknown): OperationMethod {
  return value === 'PUT' || value === 'PATCH' || value === 'DELETE' ? value : 'POST';
}

/**
 * Normalise a single raw record into a valid `OfflineOperation`. Used by the v1
 * migration and defensively on load. `fallbackSequence` back-fills the ordering
 * key by array index so a legacy queue keeps its order.
 */
function normalizeRawOperation(raw: unknown, fallbackSequence: number): OfflineOperation | null {
  if (!isRecord(raw)) return null;

  const sequenceValue = typeof raw.sequence === 'number' && Number.isFinite(raw.sequence)
    ? raw.sequence
    : fallbackSequence;
  const id = typeof raw.id === 'string' && raw.id.length > 0
    ? raw.id
    : createOperationId(sequenceValue);

  // Legacy records stored the body in `payload.data`; new records use `payload.body`.
  const payloadRaw = isRecord(raw.payload) ? raw.payload : {};
  const identityRaw = isRecord(raw.identity) ? raw.identity : {};
  const lastErrorRaw = isRecord(raw.lastError) ? raw.lastError : null;

  const endpoint = typeof payloadRaw.endpoint === 'string' ? payloadRaw.endpoint : '';
  const hasBody = 'body' in payloadRaw;
  const legacyHasData = 'data' in payloadRaw;
  const body = hasBody ? payloadRaw.body : legacyHasData ? payloadRaw.data : undefined;

  return {
    id,
    sequence: sequenceValue,
    entity: typeof raw.entity === 'string' ? raw.entity : 'unknown',
    op: typeof raw.op === 'string' ? raw.op : 'unknown',
    payload: {
      method: toMethod(payloadRaw.method),
      endpoint,
      ...(body !== undefined ? { body } : {}),
    },
    ...(typeof raw.version === 'number' ? { version: raw.version } : {}),
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toISOString(),
    identity: {
      deviceId: typeof identityRaw.deviceId === 'string' ? identityRaw.deviceId : '',
      ...(typeof identityRaw.userId === 'string' ? { userId: identityRaw.userId } : {}),
    },
    retryCount: typeof raw.retryCount === 'number' && raw.retryCount >= 0 ? raw.retryCount : 0,
    state: toState(raw.state),
    ...(lastErrorRaw
      ? {
          lastError: {
            code: typeof lastErrorRaw.code === 'string' ? lastErrorRaw.code : 'UNKNOWN',
            message: typeof lastErrorRaw.message === 'string' ? lastErrorRaw.message : '',
            ...(typeof lastErrorRaw.status === 'number' ? { status: lastErrorRaw.status } : {}),
          },
        }
      : {}),
    ...(typeof raw.firstAttemptAt === 'string' ? { firstAttemptAt: raw.firstAttemptAt } : {}),
    ...(typeof raw.lastAttemptAt === 'string' ? { lastAttemptAt: raw.lastAttemptAt } : {}),
  };
}

/** Normalise an array of raw records, back-filling `sequence` by index (v1). */
function normalizeRawOperations(rawList: unknown[]): OfflineOperation[] {
  const result: OfflineOperation[] = [];
  rawList.forEach((raw, index) => {
    const op = normalizeRawOperation(raw, index);
    if (op) result.push(op);
  });
  return sortOperations(result);
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

export class OfflineQueue {
  private static instance: OfflineQueue | null = null;

  private readonly sequenceMutex = new Mutex();
  private readonly writeMutex = new Mutex();

  /** Mirrors a blob we just read/wrote so we can serve reads without a re-parse. */
  private envelopeMirror: QueueEnvelope | null = null;
  /** In-memory index of per-op records (id → sequence + size). */
  private index: Array<{ id: string; sequence: number; bytes: number }> | null = null;
  /** True once we have verified no blob remains and per-op records are authoritative. */
  private expanded = false;
  /** In-memory view of the persisted sequence counter. */
  private sequenceMirror = 0;
  /** Migration/quarantine state for the UI banner. */
  private migration: MigrationState = {
    schemaQuarantine: false,
    quarantinedAt: null,
    quarantinedReason: null,
    quarantinedRaw: null,
    perOpQuarantinedCount: 0,
  };
  /** Keys of corrupt per-op records already preserved (avoids re-quarantine). */
  private perOpQuarantinedKeys: Set<string> = new Set();
  /** Last storage write error (quota), surfaced via `getStats`. */
  private lastPersistError: string | null = null;

  private constructor() {
    /* use getInstance() */
  }

  static getInstance(): OfflineQueue {
    if (!OfflineQueue.instance) {
      OfflineQueue.instance = new OfflineQueue();
    }
    return OfflineQueue.instance;
  }

  // -- invalidation ---------------------------------------------------------

  /**
   * Drop in-memory caches for any external (non-method) write. Detected by
   * snapshotting `getAllKeys()` and `getItem()` for the keys we own.
   */
  private async invalidate(): Promise<void> {
    let keys: readonly string[] = [];
    try {
      keys = await AsyncStorage.getAllKeys();
    } catch {
      keys = [];
    }

    const snapshots: Array<[string, string | null]> = await Promise.all(
      [QUEUE_KEY, SEQUENCE_KEY].map(async (key): Promise<[string, string | null]> => {
        try {
          return [key, await AsyncStorage.getItem(key)];
        } catch {
          return [key, null];
        }
      }),
    );

    let keySetChanged = false;
    if (this.index !== null) {
      const perOpCount = keys.filter(isPerOpKey).length;
      if (perOpCount !== this.index.length) keySetChanged = true;
    }

    const blobSnapshot = snapshots.find(([key]) => key === QUEUE_KEY)?.[1] ?? null;
    const seqSnapshot = snapshots.find(([key]) => key === SEQUENCE_KEY)?.[1] ?? null;

    // A materialised blob always supersedes our per-op view.
    if (blobSnapshot !== null && this.expanded) {
      this.expanded = false;
      this.envelopeMirror = null;
      this.index = null;
    }

    if (keySetChanged && this.envelopeMirror === null) {
      this.index = null;
    }

    // Trust the persisted blob's sequence as the new floor.
    if (blobSnapshot) {
      try {
        const parsed = JSON.parse(blobSnapshot) as unknown;
        if (isRecord(parsed) && typeof parsed.sequence === 'number') {
          this.sequenceMirror = Math.max(this.sequenceMirror, parsed.sequence);
        }
      } catch {
        /* ignore — handled by migration */
      }
    }
    if (seqSnapshot !== null) {
      const n = parseInt(seqSnapshot, 10);
      if (Number.isFinite(n)) this.sequenceMirror = Math.max(this.sequenceMirror, n);
    }
  }

  // -- sequence allocator ---------------------------------------------------

  private async readSequenceOnDisk(): Promise<number> {
    try {
      const raw = await AsyncStorage.getItem(SEQUENCE_KEY);
      const parsed = raw !== null ? parseInt(raw, 10) : 0;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  private async writeSequenceOnDisk(sequence: number): Promise<void> {
    try {
      await AsyncStorage.setItem(SEQUENCE_KEY, String(sequence));
      this.lastPersistError = null;
    } catch (error) {
      this.lastPersistError = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Allocate the next monotonic sequence number. Serialised through an
   * in-process mutex so two rapid enqueues cannot read the same value
   * (design §3.2). `nextSequence() = (await read()) + 1; await write()`.
   */
  async nextSequence(): Promise<number> {
    return this.sequenceMutex.runExclusive(async () => {
      const persisted = await this.readSequenceOnDisk();
      const next = Math.max(persisted, this.sequenceMirror) + 1;
      await this.writeSequenceOnDisk(next);
      this.sequenceMirror = next;
      return next;
    });
  }

  // -- expansion / collapse -------------------------------------------------

  private async readBlob(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(QUEUE_KEY);
    } catch {
      return null;
    }
  }

  private async writePerOpRecord(op: OfflineOperation): Promise<number> {
    const raw = JSON.stringify(op);
    try {
      await AsyncStorage.setItem(perOpKey(op), raw);
      this.lastPersistError = null;
    } catch (error) {
      this.lastPersistError = error instanceof Error ? error.message : String(error);
    }
    return raw.length;
  }

  private async removePerOpRecord(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      /* best effort */
    }
  }

  /**
   * Preserve an unparsable per-op record under quarantine before it can be
   * cleaned up, mirroring the envelope quarantine path. This is what keeps the
   * AC 8 / AC 10 "never silently discard" invariant true for a *single* corrupt
   * record: `clearPerOpRecordsNotIn` may later remove the original key, but the
   * bytes are already copied to `offline_sync_queue_quarantine:op:*`.
   */
  private async quarantinePerOpRecord(key: string, raw: string): Promise<void> {
    if (this.perOpQuarantinedKeys.has(key)) return;
    try {
      await AsyncStorage.setItem(
        `${PER_OP_QUARANTINE_PREFIX}${key}`,
        JSON.stringify({
          quarantinedAt: new Date().toISOString(),
          reason: 'PARSE_ERROR',
          sourceKey: key,
          raw, // NEVER discarded — preserved verbatim for recovery
        }),
      );
      this.perOpQuarantinedKeys.add(key);
      this.migration = {
        ...this.migration,
        perOpQuarantinedCount: this.perOpQuarantinedKeys.size,
      };
    } catch (error) {
      this.lastPersistError = error instanceof Error ? error.message : String(error);
    }
  }

  /** Read every per-op record from storage, sorted by `sequence`. */
  private async readPerOpRecords(): Promise<OfflineOperation[]> {
    let keys: string[] = [];
    try {
      keys = (await AsyncStorage.getAllKeys()).filter(isPerOpKey);
    } catch {
      return [];
    }
    keys.sort();
    const operations: OfflineOperation[] = [];
    for (const key of keys) {
      let raw: string | null = null;
      try {
        raw = await AsyncStorage.getItem(key);
      } catch {
        continue; // storage read failed — leave the key untouched
      }
      if (!raw) continue;
      try {
        const parsed = normalizeRawOperation(JSON.parse(raw), operations.length);
        if (parsed) operations.push(parsed);
      } catch {
        // A single corrupt record must not drop the whole queue — but it must
        // also not be silently destroyed. Preserve it under quarantine.
        await this.quarantinePerOpRecord(key, raw);
      }
    }
    return sortOperations(operations);
  }

  /** Rebuild the in-memory per-op index from storage (O(n), cached). */
  private async loadIndex(): Promise<void> {
    if (this.index !== null) return;
    let keys: string[] = [];
    try {
      keys = (await AsyncStorage.getAllKeys()).filter(isPerOpKey);
    } catch {
      keys = [];
    }
    keys.sort();
    const index: Array<{ id: string; sequence: number; bytes: number }> = [];
    for (const key of keys) {
      let raw: string | null = null;
      try {
        raw = await AsyncStorage.getItem(key);
      } catch {
        continue;
      }
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as Partial<OfflineOperation>;
        index.push({
          id: typeof parsed.id === 'string' ? parsed.id : key,
          sequence: typeof parsed.sequence === 'number' ? parsed.sequence : index.length,
          bytes: raw.length,
        });
      } catch {
        // Preserve the corrupt bytes before the index cleanup can remove them.
        await this.quarantinePerOpRecord(key, raw);
      }
    }
    this.index = index;
  }

  /**
   * Guarantee per-op records are authoritative. On the first mutation after a
   * blob (or legacy array) is present, migrate it into per-op records. Never
   * runs when a newer, quarantined schema is on disk.
   */
  private async ensureExpanded(): Promise<void> {
    if (this.expanded) {
      await this.loadIndex();
      return;
    }
    if (this.migration.schemaQuarantine) {
      // Leave the unknown block untouched; operate on an empty active queue.
      this.expanded = true;
      this.index = [];
      return;
    }

    const raw = await this.readBlob();
    if (raw === null || raw === undefined) {
      this.expanded = true;
      this.envelopeMirror = null;
      this.index = null;
      await this.loadIndex();
      return;
    }

    const result = this.parseEnvelope(raw);
    if (result.kind === 'quarantine') {
      await this.quarantine(raw, result.reason, result.schemaVersion);
      this.expanded = true;
      this.index = [];
      return;
    }

    // Write each operation as a per-op record, then remove the blob.
    const operations = result.envelope.operations;
    for (const op of operations) {
      await this.writePerOpRecord(op);
    }
    await this.clearPerOpRecordsNotIn(operations.map((op) => perOpKey(op)));
    try {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } catch {
      /* ignore */
    }
    this.expanded = true;
    this.envelopeMirror = null;
    this.index = operations.map((op) => ({
      id: op.id,
      sequence: op.sequence,
      bytes: operationByteLength(op),
    }));
    this.sequenceMirror = Math.max(this.sequenceMirror, result.envelope.sequence);
    for (const op of operations) {
      this.sequenceMirror = Math.max(this.sequenceMirror, op.sequence);
    }
  }

  private async clearPerOpRecordsNotIn(keepKeys: string[]): Promise<void> {
    const keep = new Set(keepKeys);
    let keys: string[] = [];
    try {
      keys = (await AsyncStorage.getAllKeys()).filter(isPerOpKey);
    } catch {
      return;
    }
    const toRemove = keys.filter((key) => !keep.has(key));
    if (toRemove.length > 0) {
      try {
        await AsyncStorage.multiRemove(toRemove);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Collapse per-op records into a single materialised envelope blob and remove
   * the per-op records. Used by sync/export snapshots. Keeps the sequence
   * counter intact.
   */
  async flushEnvelope(): Promise<void> {
    await this.writeMutex.runExclusive(async () => {
      const operations = await this.readActiveOperationsUnlocked();
      const sequence = Math.max(
        this.sequenceMirror,
        operations.reduce((max, op) => Math.max(max, op.sequence), 0),
      );
      const envelope: QueueEnvelope = {
        schemaVersion: SCHEMA_VERSION,
        sequence,
        operations,
        updatedAt: new Date().toISOString(),
      };
      try {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(envelope));
      } catch (error) {
        this.lastPersistError = error instanceof Error ? error.message : String(error);
        return;
      }
      await this.clearPerOpRecordsNotIn([]);
      this.envelopeMirror = envelope;
      this.index = operations.map((op) => ({
        id: op.id,
        sequence: op.sequence,
        bytes: operationByteLength(op),
      }));
      this.expanded = false;
    });
  }

  /** Read active operations without taking the write mutex (caller holds it). */
  private async readActiveOperationsUnlocked(): Promise<OfflineOperation[]> {
    const raw = await this.readBlob();
    if (raw !== null && raw !== undefined) {
      const result = this.parseEnvelope(raw);
      if (result.kind === 'quarantine') {
        await this.quarantine(raw, result.reason, result.schemaVersion);
        return [];
      }
      return result.envelope.operations;
    }
    if (this.migration.schemaQuarantine) return [];
    return this.readPerOpRecords();
  }

  // -- envelope parsing / migration ----------------------------------------

  private parseEnvelope(raw: string):
    | { kind: 'envelope'; envelope: QueueEnvelope }
    | { kind: 'quarantine'; reason: string; schemaVersion: number } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { kind: 'quarantine', reason: 'PARSE_ERROR', schemaVersion: -1 };
    }

    // v1: a bare array. Migrate it — never discard.
    if (Array.isArray(parsed)) {
      const operations = normalizeRawOperations(parsed);
      const sequence = operations.reduce((max, op) => Math.max(max, op.sequence), operations.length);
      return {
        kind: 'envelope',
        envelope: {
          schemaVersion: SCHEMA_VERSION,
          sequence,
          operations,
          updatedAt: new Date().toISOString(),
        },
      };
    }

    if (!isRecord(parsed)) {
      return { kind: 'quarantine', reason: 'MALFORMED_ENVELOPE', schemaVersion: -1 };
    }

    const version = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 1;
    if (version > SCHEMA_VERSION) {
      return { kind: 'quarantine', reason: 'NEWER_SCHEMA_VERSION', schemaVersion: version };
    }

    const operationsRaw = Array.isArray(parsed.operations) ? parsed.operations : [];
    const operations = normalizeRawOperations(operationsRaw);
    const sequence = typeof parsed.sequence === 'number'
      ? Math.max(parsed.sequence, operations.reduce((max, op) => Math.max(max, op.sequence), 0))
      : operations.reduce((max, op) => Math.max(max, op.sequence), operations.length);

    return {
      kind: 'envelope',
      envelope: {
        schemaVersion: SCHEMA_VERSION,
        sequence,
        operations,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      },
    };
  }

  /**
   * Load the queue envelope, normalising/migrating and quarantining as needed.
   * NEVER silently returns `[]` for a corrupt key — the raw payload is moved to
   * the quarantine key and a flag is raised (AC 8).
   */
  async getEnvelope(): Promise<QueueEnvelope> {
    await this.invalidate();

    const raw = await this.readBlob();
    if (raw !== null && raw !== undefined) {
      const result = this.parseEnvelope(raw);
      if (result.kind === 'quarantine') {
        await this.quarantine(raw, result.reason, result.schemaVersion);
        this.sequenceMirror = Math.max(this.sequenceMirror, await this.readSequenceOnDisk());
        return {
          schemaVersion: SCHEMA_VERSION,
          sequence: this.sequenceMirror,
          operations: [],
          updatedAt: new Date().toISOString(),
        };
      }
      this.envelopeMirror = result.envelope;
      this.sequenceMirror = Math.max(this.sequenceMirror, result.envelope.sequence);
      return result.envelope;
    }

    if (this.envelopeMirror) {
      return this.envelopeMirror;
    }

    const operations = this.migration.schemaQuarantine ? [] : await this.readPerOpRecords();
    this.sequenceMirror = Math.max(
      this.sequenceMirror,
      await this.readSequenceOnDisk(),
      operations.reduce((max, op) => Math.max(max, op.sequence), 0),
    );
    return {
      schemaVersion: SCHEMA_VERSION,
      sequence: this.sequenceMirror,
      operations,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Public migration entry point (AC 8). Reads whatever is stored, migrates v1
   * arrays to v2, quarantines unknown/newer/unparseable payloads, and returns a
   * result summary. The original payload is always preserved on quarantine.
   */
  async migrateQueue(): Promise<MigrationResult> {
    const raw = await this.readBlob();

    if (raw === null || raw === undefined) {
      // Possibly per-op records already (post-migration).
      this.expanded = true;
      const operations = await this.readPerOpRecords();
      this.sequenceMirror = Math.max(
        this.sequenceMirror,
        await this.readSequenceOnDisk(),
        operations.reduce((max, op) => Math.max(max, op.sequence), 0),
      );
      return {
        migrated: false,
        quarantined: this.migration.schemaQuarantine,
        schemaVersion: SCHEMA_VERSION,
        count: operations.length,
      };
    }

    const result = this.parseEnvelope(raw);
    if (result.kind === 'quarantine') {
      await this.quarantine(raw, result.reason, result.schemaVersion);
      return {
        migrated: false,
        quarantined: true,
        schemaVersion: result.schemaVersion,
        count: 0,
      };
    }

    // Normalise into per-op records (single canonical form on disk).
    const operations = result.envelope.operations;
    for (const op of operations) {
      await this.writePerOpRecord(op);
    }
    try {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } catch {
      /* ignore */
    }
    this.expanded = true;
    this.envelopeMirror = null;
    this.index = operations.map((op) => ({
      id: op.id,
      sequence: op.sequence,
      bytes: operationByteLength(op),
    }));
    this.sequenceMirror = Math.max(this.sequenceMirror, result.envelope.sequence);
    for (const op of operations) {
      this.sequenceMirror = Math.max(this.sequenceMirror, op.sequence);
    }
    await this.writeSequenceOnDisk(this.sequenceMirror);

    return {
      migrated: true,
      quarantined: false,
      schemaVersion: SCHEMA_VERSION,
      count: operations.length,
    };
  }

  // -- quarantine -----------------------------------------------------------

  private async quarantine(raw: string, reason: string, schemaVersion: number): Promise<void> {
    const record = {
      quarantinedAt: new Date().toISOString(),
      reason,
      schemaVersion,
      raw, // NEVER discarded — preserved verbatim for recovery
    };
    try {
      await AsyncStorage.setItem(QUARANTINE_KEY, JSON.stringify(record));
    } catch (error) {
      this.lastPersistError = error instanceof Error ? error.message : String(error);
    }
    this.migration = {
      ...this.migration,
      schemaQuarantine: true,
      quarantinedAt: record.quarantinedAt,
      quarantinedReason: reason,
      quarantinedRaw: raw,
    };
  }

  async getMigrationState(): Promise<MigrationState> {
    return { ...this.migration };
  }

  /** Quarantined corrupt per-op records, for export/recovery (never discarded). */
  async readPerOpQuarantine(): Promise<
    Array<{ sourceKey: string; raw: string; reason: string; quarantinedAt: string }>
  > {
    let keys: string[] = [];
    try {
      keys = (await AsyncStorage.getAllKeys()).filter((key) =>
        key.startsWith(PER_OP_QUARANTINE_PREFIX),
      );
    } catch {
      return [];
    }
    keys.sort();
    const records: Array<{ sourceKey: string; raw: string; reason: string; quarantinedAt: string }> = [];
    for (const key of keys) {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        records.push({
          sourceKey: typeof parsed.sourceKey === 'string' ? parsed.sourceKey : key,
          raw: typeof parsed.raw === 'string' ? parsed.raw : '',
          reason: typeof parsed.reason === 'string' ? parsed.reason : 'UNKNOWN',
          quarantinedAt: typeof parsed.quarantinedAt === 'string' ? parsed.quarantinedAt : '',
        });
      } catch {
        /* skip a corrupt quarantine record */
      }
    }
    return records;
  }

  async readQuarantine(): Promise<{ raw: string; reason: string; quarantinedAt: string; schemaVersion: number } | null> {
    try {
      const raw = await AsyncStorage.getItem(QUARANTINE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        raw: typeof parsed.raw === 'string' ? parsed.raw : '',
        reason: typeof parsed.reason === 'string' ? parsed.reason : 'UNKNOWN',
        quarantinedAt: typeof parsed.quarantinedAt === 'string' ? parsed.quarantinedAt : '',
        schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : -1,
      };
    } catch {
      return null;
    }
  }

  // -- enqueue --------------------------------------------------------------

  /**
   * Append an operation. The queue owns `id`, `sequence`, `timestamp`,
   * `retryCount` and `state`. Returns the stored operation, or `null` when the
   * record could not be persisted (quota) — callers must surface that, never
   * pretend it succeeded.
   */
  async enqueue(
    input: OfflineOperationInput,
    identity: { deviceId: string; userId?: string },
  ): Promise<OfflineOperation | null> {
    return this.writeMutex.runExclusive(async () => {
      await this.ensureExpanded();

      if (this.migration.schemaQuarantine) {
        return null;
      }

      if (this.index === null) await this.loadIndex();
      let currentIndex = this.index ?? [];

      // Bound (count) — archive (never delete) the oldest before appending.
      // `archiveOldestUnlocked` replaces `this.index` with a shorter copy, so we
      // must re-read it each iteration (never loop on a stale snapshot).
      while (currentIndex.length >= MAX_OPERATIONS) {
        const before = currentIndex.length;
        await this.archiveOldestUnlocked();
        currentIndex = this.index ?? [];
        if (currentIndex.length >= before) break; // no progress — avoid a livelock
      }

      const sequence = await this.allocateSequenceUnlocked();
      const operation: OfflineOperation = {
        id: createOperationId(sequence),
        sequence,
        entity: input.entity,
        op: input.op,
        payload: {
          method: input.payload.method,
          endpoint: input.payload.endpoint,
          ...(input.payload.body !== undefined ? { body: input.payload.body } : {}),
        },
        ...(input.version !== undefined ? { version: input.version } : {}),
        timestamp: new Date().toISOString(),
        identity: {
          deviceId: identity.deviceId,
          ...(identity.userId !== undefined ? { userId: identity.userId } : {}),
        },
        retryCount: 0,
        state: 'queued',
      };

      const bytes = await this.writePerOpRecord(operation);
      if (this.lastPersistError) {
        // The write failed (quota) — do not pretend the op is durable.
        return null;
      }
      currentIndex.push({ id: operation.id, sequence, bytes });
      this.index = currentIndex;
      this.envelopeMirror = null;

      // Bound (bytes) — archive oldest until we are back under the cap.
      await this.enforceByteBoundUnlocked();

      return operation;
    });
  }

  private async allocateSequenceUnlocked(): Promise<number> {
    // `writeMutex` already serialises enqueues; the sequence mutex is applied
    // too so the allocator stays correct when `nextSequence()` is called
    // directly alongside an enqueue (design §3.2).
    return this.sequenceMutex.runExclusive(async () => {
      const persisted = await this.readSequenceOnDisk();
      const next = Math.max(persisted, this.sequenceMirror) + 1;
      await this.writeSequenceOnDisk(next);
      this.sequenceMirror = next;
      return next;
    });
  }

  // -- reads ----------------------------------------------------------------

  /** Active operations, sorted by `sequence` (the replay order). */
  async getOperations(): Promise<OfflineOperation[]> {
    return this.writeMutex.runExclusive(async () => {
      const operations = await this.readActiveOperationsUnlocked();
      if (operations.length > 0) {
        this.sequenceMirror = Math.max(
          this.sequenceMirror,
          operations.reduce((max, op) => Math.max(max, op.sequence), 0),
        );
      }
      return sortOperations(operations);
    });
  }

  /** Alias kept for symmetry with the replay engine's vocabulary. */
  async getSortedOperations(): Promise<OfflineOperation[]> {
    return this.getOperations();
  }

  async hasOperations(): Promise<boolean> {
    const operations = await this.getOperations();
    return operations.length > 0;
  }

  async getCount(): Promise<number> {
    return (await this.getOperations()).length;
  }

  // -- mutations ------------------------------------------------------------

  async updateOperation(id: string, updates: Partial<OfflineOperation>): Promise<void> {
    await this.writeMutex.runExclusive(async () => {
      await this.ensureExpanded();
      const operations = await this.readActiveOperationsUnlocked();
      let changed = false;
      const next = operations.map((op) => {
        if (op.id !== id) return op;
        changed = true;
        return { ...op, ...updates, id: op.id, sequence: op.sequence };
      });
      if (!changed) return;
      await this.persistOperationsUnlocked(next);
    });
  }

  async removeOperation(id: string): Promise<void> {
    await this.writeMutex.runExclusive(async () => {
      await this.ensureExpanded();
      const operations = await this.readActiveOperationsUnlocked();
      const next = operations.filter((op) => op.id !== id);
      if (next.length === operations.length) return;
      await this.persistOperationsUnlocked(next);
    });
  }

  /**
   * Remove every ACTIVE operation. Archived operations are deliberately kept
   * (never destroy unsynced data implicitly — design §9).
   */
  async clearActive(): Promise<void> {
    await this.writeMutex.runExclusive(async () => {
      await this.ensureExpanded();
      await this.persistOperationsUnlocked([]);
    });
  }

  /**
   * Write the given operation set in the canonical per-op form.
   * NOTE: `enqueue()` does NOT go through here — it takes the O(1) append path
   * (`writePerOpRecord`) so a burst of enqueues is not O(n²) in bytes.
   */
  private async persistOperationsUnlocked(operations: OfflineOperation[]): Promise<void> {
    const sorted = sortOperations(operations);
    const bytes = await Promise.all(sorted.map((op) => this.writePerOpRecord(op)));
    await this.clearPerOpRecordsNotIn(sorted.map((op) => perOpKey(op)));
    this.index = sorted.map((op, i) => ({ id: op.id, sequence: op.sequence, bytes: bytes[i] ?? 0 }));
    this.envelopeMirror = null;
    this.expanded = true;
  }

  // -- bounds & archival ----------------------------------------------------

  /**
   * Enforce the byte cap by ARCHIVING the oldest operations. Eviction is
   * archival, never deletion (AC 14 reconciled with AC 10): archived ops stay
   * on disk, are counted/surfaced, and are included in export.
   */
  private async enforceByteBoundUnlocked(): Promise<void> {
    let guard = 0;
    while (guard < MAX_OPERATIONS + 1) {
      guard += 1;
      const totalBytes = (this.index ?? []).reduce((sum, entry) => sum + entry.bytes, 0);
      if (totalBytes <= MAX_TOTAL_BYTES) break;
      const archived = await this.archiveOldestUnlocked();
      if (!archived) break;
    }
  }

  /**
   * Move the oldest active operation to the archive. Never deletes it.
   *
   * O(1)-ish: `this.index` is maintained in ascending-`sequence` order, so the
   * oldest op is `index[0]` — no full scan of the active set is required, which
   * keeps eviction cheap under a burst of enqueues.
   */
  private async archiveOldestUnlocked(): Promise<OfflineOperation | null> {
    if (this.index === null) await this.loadIndex();
    const index = this.index ?? [];
    const oldestEntry = index[0];
    if (!oldestEntry) return null;

    const key = `${PER_OP_PREFIX}${padSequence(oldestEntry.sequence)}:${oldestEntry.id}`;
    let operation: OfflineOperation | null = null;
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) operation = JSON.parse(raw) as OfflineOperation;
    } catch {
      /* treat as missing */
    }
    if (!operation) {
      // The record is gone — drop the stale index entry to avoid a livelock.
      this.index = index.slice(1);
      return null;
    }

    const archived: ArchivedOperation = { ...operation, archivedAt: new Date().toISOString() };
    // Append-only so eviction is O(1) — never re-serialise the whole archive.
    try {
      await AsyncStorage.setItem(
        `${ARCHIVE_PREFIX}${padSequence(oldestEntry.sequence)}:${oldestEntry.id}`,
        JSON.stringify(archived),
      );
    } catch (error) {
      this.lastPersistError = error instanceof Error ? error.message : String(error);
      return null;
    }
    await this.incrementArchivedCount();
    await this.removePerOpRecord(key);
    this.index = index.slice(1);
    return operation;
  }

  /** Archived operations, oldest first. */
  async readArchive(): Promise<ArchivedOperation[]> {
    let keys: string[] = [];
    try {
      keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(ARCHIVE_PREFIX));
    } catch {
      return [];
    }
    keys.sort();
    const archive: ArchivedOperation[] = [];
    for (const key of keys) {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const op = normalizeRawOperation(parsed, archive.length + 1_000_000);
        if (op) {
          archive.push({
            ...op,
            archivedAt: typeof parsed.archivedAt === 'string' ? parsed.archivedAt : '',
          });
        }
      } catch {
        /* skip */
      }
    }
    return archive;
  }

  private async incrementArchivedCount(): Promise<void> {
    const current = await this.getArchivedCount();
    await this.writeArchivedCount(current + 1);
  }

  private async writeArchivedCount(count: number): Promise<void> {
    try {
      await AsyncStorage.setItem(ARCHIVED_COUNT_KEY, String(count));
    } catch (error) {
      this.lastPersistError = error instanceof Error ? error.message : String(error);
    }
  }

  async getArchivedCount(): Promise<number> {
    try {
      const raw = await AsyncStorage.getItem(ARCHIVED_COUNT_KEY);
      const parsed = raw !== null ? parseInt(raw, 10) : 0;
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    } catch {
      /* fall through */
    }
    // Fallback: count the append-only archive records directly.
    try {
      const keys = await AsyncStorage.getAllKeys();
      return keys.filter((key) => key.startsWith(ARCHIVE_PREFIX)).length;
    } catch {
      return 0;
    }
  }

  /** Counts + limit flags for the UI/banner. */
  async getStats(): Promise<QueueStats> {
    const operations = await this.getOperations();
    const bytes = operations.reduce((sum, op) => sum + operationByteLength(op), 0);
    const count = operations.length;
    return {
      count,
      archivedCount: await this.getArchivedCount(),
      nearLimit: count >= SOFT_LIMIT || bytes >= MAX_TOTAL_BYTES * 0.8,
      atLimit: count >= MAX_OPERATIONS || bytes >= MAX_TOTAL_BYTES,
      bytes,
    };
  }

  /** Best-effort quota error surfaced from the last write. */
  getLastPersistError(): string | null {
    return this.lastPersistError;
  }

  // -- testing helpers ------------------------------------------------------

  /**
   * Reset in-memory caches (and, by default, all storage keys this module owns).
   * Used by tests to simulate a cold restart.
   */
  async resetForTesting(options: { clearStorage?: boolean } = {}): Promise<void> {
    const clearStorage = options.clearStorage ?? true;
    this.envelopeMirror = null;
    this.index = null;
    this.expanded = false;
    this.sequenceMirror = 0;
    this.lastPersistError = null;
    this.perOpQuarantinedKeys = new Set();
    this.migration = {
      schemaQuarantine: false,
      quarantinedAt: null,
      quarantinedReason: null,
      quarantinedRaw: null,
      perOpQuarantinedCount: 0,
    };
    if (!clearStorage) return;

    try {
      const keys = await AsyncStorage.getAllKeys();
      const owned = keys.filter(
        (key) =>
          key === QUEUE_KEY ||
          key === ARCHIVE_KEY ||
          key === QUARANTINE_KEY ||
          key === SEQUENCE_KEY ||
          key === ARCHIVED_COUNT_KEY ||
          isPerOpKey(key) ||
          key.startsWith(PER_OP_QUARANTINE_PREFIX) ||
          key.startsWith(ARCHIVE_PREFIX),
      );
      if (owned.length > 0) await AsyncStorage.multiRemove(owned);
    } catch {
      /* ignore */
    }
  }
}

/** Singleton instance, mirroring the `syncManager` singleton pattern. */
export const offlineQueue = OfflineQueue.getInstance();

export default offlineQueue;
