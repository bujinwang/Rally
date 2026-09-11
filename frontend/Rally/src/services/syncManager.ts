import NetInfo from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from './storageService';
import { authFetch } from './authFetch';
import DeviceService from './deviceService';
import socketService from './socketService';
import { conflictDetected, ConflictRecord } from '../store/slices/syncSlice';
import { sessionUpdated } from '../store/slices/realTimeSlice';
import {
  offlineQueue,
  OfflineOperation,
  OfflineOperationInput,
  OperationMethod,
  computeBackoffDelay,
  MAX_ATTEMPTS,
} from './offlineQueue';

/**
 * Legacy queue input — `{ type, payload: { endpoint, data } }`.
 * Still accepted so `apiService.ts` keeps compiling (T02 migrates the call
 * sites to the new shape).
 */
export interface LegacyQueueOperation {
  type: string;
  payload?: {
    endpoint?: string;
    data?: unknown;
    method?: OperationMethod;
    body?: unknown;
    [key: string]: unknown;
  };
  identity?: { deviceId?: string; userId?: string };
}

/** New queue input — `{ entity, op, payload: { method, endpoint, body } }`. */
export interface NewQueueOperation {
  entity: string;
  op: string;
  payload: { method: OperationMethod; endpoint: string; body?: unknown };
  version?: number;
  identity?: { deviceId?: string; userId?: string };
}

export type QueueOperationInput = LegacyQueueOperation | NewQueueOperation;

/**
 * Full response taxonomy (design §4.2). `conflict` is the `409
 * VERSION_CONFLICT` path; every other outcome **retains** the operation.
 */
export type SyncOutcome =
  | { kind: 'success' }
  | { kind: 'conflict'; record: ConflictRecord }
  | { kind: 'permanent'; error: { code: string; message: string; status?: number } }
  | { kind: 'retryable'; error: { code: string; message: string; status?: number } };

const USER_ID_STORAGE_KEY = 'userId';

/**
 * Endpoint path segments that appear directly after `/mvp-sessions/` but are
 * NOT a session id — used by `extractSessionId` when emitting the replay
 * freshness signal.
 */
const NON_SESSION_SEGMENTS = new Set([
  'join',
  'claim',
  'my-sessions',
  'terminate',
  'reactivate',
  'players',
  'discovery',
  'config',
]);

// ---------------------------------------------------------------------------
// Action-dispatch bus
//
// `SyncManager` needs to push Redux actions (conflict records + the replay
// freshness signal) without importing the store (which would create a cycle:
// store → slices → services → store). The app registers `store.dispatch` at
// startup; tests register their own capture. When no dispatcher is registered
// the calls are inert no-ops, so the manager still works standalone.
// ---------------------------------------------------------------------------

type DispatchFn = (action: unknown) => void;

let dispatchAction: DispatchFn | null = null;

/** Register the Redux dispatcher (called once from `store/index.ts`). */
export function setSyncDispatch(fn: DispatchFn | null): void {
  dispatchAction = fn;
}

/** Clear the registered dispatcher (test isolation). */
export function resetSyncDispatch(): void {
  dispatchAction = null;
}

/**
 * Push a Redux action through the registered dispatcher (no-op when none is
 * registered). Used by `apiService` to surface a direct-online
 * `409 VERSION_CONFLICT` into the shared `sync.conflicts[]` **without**
 * importing the store (which would create a store → slice → service → store
 * import cycle).
 */
export function dispatchSyncAction(action: unknown): void {
  if (!dispatchAction) return;
  try {
    dispatchAction(action);
  } catch (error) {
    console.warn('⚠️ Failed to dispatch sync action', error);
  }
}

/** Map a legacy operation `type` to an HTTP method (best-effort, back-compat). */
function methodForLegacyType(type: string): OperationMethod {
  switch (type) {
    case 'UPDATE_SESSION':
    case 'UPDATE_PLAYER':
    case 'UPDATE_PLAYER_STATUS':
      return 'PUT';
    case 'DELETE_SESSION':
    case 'REMOVE_PLAYER':
      return 'DELETE';
    default:
      return 'POST';
  }
}

