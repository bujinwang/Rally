/**
 * offlineExport.test.ts — Story 6.5 / T05 (permanent suite for T03's export path).
 *
 * Covers AC 4 / 8 / 12 / 16:
 *   1. Round-trip: serialize → parse preserves queue, archive, cached, identity.
 *   2. Parse robustness: malformed / non-object / missing-or-bad / newer schema
 *      never throw and return a reason.
 *   3. AC 16 identity scoping (+ the explicit `allowIdentityMismatch` override).
 *   4. Privacy: `stripSensitive` drops credential keys at depth & case-
 *      insensitively; `parse` scrubs tokens from a tampered blob.
 *   5. Idempotent restore: importing the same file twice merges 0 the 2nd time.
 *   6. Archive is included in both export and restore.
 *
 * MODULE-LOAD NOTE: `offlineExport` → `deviceService` → `expo-constants` /
 * `expo-application`, which ship untranspiled ESM that this jest preset does not
 * transform — importing the chain unmocked fails at load with
 * "Cannot use import statement outside a module". The `deviceService` boundary
 * is therefore mocked (it is also the unit under the C7 identity fix).
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('react-native-get-random-values', () => ({}));
jest.mock('../deviceService', () => ({
  __esModule: true,
  default: { getDeviceId: jest.fn(async () => 'dev-A') },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceService from '../deviceService';
import { offlineQueue, SCHEMA_VERSION, OfflineOperation, ArchivedOperation } from '../offlineQueue';
import {
  serialize,
  parse,
  exportOfflineState,
  restoreOfflineState,
  stripSensitive,
  fingerprint,
  RESTORE_REASON,
  ExportState,
} from '../offlineExport';

const getDeviceId = DeviceService.getDeviceId as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const op = (id: string, overrides: Partial<OfflineOperation> = {}): OfflineOperation => ({
  id,
  sequence: Number(id.replace(/\D/g, '')) || 1,
  entity: 'player',
  op: 'update',
  payload: {
    method: 'PUT',
    endpoint: `/mvp-sessions/S/players/${id}/status`,
    body: { status: 'ACTIVE' },
  },
  timestamp: '2026-09-11T00:00:00.000Z',
  identity: { deviceId: 'dev-A' },
  retryCount: 0,
  state: 'queued',
  ...overrides,
});

const archived = (id: string, archivedAt: string): ArchivedOperation => ({
  ...op(id),
  archivedAt,
});

const sampleState = (): ExportState => ({
  schemaVersion: SCHEMA_VERSION,
  exportedAt: '2026-09-11T12:00:00.000Z',
  identity: { deviceId: 'dev-A', userId: 'user-1' },
  queue: [op('op1'), op('op2', { entity: 'session' })],
  archive: [archived('op3', '2026-09-10T00:00:00.000Z')],
  cached: { SHARE1: { shareCode: 'SHARE1', name: 'Friday Night' } },
});

const enqueueOne = async () => {
  await offlineQueue.enqueue(
    {
      entity: 'player',
      op: 'update',
      payload: { method: 'PUT', endpoint: '/mvp-sessions/S/players/p1/status', body: { status: 'ACTIVE' } },
    },
    { deviceId: 'dev-A' },
  );
};

beforeEach(async () => {
  await AsyncStorage.clear();
  await offlineQueue.resetForTesting();
  getDeviceId.mockReset();
  getDeviceId.mockResolvedValue('dev-A');
});

// ---------------------------------------------------------------------------
// 1. Round-trip
// ---------------------------------------------------------------------------

describe('offlineExport — serialize/parse round-trip', () => {
  it('preserves queue, archive, cached and identity', () => {
    const state = sampleState();
    const parsed = parse(serialize(state));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state).toEqual(state);
    // Deep equality would pass even on a shared reference issue, so assert the
    // collections are independently materialised and non-empty.
    expect(parsed.state.queue).toHaveLength(2);
    expect(parsed.state.queue[1].entity).toBe('session');
    expect(parsed.state.archive).toHaveLength(1);
    expect(parsed.state.archive[0].archivedAt).toBe('2026-09-10T00:00:00.000Z');
    expect(parsed.state.cached.SHARE1).toEqual({ shareCode: 'SHARE1', name: 'Friday Night' });
    expect(parsed.state.identity).toEqual({ deviceId: 'dev-A', userId: 'user-1' });
  });

  it('serialize is deterministic (stable output for the same doc)', () => {
    const state = sampleState();
    expect(serialize(state)).toBe(serialize(state));
  });
});

// ---------------------------------------------------------------------------
// 2. Parse robustness — never throws
// ---------------------------------------------------------------------------

describe('offlineExport — parse robustness (never throws)', () => {
  const cases: Array<[string, string, string?]> = [
    ['empty string', ''],
    ['lone brace', '{'],
    ['literal null', 'null'],
    ['bare array', '[]'],
    ['not json', 'not json'],
    ['missing schemaVersion', JSON.stringify({ identity: { deviceId: 'dev-A' } })],
    ['non-numeric schemaVersion', JSON.stringify({ schemaVersion: 'two' })],
  ];

  it.each(cases)('%s → {ok:false}, no throw', (_label, raw) => {
    let result: ReturnType<typeof parse>;
    expect(() => {
      result = parse(raw);
    }).not.toThrow();
    expect(result!.ok).toBe(false);
    if (!result!.ok) expect(typeof result!.reason).toBe('string');
  });

  it('a NEWER schemaVersion is rejected (SCHEMA_TOO_NEW), never coerced', () => {
    const raw = JSON.stringify({
      schemaVersion: SCHEMA_VERSION + 1,
      identity: { deviceId: 'dev-A' },
      queue: [op('op1')],
      archive: [],
      cached: {},
    });
    const result = parse(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(RESTORE_REASON.SCHEMA_TOO_NEW);
  });

  it('an OLDER schemaVersion is rejected (SCHEMA_TOO_OLD)', () => {
    const raw = JSON.stringify({ schemaVersion: SCHEMA_VERSION - 1, queue: [], archive: [], cached: {} });
    const result = parse(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(RESTORE_REASON.SCHEMA_TOO_OLD);
  });
});

// ---------------------------------------------------------------------------
// 3. AC 16 identity scoping
// ---------------------------------------------------------------------------

describe('offlineExport — AC 16 identity scoping', () => {
  it('mismatched deviceId → IDENTITY_MISMATCH', () => {
    const raw = serialize({
      ...sampleState(),
      identity: { deviceId: 'dev-OTHER', userId: null },
    });
    const result = parse(raw, { deviceId: 'dev-A', userId: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(RESTORE_REASON.IDENTITY_MISMATCH);
  });

  it('restoreOfflineState rejects a foreign identity by default', async () => {
    await enqueueOne();
    const foreign = serialize({
      ...sampleState(),
      queue: [],
      archive: [],
      identity: { deviceId: 'dev-OTHER', userId: null },
    });
    await offlineQueue.clearActive();

    const result = await restoreOfflineState(foreign);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(RESTORE_REASON.IDENTITY_MISMATCH);
  });

  it('allowIdentityMismatch:true proceeds (explicit user-confirmed path)', async () => {
    const foreign = serialize({
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-09-11T12:00:00.000Z',
      identity: { deviceId: 'dev-OTHER', userId: null },
      queue: [
        op('opX', {
          payload: { method: 'PUT', endpoint: '/mvp-sessions/S/players/pX/status', body: { status: 'LEFT' } },
        }),
      ],
      archive: [],
      cached: {},
    });

    const blocked = await restoreOfflineState(foreign);
    expect(blocked.ok).toBe(false);

    const allowed = await restoreOfflineState(foreign, { allowIdentityMismatch: true });
    expect(allowed.ok).toBe(true);
    expect(allowed.merged).toBe(1);
    expect((await offlineQueue.getOperations())).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Privacy
// ---------------------------------------------------------------------------

describe('offlineExport — privacy / credential stripping', () => {
  it('stripSensitive drops credential keys at depth and case-insensitively', () => {
    const input = {
      keep: 1,
      nested: { AccessToken: 'AAA', refreshToken: 'BBB', operator: { password: 'CCC', keep2: 2 } },
      list: [{ token: 'DDD', name: 'ok' }],
    };
    const out = stripSensitive(input) as any;
    expect(out.keep).toBe(1);
    expect(out.nested.AccessToken).toBeUndefined();
    expect(out.nested.refreshToken).toBeUndefined();
    expect(out.nested.operator.password).toBeUndefined();
    expect(out.nested.operator.keep2).toBe(2);
    expect(out.list[0].token).toBeUndefined();
    expect(out.list[0].name).toBe('ok');
  });

  it('parse scrubs a credential already present in a tampered blob', () => {
    const tampered = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-09-11T12:00:00.000Z',
      identity: { deviceId: 'dev-A', userId: 'u1', accessToken: 'LEAK-TOKEN' },
      queue: [],
      archive: [],
      cached: { SHARE1: { shareCode: 'SHARE1', accessToken: 'LEAK-TOKEN', refreshToken: 'LEAK-REFRESH' } },
    });

    const result = parse(tampered);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const dumped = JSON.stringify(result.state);
    expect(dumped).not.toContain('LEAK-TOKEN');
    expect(dumped).not.toContain('LEAK-REFRESH');
    expect((result.state.cached.SHARE1 as any).accessToken).toBeUndefined();
    expect((result.state.cached.SHARE1 as any).refreshToken).toBeUndefined();
    expect((result.state.identity as any).accessToken).toBeUndefined();
  });

  it('exportOfflineState never emits a token even if the cache contained one', async () => {
    await AsyncStorage.setItem(
      'cached_sessions',
      JSON.stringify({ SHARE1: { shareCode: 'SHARE1', accessToken: 'LEAK-TOKEN' } }),
    );
    const raw = await exportOfflineState();
    expect(raw).not.toContain('LEAK-TOKEN');
    expect(raw).not.toContain('refreshToken');
  });

  it('serialize scrubs credentials inside a queued op payload.body (QA claim 4)', () => {
    const state = sampleState();
    // Project a credential into a queued body + an archived body.
    state.queue[0] = {
      ...state.queue[0],
      payload: {
        ...state.queue[0].payload,
        body: { status: 'ACTIVE', accessToken: 'LEAK-IN-QUEUE', refreshToken: 'LEAK-REFRESH' },
      },
    };
    state.archive[0] = {
      ...state.archive[0],
      payload: {
        ...state.archive[0].payload,
        body: { accessToken: 'LEAK-IN-ARCHIVE' },
      },
    };

    const raw = serialize(state);
    expect(raw).not.toContain('LEAK-IN-QUEUE');
    expect(raw).not.toContain('LEAK-REFRESH');
    expect(raw).not.toContain('LEAK-IN-ARCHIVE');
    // The non-sensitive part of the body survives.
    expect(raw).toContain('ACTIVE');
  });

  it('exportOfflineState scrubs a credential that reached a queued body', async () => {
    await offlineQueue.enqueue(
      {
        entity: 'player',
        op: 'update',
        payload: {
          method: 'PUT',
          endpoint: '/mvp-sessions/S/players/p1/status',
          body: { status: 'ACTIVE', accessToken: 'LEAK-IN-QUEUE', refreshToken: 'LEAK-REFRESH' },
        },
      },
      { deviceId: 'dev-A' },
    );

    const raw = await exportOfflineState();
    expect(raw).not.toContain('LEAK-IN-QUEUE');
    expect(raw).not.toContain('LEAK-REFRESH');
    // The op itself is still exported (only the credential key is dropped).
    const parsed = parse(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.state.queue).toHaveLength(1);
      expect((parsed.state.queue[0].payload.body as any).status).toBe('ACTIVE');
    }
  });

  it('parse scrubs a credential inside a tampered queue op body', () => {
    const tampered = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-09-11T12:00:00.000Z',
      identity: { deviceId: 'dev-A', userId: null },
      queue: [
        {
          ...op('op1'),
          payload: {
            method: 'PUT',
            endpoint: '/mvp-sessions/S/players/op1/status',
            body: { status: 'ACTIVE', accessToken: 'LEAK-IN-QUEUE' },
          },
        },
      ],
      archive: [],
      cached: {},
    });

    const result = parse(tampered);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.state)).not.toContain('LEAK-IN-QUEUE');
    expect(result.state.queue).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Idempotent restore (AC 12)
// ---------------------------------------------------------------------------

describe('offlineExport — idempotent additive restore', () => {
  it('imports once, then a repeat import merges 0 (skipped increments)', async () => {
    await enqueueOne();
    const raw = await exportOfflineState();

    await offlineQueue.clearActive();
    expect(await offlineQueue.getOperations()).toHaveLength(0);

    const first = await restoreOfflineState(raw);
    expect(first.ok).toBe(true);
    expect(first.merged).toBe(1);
    expect(first.skipped).toBe(0);
    expect(await offlineQueue.getOperations()).toHaveLength(1);

    const second = await restoreOfflineState(raw);
    expect(second.ok).toBe(true);
    expect(second.merged).toBe(0);
    expect(second.skipped).toBe(1);
    // No duplication.
    expect(await offlineQueue.getOperations()).toHaveLength(1);
  });

  it('never overwrites existing queue content (additive merge)', async () => {
    await enqueueOne(); // p1
    const raw = await exportOfflineState();

    // Add a different op locally after the export.
    await offlineQueue.enqueue(
      { entity: 'session', op: 'update', payload: { method: 'PUT', endpoint: '/mvp-sessions/S', body: { courtCount: 3 } } },
      { deviceId: 'dev-A' },
    );

    const result = await restoreOfflineState(raw);
    expect(result.ok).toBe(true);
    // The exported op(s) are deduped; the local extra is untouched.
    const ops = await offlineQueue.getOperations();
    expect(ops.some((o) => o.payload.endpoint === '/mvp-sessions/S')).toBe(true);
    expect(ops.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 6. Archive included
// ---------------------------------------------------------------------------

describe('offlineExport — archive inclusion', () => {
  it('exportOfflineState always carries an archive array', async () => {
    await enqueueOne();
    const raw = await exportOfflineState();
    const parsed = parse(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(Array.isArray(parsed.state.archive)).toBe(true);
  });

  it('restore merges archived entries back into the active queue (never lost)', async () => {
    const doc = serialize({
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-09-11T12:00:00.000Z',
      identity: { deviceId: 'dev-A', userId: null },
      queue: [
        op('q1', {
          payload: { method: 'PUT', endpoint: '/mvp-sessions/S/players/q1/status', body: { status: 'ACTIVE' } },
        }),
      ],
      archive: [
        archived('a1', '2026-09-01T00:00:00.000Z'),
      ],
      cached: {},
    });

    const result = await restoreOfflineState(doc);
    expect(result.ok).toBe(true);
    // Both the active and the archived entry become replayable.
    expect(result.merged).toBe(2);
    const endpoints = (await offlineQueue.getOperations()).map((o) => o.payload.endpoint);
    expect(endpoints).toContain('/mvp-sessions/S/players/q1/status');
    expect(endpoints).toContain('/mvp-sessions/S/players/a1/status');
  });
});

// ---------------------------------------------------------------------------
// fingerprint — the dedup primitive
// ---------------------------------------------------------------------------

describe('offlineExport — fingerprint', () => {
  it('is stable for identical input and distinguishes differing bodies', () => {
    const a = { entity: 'x', op: 'y', payload: { method: 'PUT', endpoint: '/e', body: { n: 1 } } };
    const a2 = { entity: 'x', op: 'y', payload: { method: 'PUT', endpoint: '/e', body: { n: 1 } } };
    const b = { entity: 'x', op: 'y', payload: { method: 'PUT', endpoint: '/e', body: { n: 2 } } };
    expect(fingerprint(a)).toBe(fingerprint(a2));
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });
});
