/**
 * offlineExport.ts — Story 6.5 / T03: offline state export & restore (AC 4, 8, 12, 16).
 *
 * Implements `docs/stories/6.5.design.md` §7.1–7.2: a deterministic snapshot of
 * the offline queue + archive + cached-session blob that a user can copy out,
 * and an additive, deduplicated restore that can rebuild local state after a
 * wipe.
 *
 * ## Privacy (C7 fix — design §7.2)
 * The export carries session names and device ids (already local to the device)
 * but **never** credentials. `accessToken` / `refreshToken` (and anything else
 * matching a small sensitive-key denylist) are **stripped** from `identity` and
 * `cached` by `stripSensitive()` — we drop the keys rather than spread the blob
 * blindly, so a future addition to the cached snapshot cannot leak a token.
 *
 * The device identity is resolved via **`DeviceService.getDeviceId()`**
 * (storage key `@badminton_device_id`) — NOT `StorageService.getDeviceId()`
 * (`device_id`). The two keys are unrelated; using the wrong one would produce a
 * stable-looking but incorrect identity and defeat the AC 16 scoping check.
 *
 * ## Purity
 * `serialize()` and `parse()` are pure and side-effect-free (the §12 round-trip
 * test therefore needs no storage mock). `exportOfflineState()` /
 * `restoreOfflineState()` are the impure wrappers that touch storage/device.
 *
 * ## Schema versioning
 * `schemaVersion` is written from `offlineQueue.SCHEMA_VERSION` and re-validated
 * on restore. A file with a **newer** version is rejected outright (never
 * coerced); a missing / older / legacy shape is rejected too (never silently
 * trusted) — see `parse()`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceService from './deviceService';
import { StorageService } from './storageService';
import {
  offlineQueue,
  OfflineOperation,
  ArchivedOperation,
  SCHEMA_VERSION,
} from './offlineQueue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Identity block written into / compared from the export document. */
export interface ExportIdentity {
  deviceId: string;
  userId: string | null;
}

/** The serialisable export document (§7.1). */
export interface ExportState {
  schemaVersion: number;
  exportedAt: string;
  identity: ExportIdentity;
  queue: OfflineOperation[];
  archive: ArchivedOperation[];
  cached: Record<string, unknown>;
}

export type ParseResult =
  | { ok: true; state: ExportState }
  | { ok: false; reason: string };

export interface RestoreOptions {
  /**
   * Skip the AC 16 identity check. Only pass this from an explicit
   * user-confirmed "restore another device's backup" path.
   */
  allowIdentityMismatch?: boolean;
}

export interface RestoreResult {
  ok: boolean;
  reason?: string;
  /** Operations added to the active queue (active + archived sources). */
  merged?: number;
  /** Entries skipped as duplicates / already present. */
  skipped?: number;
}

// ---------------------------------------------------------------------------
// Reason codes (stable strings — surfaced by the UI / logged)
// ---------------------------------------------------------------------------

export const RESTORE_REASON = {
  IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
  SCHEMA_TOO_NEW: 'SCHEMA_VERSION_TOO_NEW',
  SCHEMA_TOO_OLD: 'SCHEMA_VERSION_TOO_OLD',
  SCHEMA_MISSING: 'SCHEMA_VERSION_MISSING',
  MALFORMED: 'MALFORMED_EXPORT',
  NOT_AN_OBJECT: 'NOT_AN_OBJECT',
} as const;

// ---------------------------------------------------------------------------
// Privacy: strip credentials (never spread a snapshot blob blindly)
// ---------------------------------------------------------------------------

/** Keys whose values must never appear in an export document. */
const SENSITIVE_KEYS = new Set([
  'accesstoken',
  'refreshtoken',
  'token',
  'tokens',
  'password',
  'passwordhash',
  'authorization',
  'secret',
  'clientsecret',
  'organizersecrethash',
  'bearer',
]);

/**
 * Recursively drop any key in `SENSITIVE_KEYS` (case-insensitive) from an
 * object graph, returning a fresh value. Arrays are mapped; primitives pass
 * through. This is a *whitelist-by-structure, blacklist-by-key* stripper: unknown
 * future fields survive, credential-shaped fields never do.
 */
export function stripSensitive<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripSensitive(entry)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
      output[key] = stripSensitive(entry);
    }
    return output as unknown as T;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Deterministic serialisation — fixed key order, pretty-printed for humans. */