/** Map a legacy operation `type` to a coarse entity label (display only). */
function entityForLegacyType(type: string): string {
  if (type.includes('PLAYER')) return 'player';
  if (type.includes('GAME')) return 'game';
  if (type.includes('ROTATION')) return 'rotation';
  if (type.includes('SESSION')) return 'session';
  return 'unknown';
}

/** True when the input already uses the new `{ entity, payload.method }` shape. */
function isNewShape(input: QueueOperationInput): input is NewQueueOperation {
  const candidate = input as NewQueueOperation;
  return typeof candidate.entity === 'string' && typeof candidate.payload?.method === 'string';
}

/**
 * Turn either input shape into the canonical `OfflineOperationInput`.
 * `entity`/`op` are labels only — the payload is replayed verbatim.
 */
export function normalizeOperation(input: QueueOperationInput): OfflineOperationInput {
  if (isNewShape(input)) {
    return {
      entity: input.entity,
      op: input.op,
      payload: {
        method: input.payload.method,
        endpoint: input.payload.endpoint,
        ...(input.payload.body !== undefined ? { body: input.payload.body } : {}),
      },
      ...(input.version !== undefined ? { version: input.version } : {}),
    };
  }

  const legacy = input as LegacyQueueOperation;
  const endpoint = legacy.payload?.endpoint ?? '';
  const body = legacy.payload?.body ?? legacy.payload?.data;

  return {
    entity: entityForLegacyType(legacy.type),
    op: legacy.type,
    payload: {
      method: legacy.payload?.method ?? methodForLegacyType(legacy.type),
      endpoint,
      ...(body !== undefined ? { body } : {}),
    },
  };
}

/**
 * Pull the `sessionId` (the first `/mvp-sessions/<id>` path segment) out of a
 * replay endpoint so the freshness signal can name the session. Returns `null`
 * for endpoints that do not address a specific session.
 */
