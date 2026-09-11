/**
 * syncManager.test.ts — Story 6.5 / T02.
 *
 * Covers the design §12 rows owned by T02 (reconciliation + conflicts):
 *   - `2xx` → op removed (the ONLY automatic removal path)
 *   - `500` / network → op RETAINED + retryCount++
 *   - `400/403/404` → state:'failed' RETAINED + surfaced (never removed)
 *   - a 404 / unknown route → surfaced, not dropped
 *   - `409 VERSION_CONFLICT` → conflict record emitted, LWW state applied, op
 *     not lost (replaced by the record)
 *   - a `409` with a NON-VERSION_CONFLICT code (e.g. NAME_EXISTS) is a
 *     PERMANENT failure, NOT a conflict
 *   - replay order equals `sequence` order even when timestamps are
 *     identical / reversed
 *   - backoff boundary; MAX_ATTEMPTS → 'failed', not deleted
 *   - repeat startSync while in progress is a no-op (no double replay)
 *   - the realTimeSlice 'offline-replay' dispatch happens after a replay batch
 *
 * `authFetch` is mocked (never global `fetch`).
 */

jest.mock('../authFetch', () => ({
  authFetch: jest.fn(),
  clearAuthTokens: jest.fn(),
  refreshAccessToken: jest.fn(),
}));