export function serialize(state: ExportState): string {
  const doc: ExportState = {
    schemaVersion: state.schemaVersion,
    exportedAt: state.exportedAt,
    identity: {
      deviceId: state.identity.deviceId,
      userId: state.identity.userId,
    },
    queue: state.queue,
    archive: state.archive,
    cached: state.cached,
  };
  return JSON.stringify(doc, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate + normalise the raw `queue`/`archive` arrays without trusting them. */
function toOperationArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Parse a raw export string. **Never throws** — malformed input, a newer schema
 * version, and an identity mismatch all return `{ ok: false, reason }`.
 *
 * @param raw              the export document text.
 * @param currentIdentity  when supplied, the file's `identity.deviceId` is
 *                         compared against it and a mismatch short-circuits with
 *                         `IDENTITY_MISMATCH`. Omitting it keeps `parse` fully
 *                         pure (structure + schema validation only).
 */
export function parse(raw: string, currentIdentity?: ExportIdentity): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: RESTORE_REASON.MALFORMED };
  }

  if (!isRecord(parsed)) {
    return { ok: false, reason: RESTORE_REASON.NOT_AN_OBJECT };
  }

  // --- schema version re-validation (never coerce) --------------------------
  const version = parsed.schemaVersion;
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return { ok: false, reason: RESTORE_REASON.SCHEMA_MISSING };
  }
  if (version > SCHEMA_VERSION) {
    return { ok: false, reason: RESTORE_REASON.SCHEMA_TOO_NEW };
  }
  if (version < SCHEMA_VERSION) {
    return { ok: false, reason: RESTORE_REASON.SCHEMA_TOO_OLD };
  }

  // --- identity (AC 16) -----------------------------------------------------
  const identityRaw = isRecord(parsed.identity) ? parsed.identity : {};
  const identity: ExportIdentity = {
    deviceId: typeof identityRaw.deviceId === 'string' ? identityRaw.deviceId : '',
    userId: typeof identityRaw.userId === 'string' ? identityRaw.userId : null,
  };

  if (currentIdentity && identity.deviceId !== currentIdentity.deviceId) {
    return { ok: false, reason: RESTORE_REASON.IDENTITY_MISMATCH };
  }

  const state: ExportState = {
    schemaVersion: version,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    identity,
    queue: toOperationArray(parsed.queue) as OfflineOperation[],
    archive: toOperationArray(parsed.archive) as ArchivedOperation[],
    cached: stripSensitive(isRecord(parsed.cached) ? parsed.cached : {}),
  };

  return { ok: true, state };
}

/**
 * A stable content fingerprint for an operation, used to make restore
 * idempotent. `id` alone is insufficient because the queue **owns** `id` and
 * re-stamps it on `enqueue()` (T01 contract — a caller may not supply an id), so
 * a second import of the same file would otherwise duplicate every op.
 */
export function fingerprint(op: {
  entity?: unknown;
  op?: unknown;
  payload?: { method?: unknown; endpoint?: unknown; body?: unknown };
  version?: unknown;
}): string {
  const payload = op.payload ?? {};
  let body = '';
  try {
    body = payload.body === undefined ? '' : JSON.stringify(payload.body);
  } catch {
    body = String(payload.body);
  }
  return [
    String(op.entity ?? ''),
    String(op.op ?? ''),
    String(payload.method ?? ''),
    String(payload.endpoint ?? ''),
    body,
    String(op.version ?? ''),
  ].join('|');
}

// ---------------------------------------------------------------------------
// Impure wrappers
// ---------------------------------------------------------------------------

/** Read the current device identity (`DeviceService`, not `StorageService`). */
async function readCurrentIdentity(): Promise<ExportIdentity> {
  const deviceId = await DeviceService.getDeviceId().catch(() => '');
  let userId: string | null = null;
  try {
    userId = await AsyncStorage.getItem('userId');
  } catch {
    userId = null;
  }
  return { deviceId, userId };
}

/** Assemble the export document from live storage (queue + archive + cache). */
export async function buildExportState(): Promise<ExportState> {
  const [queue, archive, identity, cached] = await Promise.all([
    offlineQueue.getSortedOperations(),
    offlineQueue.readArchive(),
    readCurrentIdentity(),
    StorageService.getCachedSessionsSnapshot(),
  ]);

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    identity,
    queue,
    archive,
    // Tokens can never reach here: `cached` comes from the snapshot reader and
    // is stripped again defensively.
    cached: stripSensitive(cached),
  };
}

/** Assemble + serialise the offline state into a portable string. */
export async function exportOfflineState(): Promise<string> {
  return serialize(await buildExportState());
}

/**
 * Parse + additively merge an export document into local state.
 *
 * - **Identity scoping (AC 16):** the file's device id must match the current
 *   one unless `opts.allowIdentityMismatch` is set.
 * - **Never overwrites:** existing operations are kept; incoming entries are
 *   deduplicated by `id` and by content fingerprint (so re-importing the same
 *   file is a no-op).
 * - **Archive is restored** too: archived entries are unsynced data retained by
 *   the bound policy, so they are merged back into the active queue (never lost
 *   — AC 10/14).
 * - **Cached sessions** merge additively (existing keys win).
 */