export function extractSessionId(endpoint: string): string | null {
  const match = endpoint.match(/\/mvp-sessions\/([^/?#]+)/);
  if (!match) return null;
  const segment = match[1];
  if (!segment || NON_SESSION_SEGMENTS.has(segment)) return null;
  return segment;
}

/**
 * Derive the **keyed** identity of the object an operation mutates, used for
 * head-of-line ordering (§4.3). Two ops for *different* objects must be
 * independent (they are separate server rows), and two ops for the *same*
 * object must stay strictly ordered.
 *
 * The coarse `operation.entity` label ('player'/'session') is NOT used for
 * blocking: it would let a failure on player `p1` stall independent players
 * `p2`/`p3`. Instead we key on the concrete target parsed from the endpoint
 * (player/game/match id, else the session id), falling back to the coarse label
 * only when no sub-entity can be identified.
 */
export function entityKey(operation: { entity?: string; payload?: { endpoint?: string } }): string {
  const endpoint = operation.payload?.endpoint ?? '';
  const player = endpoint.match(/\/players\/([^/?#]+)/);
  if (player?.[1]) return `player:${player[1]}`;
  const game = endpoint.match(/\/games\/([^/?#]+)/);
  if (game?.[1]) return `game:${game[1]}`;
  const match = endpoint.match(/\/matches\/([^/?#]+)/);
  if (match?.[1]) return `match:${match[1]}`;
  const session = extractSessionId(endpoint);
  if (session) return `session:${session}`;
  return `entity:${operation.entity ?? 'unknown'}`;
}

export interface SyncStatus {
  // Pre-existing fields — kept for back-compat (AC 6).
  isOnline: boolean;
  syncInProgress: boolean;
  pendingOperations: number;
  lastSyncTime: string | null;
  // Additive (Story 6.5).
  state: 'idle' | 'queued' | 'syncing' | 'conflict' | 'failed';
  queuedCount: number;
  failedCount: number;
  conflictCount: number;
  archivedCount: number;
  queueNearLimit: boolean;
  schemaQuarantine: boolean;
}

export class SyncManager {
  private static instance: SyncManager;
  private isOnline: boolean = false;
  private syncInProgress: boolean = false;
  /** Unresolved conflicts surfaced to the UI (AC 9 — always visible). */
  private conflicts: ConflictRecord[] = [];

  private constructor() {
    this.initializeFlushTriggers();
  }

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  // -------------------------------------------------------------------------
  // Flush triggers (design §4.4) — all funnel through the guarded startSync().
  // -------------------------------------------------------------------------

  private initializeFlushTriggers(): void {
    // 1. NetInfo offline→online transition (existing).
    NetInfo.addEventListener((state) => {
      const wasOffline = !this.isOnline;
      this.isOnline = state.isConnected ?? false;

      if (wasOffline && this.isOnline) {
        console.log('🔄 Network restored, starting sync...');
        void this.startSync();
      } else if (!this.isOnline) {
        console.log('📴 Network lost, going offline...');
      }
    });

    // 2. Socket `connect` (reuses the 6.4 real-time transport — AC 5).
    socketService.on('connect', () => {
      this.isOnline = true;
      void this.startSync();
    });

    // 3. App foreground.
    AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        void this.startSync();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Enqueue
  // -------------------------------------------------------------------------

  /**
   * Queue an operation for offline replay.
   *
   * Accepts **both** the legacy `{ type, payload: { endpoint, data } }` shape
   * and the new `{ entity, op, payload: { method, endpoint, body }, version }`
   * shape; both are normalised into the canonical record. `id`, `sequence`,
   * `timestamp` and `retryCount` are owned by `offlineQueue`. Signature is
   * unchanged for back-compat (AC 6).
   */
  async queueOperation(operation: QueueOperationInput): Promise<void> {
    const normalized = normalizeOperation(operation);

    const identity = {
      deviceId:
        operation.identity?.deviceId ?? (await DeviceService.getDeviceId().catch(() => '')),
      ...(await this.resolveUserId(operation)),
    };

    const stored = await offlineQueue.enqueue(normalized, identity);
    if (!stored) {
      console.warn('⚠️ Offline operation could not be persisted — not queued');
      return;
    }

    // 4. Flush immediately when we are already online.
    if (this.isOnline) {
      void this.startSync();
    }
  }

  /** Best-effort user id resolution (`auth.user.id`), without a store import. */
  private async resolveUserId(operation: QueueOperationInput): Promise<{ userId?: string }> {
    if (operation.identity?.userId) return { userId: operation.identity.userId };
    try {
      const userId = await AsyncStorage.getItem(USER_ID_STORAGE_KEY);
      return userId ? { userId } : {};
    } catch {
      return {};
    }
  }

  // -------------------------------------------------------------------------
  // Replay engine
  // -------------------------------------------------------------------------

  /** Set the connectivity flag (NetInfo listener + tests use this). */
  setOnline(online: boolean): void {
    this.isOnline = online;
  }

  /** Current connectivity flag (read-only). */
  getIsOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Replay the queue sequentially, sorted by `sequence` (the ordering key).
   * Guarded by `syncInProgress` so overlapping triggers are a no-op.
   *
   * **Never-drop invariant (AC 10):** an operation leaves the active queue only
   * on a `2xx`, on a `409 VERSION_CONFLICT` being recorded as a conflict
   * (replaced, not lost), or on an explicit user dismissal. Every other outcome
   * (retryable or permanent) **retains** the op.
   */
  private async startSync(): Promise<void> {
    if (this.syncInProgress || !this.isOnline) {
      return;
    }

    this.syncInProgress = true;
    console.log('🔄 Starting sync process...');

    // Sessions whose authoritative state was refreshed by this batch — used for
    // the reusable real-time freshness channel (§8.1, AC 7).
    const touchedSessions = new Set<string>();
    let anyReplayed = false;

    try {
      const operations = await offlineQueue.getOperations(); // sorted by sequence

      if (operations.length === 0) {
        console.log('✅ Sync complete - no pending operations');
        return;
      }

      console.log(`📋 Processing ${operations.length} sync operations...`);

      // Keyed entities blocked by an earlier unsatisfied outcome this pass.
      // Only ops for the SAME concrete object are held back — different objects
      // are independent (design §4.3). A block is added whenever an op is
      // *not* satisfied (retryable / permanent / skipped-because-failed /
      // within-backoff), so a later op for the same object can never overtake it.
      const blockedEntities = new Set<string>();

      for (const operation of operations) {
        const key = entityKey(operation);

        if (blockedEntities.has(key)) {
          continue;
        }

        // A permanently-failed op is retained for export/manual retry and is
        // NOT retried automatically — but later ops for the same object must
        // still queue behind it (it is unresolved, not gone).
        if (operation.state === 'failed') {
          blockedEntities.add(key);
          continue;
        }

        // Backoff gate for previously-retried ops: still unresolved, so later
        // ops for the same object must not overtake it this pass.
        if (operation.retryCount > 0 && this.isWithinBackoff(operation)) {
          blockedEntities.add(key);
          continue;
        }

        anyReplayed = true;
        const outcome = await this.processSyncOperation(operation);

        if (outcome.kind === 'success') {
          // ONLY a 2xx removes the operation (the sole automatic removal path).
          await offlineQueue.removeOperation(operation.id);
          const sessionId = extractSessionId(operation.payload.endpoint);
          if (sessionId) touchedSessions.add(sessionId);
          console.log(`✅ Synced operation: ${operation.op}`);
        } else if (outcome.kind === 'conflict') {
          // 409 VERSION_CONFLICT — server wins (LWW). The op is replaced by a
          // conflict record, never lost (AC 2/9). The object is now resolved to
          // the server's authoritative state, so later same-object ops may
          // proceed (the client must re-apply with the fresh version).
          await offlineQueue.removeOperation(operation.id);
          this.recordConflict(outcome.record);
          // A conflicted session still needs to refresh to authoritative state.
          if (outcome.record.serverVersion !== null) {
            const sessionId = extractSessionId(operation.payload.endpoint);
            if (sessionId) touchedSessions.add(sessionId);
          }
          console.warn(`⚠️ Conflict recorded (server wins): ${operation.op}`);
        } else if (outcome.kind === 'permanent') {
          // Retain + surface; stop retrying automatically. Block later ops on
          // the same object (they depend on this one landing).
          await offlineQueue.updateOperation(operation.id, {
            state: 'failed',
            lastError: outcome.error,
            lastAttemptAt: new Date().toISOString(),
            ...(operation.firstAttemptAt ? {} : { firstAttemptAt: new Date().toISOString() }),
          });
          blockedEntities.add(key);
          console.warn(`⚠️ Permanent failure, retained: ${operation.op}`, outcome.error);
        } else {
          // Retryable: increment the retry count and back off (kept). The op is
          // unresolved, so it blocks later ops on the SAME object — otherwise a
          // newer mutation would overtake and land on the server out of order
          // (design §4.3).
          const retryCount = operation.retryCount + 1;
          const nextState = retryCount >= MAX_ATTEMPTS ? 'failed' : 'queued';
          await offlineQueue.updateOperation(operation.id, {
            retryCount,
            state: nextState,
            lastError: outcome.error,
            lastAttemptAt: new Date().toISOString(),
            ...(operation.firstAttemptAt ? {} : { firstAttemptAt: new Date().toISOString() }),
          });
          blockedEntities.add(key);
          console.warn(`↩️ Retryable failure (attempt ${retryCount}), retained: ${operation.op}`);
        }
      }

      await StorageService.setLastSyncTimestamp(new Date().toISOString());
      console.log('✅ Sync process completed');
    } catch (error) {
      console.error('❌ Sync process failed:', error);
    } finally {
      this.syncInProgress = false;
      // Emit the reusable freshness signal AFTER the batch (design §8.1).
      if (anyReplayed) {
        this.emitReplayFreshness(touchedSessions);
      }
    }
  }

  /**
   * Dispatch the real-time freshness signal through the *same* channel as
   * socket/polling updates, with the new `'offline-replay'` source (AC 7).
   * `sessionUpdated` clears that session's `pendingUpdates`, so a replayed
   * mutation reconciles exactly like an online update.
   */
  private emitReplayFreshness(sessionIds: Set<string>): void {
    if (sessionIds.size === 0) return;
    const timestamp = new Date().toISOString();
    for (const sessionId of sessionIds) {
      this.dispatch(
        sessionUpdated({ sessionId, timestamp, source: 'offline-replay' }),
      );
    }
  }

  /** Record + surface a conflict (deduplicated by `opId`). */
  private recordConflict(record: ConflictRecord): void {
    this.conflicts = [...this.conflicts.filter((c) => c.opId !== record.opId), record];
    this.dispatch(conflictDetected(record));
  }

  /** Dispatch a Redux action if a dispatcher is registered (else no-op). */
  private dispatch(action: unknown): void {
    if (!dispatchAction) return;
    try {
      dispatchAction(action);
    } catch (error) {
      console.warn('⚠️ Failed to dispatch sync action', error);
    }
  }

  /** True while the op is still inside its exponential-backoff window. */
  private isWithinBackoff(operation: OfflineOperation): boolean {
    if (!operation.lastAttemptAt) return false;
    const last = Date.parse(operation.lastAttemptAt);
    if (!Number.isFinite(last)) return false;
    const delay = computeBackoffDelay(operation.retryCount);
    return Date.now() - last < delay;
  }

  /**
   * Execute one operation and classify the outcome.
   *
   * Replay is driven by the record's verbatim `{ method, endpoint, body }`
   * through `authFetch` — this attaches the Bearer token (AC 5) and performs
   * exactly one refresh-and-retry on a 401. The conflict/idempotency headers of
   * design §5.2 are attached here.
   */
  private async processSyncOperation(operation: OfflineOperation): Promise<SyncOutcome> {
    const deviceId = await DeviceService.getDeviceId().catch(() => '');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Device-ID': deviceId,
      'X-Client-Timestamp': operation.timestamp,
      'X-Idempotency-Key': operation.id,
    };
    // Omit entirely when the version is unknown (design §5.2).
    if (operation.version !== undefined) {
      headers['X-Entity-Version'] = String(operation.version);
    }

    try {
      // `authFetch` takes a RELATIVE path and prefixes API_BASE_URL itself, and
      // attaches `Authorization: Bearer <token>` + a single 401 refresh/retry.
      const response = await authFetch(operation.payload.endpoint, {
        method: operation.payload.method,
        headers,
        ...(operation.payload.body !== undefined
          ? { body: JSON.stringify(operation.payload.body) }
          : {}),
      });
      return await this.classifyResponse(operation, response);
    } catch (error) {
      return {
        kind: 'retryable',
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Network request failed',
        },
      };
    }
  }

  /**
   * The AC 10 core: classify a response into success / conflict / permanent /
   * retryable. Only `2xx` (and a recorded conflict) ever removes the op.
   *
   * Key distinction: a `409` is a **conflict** only when its body carries
   * `error.code === 'VERSION_CONFLICT'`. Any other `409` code (e.g.
   * `NAME_EXISTS`, `ORGANIZER_SECRET_NOT_SET`) is a **permanent failure** — it
   * cannot be fixed by retrying and must not be surfaced as a conflict.
   */
  private async classifyResponse(
    operation: OfflineOperation,
    response: Response,
  ): Promise<SyncOutcome> {
    const status = response.status;

    if (status >= 200 && status < 300) {
      return { kind: 'success' };
    }

    if (status === 409) {
      const body = await this.safeJson(response);
      const code = (body as any)?.error?.code;
      if (code === 'VERSION_CONFLICT') {
        const data = (body as any)?.data ?? {};
        return {
          kind: 'conflict',
          record: {
            opId: operation.id,
            entity: operation.entity,
            endpoint: operation.payload.endpoint,
            intendedPayload: operation.payload.body ?? null,
            authoritative: data.current ?? null,
            serverVersion: typeof data.serverVersion === 'number' ? data.serverVersion : null,
            detectedAt: new Date().toISOString(),
          },
        };
      }
      // Any other 409 code is a permanent failure, NOT a conflict.
      return {
        kind: 'permanent',
        error: {
          code: typeof code === 'string' ? code : 'CONFLICT_REJECTED',
          message: (body as any)?.error?.message || `HTTP 409 for ${operation.payload.endpoint}`,
          status,
        },
      };
    }

    if (status === 401) {
      // `authFetch` already attempted one refresh+retry; a remaining 401 is a
      // permanent auth failure (retained for surfacing, never dropped).
      return {
        kind: 'permanent',
        error: {
          code: 'UNAUTHORIZED',
          message: `HTTP 401 for ${operation.payload.endpoint}`,
          status,
        },
      };
    }

    if (status === 400 || status === 403 || status === 404 || status === 422) {
      const body = await this.safeJson(response);
      return {
        kind: 'permanent',
        error: {
          code: (body as any)?.error?.code ?? 'PERMANENT_FAILURE',
          message:
            (body as any)?.error?.message || `HTTP ${status} for ${operation.payload.endpoint}`,
          status,
        },
      };
    }

    // 5xx and anything else → retryable (kept, backoff).
    const body = await this.safeJson(response);
    return {
      kind: 'retryable',
      error: {
        code: (body as any)?.error?.code ?? 'HTTP_ERROR',
        message: (body as any)?.error?.message || `HTTP ${status} for ${operation.payload.endpoint}`,
        status,
      },
    };
  }

  /** Read a response body defensively; never throws (body may be empty). */
  private async safeJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  // -------------------------------------------------------------------------
  // Status / maintenance
  // -------------------------------------------------------------------------

  /** Sync status. Existing fields are preserved; new fields are additive. */
  async getSyncStatus(): Promise<SyncStatus> {
    const [operations, lastSyncTime, migration] = await Promise.all([
      offlineQueue.getOperations(),
      StorageService.getLastSyncTimestamp(),
      offlineQueue.getMigrationState(),
    ]);
    const stats = await offlineQueue.getStats();

    const failedCount = operations.filter((op) => op.state === 'failed').length;
    const queuedCount = operations.length;

    const state: SyncStatus['state'] = this.syncInProgress
      ? 'syncing'
      : this.conflicts.length > 0
        ? 'conflict'
        : failedCount > 0
          ? 'failed'
          : queuedCount > 0
            ? 'queued'
            : 'idle';

    return {
      // Back-compat fields.
      isOnline: this.isOnline,
      syncInProgress: this.syncInProgress,
      pendingOperations: queuedCount,
      lastSyncTime,
      // Additive fields.
      state,
      queuedCount,
      failedCount,
      conflictCount: this.conflicts.length,
      archivedCount: stats.archivedCount,
      queueNearLimit: stats.nearLimit,
      schemaQuarantine: migration.schemaQuarantine,
    };
  }

  /** Unresolved conflicts, newest last (AC 9 — surfaced 100%). */
  getConflicts(): ConflictRecord[] {
    return [...this.conflicts];
  }

  /**
   * Dismiss a single conflict by its originating `opId`. The caller may
   * "re-apply" by enqueuing a *new* operation carrying the fresh `serverVersion`
   * (no blind overwrite — design §5.2). Returns `true` if a record was removed.
   */
  dismissConflict(opId: string): boolean {
    const before = this.conflicts.length;
    this.conflicts = this.conflicts.filter((c) => c.opId !== opId);
    return this.conflicts.length < before;
  }

  /** Force a sync pass. Throws when offline (signature unchanged). */
  async forceSync(): Promise<void> {
    if (this.isOnline) {
      await this.startSync();
    } else {
      throw new Error('Cannot sync while offline');
    }
  }

  /**
   * Clear every ACTIVE queued operation. Archived operations are deliberately
   * kept — clearing must never destroy unsynced data implicitly (design §9).
   * Signature unchanged (AC 6).
   */
  async clearSyncQueue(): Promise<void> {
    await offlineQueue.clearActive();
  }

  /** Reset volatile in-memory state (test isolation / cold start). */
  resetForTesting(): void {
    this.syncInProgress = false;
    this.isOnline = false;
    this.conflicts = [];
  }
}

// Export singleton instance
export const syncManager = SyncManager.getInstance();