// Avoid pulling in expo-native modules via DeviceService.
jest.mock('../deviceService', () => ({
  __esModule: true,
  default: { getDeviceId: jest.fn().mockResolvedValue('dev-test-1') },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from '../authFetch';
import { offlineQueue, MAX_ATTEMPTS, computeBackoffDelay } from '../offlineQueue';
import {
  syncManager,
  setSyncDispatch,
  resetSyncDispatch,
  entityKey,
} from '../syncManager';
import syncReducer, { ConflictRecord } from '../../store/slices/syncSlice';
import realTimeReducer from '../../store/slices/realTimeSlice';

const mockedAuthFetch = authFetch as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeResponse = (status: number, body: any = {}): Response => {
  const res = {
    status,
    ok: status >= 200 && status < 300,
    json: jest.fn().mockResolvedValue(body),
    clone() {
      return makeResponse(status, body);
    },
  };
  return res as unknown as Response;
};

/** Batch of actions captured from the registered dispatcher. */
let dispatched: any[] = [];

const captureDispatch = () => {
  dispatched = [];
  setSyncDispatch((action) => dispatched.push(action));
};

const enqueue = async (
  overrides: Partial<{
    entity: string;
    op: string;
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    endpoint: string;
    body: unknown;
    version: number;
  }> = {},
) => {
  const input = {
    entity: overrides.entity ?? 'player',
    op: overrides.op ?? 'update',
    payload: {
      method: overrides.method ?? ('PUT' as const),
      endpoint: overrides.endpoint ?? '/mvp-sessions/ABC/players/p1/status',
      ...(overrides.body !== undefined ? { body: overrides.body } : { body: { status: 'ACTIVE' } }),
    },
    ...(overrides.version !== undefined ? { version: overrides.version } : {}),
  };
  await syncManager.queueOperation(input);
  return (await offlineQueue.getOperations())[0];
};

const activeOps = () => offlineQueue.getOperations();

beforeEach(async () => {
  await AsyncStorage.clear();
  await offlineQueue.resetForTesting();
  syncManager.resetForTesting();
  resetSyncDispatch();
  captureDispatch();
  jest.clearAllMocks();
  mockedAuthFetch.mockReset();
});

afterEach(() => {
  resetSyncDispatch();
});

// ---------------------------------------------------------------------------
// Classification & the never-drop invariant (AC 10)
// ---------------------------------------------------------------------------

describe('syncManager — response classification (never-drop invariant)', () => {
  it('2xx → the operation is removed (the only automatic removal path)', async () => {
    const op = await enqueue();
    expect(op).toBeTruthy();

    mockedAuthFetch.mockResolvedValue(makeResponse(200, { success: true }));
    syncManager.setOnline(true);
    await syncManager.forceSync();

    expect((await activeOps()).length).toBe(0);
  });

  it('500 → the operation is RETAINED and retryCount increments', async () => {
    const op = await enqueue();
    mockedAuthFetch.mockResolvedValue(makeResponse(500, { error: { code: 'BOOM' } }));

    syncManager.setOnline(true);
    await syncManager.forceSync();

    const remaining = await activeOps();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(op!.id);
    expect(remaining[0].retryCount).toBe(1);
    expect(remaining[0].state).toBe('queued');
    expect(remaining[0].lastError?.status).toBe(500);
  });

  it('a network/timeout error → RETAINED + retryCount++', async () => {
    const op = await enqueue();
    mockedAuthFetch.mockRejectedValue(new Error('Network request failed'));

    syncManager.setOnline(true);
    await syncManager.forceSync();

    const remaining = await activeOps();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(op!.id);
    expect(remaining[0].retryCount).toBe(1);
    expect(remaining[0].state).toBe('queued');
    expect(remaining[0].lastError?.code).toBe('NETWORK_ERROR');
  });

  it.each([400, 403, 404])(
    '%i → permanent failure: state:failed, RETAINED (never removed)',
    async (status) => {
      const op = await enqueue();
      mockedAuthFetch.mockResolvedValue(makeResponse(status, { error: { code: 'NOPE' } }));

      syncManager.setOnline(true);
      await syncManager.forceSync();

      const remaining = await activeOps();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(op!.id);
      expect(remaining[0].state).toBe('failed');
      expect(remaining[0].lastError?.status).toBe(status);
    },
  );

  it('an unknown / non-existent route (404) is surfaced, not dropped', async () => {
    const op = await enqueue({ endpoint: '/mvp-sessions/does-not-exist' });
    mockedAuthFetch.mockResolvedValue(makeResponse(404, { error: { code: 'NOT_FOUND' } }));

    syncManager.setOnline(true);
    await syncManager.forceSync();

    const remaining = await activeOps();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(op!.id);
    expect(remaining[0].state).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// Conflict path (AC 2/7/9)
// ---------------------------------------------------------------------------

describe('syncManager — 409 VERSION_CONFLICT (LWW + surfacing)', () => {
  it('emits a conflict record, applies authoritative state, and does NOT lose the op', async () => {
    const authoritative = { id: 's1', version: 7, location: 'Server Venue' };
    const op = await enqueue({
      entity: 'session',
      endpoint: '/mvp-sessions/ABC',
      body: { location: 'Local Venue' },
      version: 5,
    });

    mockedAuthFetch.mockResolvedValue(
      makeResponse(409, {
        success: false,
        error: { code: 'VERSION_CONFLICT', message: 'stale' },
        data: { current: authoritative, serverVersion: 7 },
      }),
    );

    syncManager.setOnline(true);
    await syncManager.forceSync();

    // The op was REPLACED by a conflict record, not silently lost.
    expect(await activeOps()).toHaveLength(0);
    const conflicts = syncManager.getConflicts();
    expect(conflicts).toHaveLength(1);
    const record: ConflictRecord = conflicts[0];
    expect(record.opId).toBe(op!.id);
    expect(record.entity).toBe('session');
    expect(record.serverVersion).toBe(7);
    // LWW — the server's authoritative entity is captured.
    expect(record.authoritative).toEqual(authoritative);
    // The user's intended change is retained for a later "re-apply".
    expect(record.intendedPayload).toEqual({ location: 'Local Venue' });

    // Dispatched into the same slice the UI reads (AC 7).
    const conflictActions = dispatched.filter((a) => a.type === 'sync/conflictDetected');
    expect(conflictActions).toHaveLength(1);
    const reduced = conflictActions.reduce(syncReducer, syncReducer(undefined, { type: '@@INIT' }));
    expect(reduced.conflicts).toHaveLength(1);
    expect(reduced.conflicts[0].serverVersion).toBe(7);
  });

  it('dismissConflict removes a surfaced conflict by opId', async () => {
    await enqueue({ entity: 'session', endpoint: '/mvp-sessions/ABC', version: 5 });
    mockedAuthFetch.mockResolvedValue(
      makeResponse(409, {
        error: { code: 'VERSION_CONFLICT' },
        data: { current: { id: 's1', version: 9 }, serverVersion: 9 },
      }),
    );
    syncManager.setOnline(true);
    await syncManager.forceSync();

    const [conflict] = syncManager.getConflicts();
    expect(syncManager.dismissConflict(conflict.opId)).toBe(true);
    expect(syncManager.getConflicts()).toHaveLength(0);
    expect(syncManager.dismissConflict('nope')).toBe(false);
  });

  it('a 409 with a NON-VERSION_CONFLICT code (NAME_EXISTS) is a PERMANENT failure, not a conflict', async () => {
    const op = await enqueue({
      entity: 'player',
      endpoint: '/mvp-sessions/ABC/add-player',
      method: 'POST',
      body: { name: 'David' },
    });

    mockedAuthFetch.mockResolvedValue(
      makeResponse(409, {
        success: false,
        error: { code: 'NAME_EXISTS', message: 'A player with this name already exists' },
      }),
    );

    syncManager.setOnline(true);
    await syncManager.forceSync();

    // Retained as a permanent failure…
    const remaining = await activeOps();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(op!.id);
    expect(remaining[0].state).toBe('failed');
    expect(remaining[0].lastError?.code).toBe('NAME_EXISTS');

    // …and NOT surfaced as a conflict.
    expect(syncManager.getConflicts()).toHaveLength(0);
    expect(dispatched.filter((a) => a.type === 'sync/conflictDetected')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Replay order, backoff, attempt cap, re-entrancy (AC 1/10/11)
// ---------------------------------------------------------------------------

describe('syncManager — ordering, backoff, attempt cap, re-entrancy', () => {
  it('replays in `sequence` order even when every timestamp is identical/reversed', async () => {
    // Enqueue three ops → natural sequence order s1 < s2 < s3.
    const a = await enqueue({ endpoint: '/mvp-sessions/S/players/a/status', body: { status: 'ACTIVE' } });
    const b = await enqueue({ endpoint: '/mvp-sessions/S/players/b/status', body: { status: 'ACTIVE' } });
    const c = await enqueue({ endpoint: '/mvp-sessions/S/players/c/status', body: { status: 'ACTIVE' } });

    // Force identical (and deliberately reversed) wall-clock timestamps.
    await offlineQueue.updateOperation(a!.id, { timestamp: '2026-01-01T00:00:03Z' });
    await offlineQueue.updateOperation(b!.id, { timestamp: '2026-01-01T00:00:02Z' });
    await offlineQueue.updateOperation(c!.id, { timestamp: '2026-01-01T00:00:01Z' });

    const callOrder: string[] = [];
    mockedAuthFetch.mockImplementation((endpoint: string) => {
      callOrder.push(endpoint);
      return Promise.resolve(makeResponse(200, { success: true }));
    });

    syncManager.setOnline(true);
    await syncManager.forceSync();

    // Order follows `sequence`, NOT timestamp.
    expect(callOrder).toEqual([
      '/mvp-sessions/S/players/a/status',
      '/mvp-sessions/S/players/b/status',
      '/mvp-sessions/S/players/c/status',
    ]);
  });

  it('backoff delay = min(2000·2^n, 60000) ± jitter (boundary)', () => {
    // Deterministic random() = 0.5 → zero jitter.
    const mid = () => 0.5;
    expect(computeBackoffDelay(0, mid)).toBe(2000);
    expect(computeBackoffDelay(1, mid)).toBe(4000);
    expect(computeBackoffDelay(2, mid)).toBe(8000);
    // Capped at 60 000 for large n.
    expect(computeBackoffDelay(10, mid)).toBe(60000);
    // Jitter stays within ±1000 (min() floor at 0).
    const low = computeBackoffDelay(0, () => 0);
    const high = computeBackoffDelay(0, () => 1);
    expect(low).toBe(1000);
    expect(high).toBe(3000);
  });

  it('MAX_ATTEMPTS boundary moves the op to `failed` and RETAINS it', async () => {
    const op = await enqueue();
    // One attempt below the cap, with the backoff window elapsed.
    await offlineQueue.updateOperation(op!.id, {
      retryCount: MAX_ATTEMPTS - 1,
      lastAttemptAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    mockedAuthFetch.mockResolvedValue(makeResponse(503, { error: { code: 'UNAVAILABLE' } }));
    syncManager.setOnline(true);
    await syncManager.forceSync();

    const remaining = await activeOps();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(op!.id);
    expect(remaining[0].retryCount).toBe(MAX_ATTEMPTS);
    expect(remaining[0].state).toBe('failed');
  });

  it('a repeat startSync while in progress is a no-op (no double replay)', async () => {
    await enqueue();

    // A gate whose resolver is captured synchronously, so the first replay
    // parks inside the request while we trigger a second pass.
    let release!: (r: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    mockedAuthFetch.mockImplementation(() => gate);

    syncManager.setOnline(true);
    const first = syncManager.forceSync(); // sets syncInProgress synchronously
    const second = syncManager.forceSync(); // must be a no-op

    release(makeResponse(200, { success: true }));
    await Promise.all([first, second]);

    // Only ONE replay of the single op.
    expect(mockedAuthFetch).toHaveBeenCalledTimes(1);
    expect(await activeOps()).toHaveLength(0);
  });

  it('a permanently-failed op is not retried on a subsequent pass', async () => {
    await enqueue();
    mockedAuthFetch.mockResolvedValue(makeResponse(403, { error: { code: 'FORBIDDEN' } }));
    syncManager.setOnline(true);
    await syncManager.forceSync();
    expect((await activeOps())[0].state).toBe('failed');

    mockedAuthFetch.mockClear();
    await syncManager.forceSync();
    expect(mockedAuthFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// authFetch migration + wire-contract headers (AC 5, §5.2)
// ---------------------------------------------------------------------------

describe('syncManager — replay via authFetch with the §5.2 headers', () => {
  it('calls authFetch with the verbatim {method, body} and X-Entity-Version/Idempotency/Timestamp', async () => {
    const op = await enqueue({
      entity: 'session',
      endpoint: '/mvp-sessions/ABC',
      method: 'PUT',
      body: { courtCount: 4 },
      version: 3,
    });
    mockedAuthFetch.mockResolvedValue(makeResponse(200, { success: true }));

    syncManager.setOnline(true);
    await syncManager.forceSync();

    expect(mockedAuthFetch).toHaveBeenCalledTimes(1);
    const [endpoint, init] = mockedAuthFetch.mock.calls[0];
    // Relative path — authFetch prefixes API_BASE_URL itself.
    expect(endpoint).toBe('/mvp-sessions/ABC');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ courtCount: 4 });
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Entity-Version']).toBe('3');
    expect(headers['X-Idempotency-Key']).toBe(op!.id);
    expect(headers['X-Client-Timestamp']).toBe(op!.timestamp);
    expect(headers['X-Device-ID']).toBe('dev-test-1');
  });

  it('omits X-Entity-Version when the version is unknown', async () => {
    await enqueue({ endpoint: '/mvp-sessions/ABC/players/p1/status' }); // no version
    mockedAuthFetch.mockResolvedValue(makeResponse(200, { success: true }));

    syncManager.setOnline(true);
    await syncManager.forceSync();

    const [, init] = mockedAuthFetch.mock.calls[0];
    expect((init.headers as Record<string, string>)['X-Entity-Version']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The reusable freshness channel (AC 7)
// ---------------------------------------------------------------------------

describe("syncManager — realTimeSlice 'offline-replay' freshness channel", () => {
  it('dispatches sessionUpdated({source:"offline-replay"}) after a successful replay batch', async () => {
    await enqueue({ endpoint: '/mvp-sessions/ABC/players/p1/status' });
    mockedAuthFetch.mockResolvedValue(makeResponse(200, { success: true }));

    syncManager.setOnline(true);
    await syncManager.forceSync();

    const replayActions = dispatched.filter((a) => a.type === 'realTime/sessionUpdated');
    expect(replayActions).toHaveLength(1);
    expect(replayActions[0].payload.source).toBe('offline-replay');
    expect(replayActions[0].payload.sessionId).toBe('ABC');

    // The reused channel clears that session's pending updates (stays correct).
    let state = realTimeReducer(undefined, { type: '@@INIT' } as any);
    state = realTimeReducer(
      state,
      { type: 'realTime/addOptimisticUpdate', payload: { sessionId: 'ABC', update: { type: 'status_change', playerId: 'p1', timestamp: 't' } } } as any,
    );
    expect(state.pendingUpdates['ABC']).toHaveLength(1);
    state = realTimeReducer(state, replayActions[0]);
    expect(state.pendingUpdates['ABC']).toBeUndefined();
    expect(state.lastUpdated['ABC']).toBe(replayActions[0].payload.timestamp);
  });

  it('does not emit a freshness signal when nothing was replayed', async () => {
    syncManager.setOnline(true);
    await syncManager.forceSync();
    expect(dispatched.filter((a) => a.type === 'realTime/sessionUpdated')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Back-compat surface (AC 6)
// ---------------------------------------------------------------------------

describe('syncManager — public API preserved (AC 6)', () => {
  it('getSyncStatus / getConflicts / dismissConflict / clearSyncQueue exist and behave', async () => {
    await enqueue();
    const status = await syncManager.getSyncStatus();
    expect(status.pendingOperations).toBe(1);
    expect(status.queuedCount).toBe(1);
    expect(status.isOnline).toBe(false);

    await syncManager.clearSyncQueue();
    expect(await activeOps()).toHaveLength(0);
    expect(typeof syncManager.getConflicts).toBe('function');
    expect(typeof syncManager.dismissConflict).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Head-of-line ordering on transient failure (QA defect 1, design §4.3)
// ---------------------------------------------------------------------------

describe('syncManager — head-of-line ordering (QA defect 1)', () => {
  it('a retryable (500) op BLOCKS a later same-entity op from overtaking it', async () => {
    // Two ops for the SAME player p1, enqueued in order (op1 older intent).
    await enqueue({
      entity: 'player',
      endpoint: '/mvp-sessions/S/players/p1/status',
      body: { status: 'ACTIVE' },
    });
    await enqueue({
      entity: 'player',
      endpoint: '/mvp-sessions/S/players/p1/status',
      body: { status: 'LEFT' },
    });
    const ops = await activeOps();
    expect(ops).toHaveLength(2);
    const olderId = ops[0].id;

    // op1 → 500 (transient); op2 would 200 if it were allowed to run.
    const calls: string[] = [];
    mockedAuthFetch.mockImplementation((endpoint: string, init: any) => {
      calls.push(init.body);
      if (calls.length === 1) return Promise.resolve(makeResponse(500, { error: { code: 'BOOM' } }));
      return Promise.resolve(makeResponse(200, { success: true }));
    });

    syncManager.setOnline(true);
    await syncManager.forceSync();

    // Only ONE request: the newer op2 must NOT overtake the unresolved op1.
    expect(calls).toHaveLength(1);
    const remaining = await activeOps();
    expect(remaining).toHaveLength(2);
    const older = remaining.find((o) => o.id === olderId)!;
    expect(older.state).toBe('queued');
    expect(older.retryCount).toBe(1);
  });

  it('a backoff-gated op blocks a later same-entity op', async () => {
    await enqueue({ endpoint: '/mvp-sessions/S/players/p1/status', body: { status: 'ACTIVE' } });
    await enqueue({ endpoint: '/mvp-sessions/S/players/p1/status', body: { status: 'LEFT' } });
    const ops = await activeOps();
    // Put the first op inside its backoff window.
    await offlineQueue.updateOperation(ops[0].id, {
      retryCount: 1,
      lastAttemptAt: new Date().toISOString(),
    });

    mockedAuthFetch.mockResolvedValue(makeResponse(200, { success: true }));
    syncManager.setOnline(true);
    await syncManager.forceSync();

    // op1 is backing off → op2 for the same player must wait, not overtake.
    expect(mockedAuthFetch).not.toHaveBeenCalled();
    expect(await activeOps()).toHaveLength(2);
  });

  it('ops for DIFFERENT players are independent (a failure on p1 does not block p2/p3)', async () => {
    await enqueue({ endpoint: '/mvp-sessions/S/players/p1/status', body: { status: 'LEFT' } });
    await enqueue({ endpoint: '/mvp-sessions/S/players/p2/status', body: { status: 'ACTIVE' } });
    await enqueue({ endpoint: '/mvp-sessions/S/players/p3/status', body: { status: 'ACTIVE' } });

    const attempted: string[] = [];
    mockedAuthFetch.mockImplementation((endpoint: string) => {
      attempted.push(endpoint);
      if (endpoint.includes('/players/p1/')) {
        return Promise.resolve(makeResponse(403, { error: { code: 'FORBIDDEN' } }));
      }
      return Promise.resolve(makeResponse(200, { success: true }));
    });

    syncManager.setOnline(true);
    await syncManager.forceSync();

    // p2 and p3 were still attempted despite p1's permanent failure.
    expect(attempted).toContain('/mvp-sessions/S/players/p2/status');
    expect(attempted).toContain('/mvp-sessions/S/players/p3/status');
    // Only the failed p1 op remains.
    const remaining = await activeOps();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].payload.endpoint).toContain('/players/p1/');
    expect(remaining[0].state).toBe('failed');
  });

  it('a permanently-failed op (state:failed) blocks a later same-entity op on a later pass', async () => {
    await enqueue({ endpoint: '/mvp-sessions/S/players/p1/status', body: { status: 'ACTIVE' } });
    await enqueue({ endpoint: '/mvp-sessions/S/players/p1/status', body: { status: 'LEFT' } });

    // First pass: op1 → 403 (permanent) → blocks op2.
    mockedAuthFetch.mockResolvedValue(makeResponse(403, { error: { code: 'FORBIDDEN' } }));
    syncManager.setOnline(true);
    await syncManager.forceSync();
    expect(mockedAuthFetch).toHaveBeenCalledTimes(1);
    expect((await activeOps()).filter((o) => o.state === 'failed')).toHaveLength(1);
    expect((await activeOps()).filter((o) => o.state === 'queued')).toHaveLength(1);

    // Second pass: the failed op is still unresolved → op2 stays blocked.
    mockedAuthFetch.mockClear();
    await syncManager.forceSync();
    expect(mockedAuthFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// entityKey derivation
// ---------------------------------------------------------------------------

describe('syncManager — entityKey (ordering identity)', () => {
  it('keys by the concrete sub-entity, not the coarse label', () => {
    expect(entityKey({ entity: 'player', payload: { endpoint: '/mvp-sessions/S/players/p1/status' } })).toBe('player:p1');
    expect(entityKey({ entity: 'player', payload: { endpoint: '/mvp-sessions/S/players/p2/status' } })).toBe('player:p2');
    expect(entityKey({ entity: 'game', payload: { endpoint: '/mvp-sessions/S/games/g1/score' } })).toBe('game:g1');
    expect(entityKey({ entity: 'session', payload: { endpoint: '/mvp-sessions/S' } })).toBe('session:S');
    // Same coarse label, different key → independent.
    expect(entityKey({ entity: 'player', payload: { endpoint: '/mvp-sessions/S/players/p1/status' } })).not.toBe(
      entityKey({ entity: 'player', payload: { endpoint: '/mvp-sessions/S/players/p2/status' } }),
    );
  });
});