export async function restoreOfflineState(
  raw: string,
  opts: RestoreOptions = {},
): Promise<RestoreResult> {
  const currentIdentity = await readCurrentIdentity();

  // Pure parse; pass the identity only when the caller did NOT opt out, so a
  // mismatch is rejected before any write.
  const parsed = opts.allowIdentityMismatch
    ? parse(raw)
    : parse(raw, currentIdentity);

  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason };
  }

  const { state } = parsed;

  const existing = await offlineQueue.getSortedOperations();
  const seenIds = new Set(existing.map((op) => op.id));
  const seenFingerprints = new Set(existing.map((op) => fingerprint(op)));

  let merged = 0;
  let skipped = 0;

  // Restore identity for the enqueued records = the CURRENT device (the ops now
  // belong to this device's queue), not the file's.
  const identity = {
    deviceId: currentIdentity.deviceId,
    ...(currentIdentity.userId ? { userId: currentIdentity.userId } : {}),
  };

  // Active queue first, then archived (both merge into the active queue so the
  // recovered work replays).
  const sources: Array<OfflineOperation | ArchivedOperation> = [
    ...state.queue,
    ...state.archive,
  ];

  for (const entry of sources) {
    const id = typeof (entry as OfflineOperation).id === 'string' ? (entry as OfflineOperation).id : '';
    const print = fingerprint(entry as Partial<OfflineOperation>);

    if ((id && seenIds.has(id)) || seenFingerprints.has(print)) {
      skipped += 1;
      continue;
    }

    const payload = (entry as OfflineOperation).payload;
    if (!payload || typeof payload.endpoint !== 'string' || typeof payload.method !== 'string') {
      // Structurally unusable record — count it, never throw.
      skipped += 1;
      continue;
    }

    const stored = await offlineQueue.enqueue(
      {
        entity: (entry as OfflineOperation).entity ?? 'unknown',
        op: (entry as OfflineOperation).op ?? 'unknown',
        payload: {
          method: payload.method,
          endpoint: payload.endpoint,
          ...(payload.body !== undefined ? { body: payload.body } : {}),
        },
        ...(typeof (entry as OfflineOperation).version === 'number'
          ? { version: (entry as OfflineOperation).version }
          : {}),
      },
      identity,
    );

    if (stored) {
      merged += 1;
      seenIds.add(stored.id);
      seenFingerprints.add(print);
    } else {
      // Persistence refused (quota / quarantine) — do not pretend success.
      skipped += 1;
    }
  }

  // Cached sessions — additive, existing keys win (non-authoritative cache).
  await StorageService.mergeCachedSessions(state.cached);

  return { ok: true, merged, skipped };
}

// ---------------------------------------------------------------------------
// Delivery (dependency-free minimum — design §7.2)
// ---------------------------------------------------------------------------

/**
 * Hand the export string to the user. Uses `expo-clipboard` when available
 * (optional `require`, guarded by try/catch so a missing/optional module cannot
 * break the bundle) and, on web, additionally triggers a `Blob` download.
 * Returns which channels fired. Never throws.
 */
export async function deliverExport(raw: string): Promise<{ copied: boolean; downloaded: boolean }> {
  let copied = false;
  let downloaded = false;

  // Clipboard — optional require (expo-clipboard is a dependency, but an
  // unavailable native module must degrade, not crash the export path).
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-clipboard') as { setStringAsync?: (s: string) => Promise<boolean> };
    if (typeof mod?.setStringAsync === 'function') {
      await mod.setStringAsync(raw);
      copied = true;
    }
  } catch {
    /* expo-clipboard unavailable — fall through to the download path */
  }

  // Web download — guarded so native simply skips it.
  try {
    const g = globalThis as unknown as {
      document?: { createElement: (tag: string) => any };
      Blob?: new (parts: string[], opts?: { type?: string }) => unknown;
      URL?: { createObjectURL?: (b: unknown) => string; revokeObjectURL?: (u: string) => void };
    };
    if (g.document && g.Blob && g.URL?.createObjectURL) {
      const blob = new g.Blob([raw], { type: 'application/json' });
      const url = g.URL.createObjectURL(blob);
      const anchor = g.document.createElement('a');
      anchor.href = url;
      anchor.download = `rally-offline-export-${Date.now()}.json`;
      anchor.click();
      g.URL.revokeObjectURL?.(url);
      downloaded = true;
    }
  } catch {
    /* download unavailable (native) — clipboard is the primary path */
  }

  return { copied, downloaded };
}

export default {
  serialize,
  parse,
  exportOfflineState,
  restoreOfflineState,
  buildExportState,
  deliverExport,
  stripSensitive,
  fingerprint,
  RESTORE_REASON,
};
