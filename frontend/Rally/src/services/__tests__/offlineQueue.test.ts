/**
 * offlineQueue.test.ts — Story 6.5 / T01.
 *
 * Covers the design §12 rows owned by T01:
 *   - 10 000 rapid enqueues → 10 000 distinct ids (the D-3 regression test)
 *   - `sequence` strictly increasing across a simulated restart (persisted)
 *   - queue at MAX_OPERATIONS → oldest ARCHIVED, not deleted; archivedCount
 *   - v1 bare array → migrated to v2 with zero ops lost
 *   - `schemaVersion: 99` → quarantined, original key intact, flag raised
 *   - unparseable JSON → quarantined + flag (never silently `return []`)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  offlineQueue,
  SCHEMA_VERSION,
  MAX_OPERATIONS,
  SOFT_LIMIT,
  QUEUE_KEY,
  QUARANTINE_KEY,
  SEQUENCE_KEY,
  ARCHIVE_PREFIX,
  PER_OP_PREFIX,
} from '../offlineQueue';

const identity = { deviceId: 'dev-test-1', userId: 'user-1' };

const input = (n: number) => ({
  entity: 'session',
  op: 'update',
  payload: {
    method: 'PUT' as const,
    endpoint: `/mvp-sessions/s1/players/p${n}/status`,
    body: { status: 'ACTIVE' },
  },
});

beforeEach(async () => {
  await AsyncStorage.clear();
  await offlineQueue.resetForTesting();
});

describe('offlineQueue — id uniqueness (D-3 regression)', () => {
  it('assigns 10 000 distinct ids to 10 000 rapid enqueues', async () => {
    const N = 10_000;
    const ids = new Set<string>();
    let sequences = 0;

    for (let i = 0; i < N; i += 1) {
      const op = await offlineQueue.enqueue(input(i), identity);
      expect(op).not.toBeNull();
      ids.add(op!.id);
      if (i > 0) expect(op!.sequence).toBeGreaterThan(sequences);
      sequences = op!.sequence;
    }

    expect(ids.size).toBe(N);
  }, 60_000);

  it('produces distinct ids with the deterministic fallback when randomUUID is absent', async () => {
    const original = globalThis.crypto;
    // Force the fallback id path.
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
    try {
      const ids = new Set<string>();
      for (let i = 0; i < 1_000; i += 1) {
        const op = await offlineQueue.enqueue(input(i), identity);
        ids.add(op!.id);
      }
      expect(ids.size).toBe(1_000);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original });
    }
  }, 30_000);
});

describe('offlineQueue — monotonic sequence across restart', () => {
  it('keeps the counter strictly increasing after a cold restart', async () => {
    const a = await offlineQueue.enqueue(input(0), identity);
    const b = await offlineQueue.enqueue(input(1), identity);
    const c = await offlineQueue.enqueue(input(2), identity);

    expect([a!.sequence, b!.sequence, c!.sequence]).toEqual([1, 2, 3]);

    // Simulate a process restart: drop in-memory caches, keep storage.
    await offlineQueue.resetForTesting({ clearStorage: false });

    const d = await offlineQueue.enqueue(input(3), identity);
    const e = await offlineQueue.enqueue(input(4), identity);

    expect(d!.sequence).toBeGreaterThan(c!.sequence);
    expect(e!.sequence).toBeGreaterThan(d!.sequence);

    // The counter itself is persisted.
    expect(await AsyncStorage.getItem(SEQUENCE_KEY)).toBe(String(e!.sequence));

    // And the queue survives the restart, still sequence-ordered.
    const ops = await offlineQueue.getOperations();
    expect(ops.map((o) => o.sequence)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('offlineQueue — bounds & archival (AC 14 / AC 10)', () => {
  it('archives the OLDEST operation at MAX_OPERATIONS instead of deleting it', async () => {
    const first = await offlineQueue.enqueue(input(0), identity);
    for (let i = 1; i < MAX_OPERATIONS; i += 1) {
      await offlineQueue.enqueue(input(i), identity);
    }

    expect((await offlineQueue.getOperations()).length).toBe(MAX_OPERATIONS);
    expect(await offlineQueue.getArchivedCount()).toBe(0);

    // One more op pushes past the cap.
    await offlineQueue.enqueue(input(MAX_OPERATIONS), identity);

    const active = await offlineQueue.getOperations();
    expect(active.length).toBe(MAX_OPERATIONS);
    expect(await offlineQueue.getArchivedCount()).toBe(1);

    // The oldest op was ARCHIVED (still on disk), not deleted.
    const archive = await offlineQueue.readArchive();
    expect(archive.length).toBe(1);
    expect(archive[0]!.id).toBe(first!.id);
    expect(archive[0]!.sequence).toBe(first!.sequence);

    const keys = await AsyncStorage.getAllKeys();
    expect(keys.some((k) => k.startsWith(ARCHIVE_PREFIX))).toBe(true);

    // It is no longer in the active window…
    expect(active.some((o) => o.id === first!.id)).toBe(false);

    // …and the near-limit flag is surfaced.
    const stats = await offlineQueue.getStats();
    expect(stats.count).toBe(MAX_OPERATIONS);
    expect(stats.nearLimit).toBe(true);
    expect(stats.atLimit).toBe(true);
  }, 60_000);

  it('flags nearLimit at the soft limit', async () => {
    for (let i = 0; i < SOFT_LIMIT; i += 1) {
      await offlineQueue.enqueue(input(i), identity);
    }
    const stats = await offlineQueue.getStats();
    expect(stats.count).toBe(SOFT_LIMIT);
    expect(stats.nearLimit).toBe(true);
    expect(stats.atLimit).toBe(false);
  }, 30_000);
});

describe('offlineQueue — envelope & migration (AC 8 / AC 13)', () => {
  it('materialises the v2 envelope on flush', async () => {
    await offlineQueue.enqueue(input(0), identity);
    await offlineQueue.enqueue(input(1), identity);
    await offlineQueue.flushEnvelope();

    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw as string);
    expect(envelope.schemaVersion).toBe(SCHEMA_VERSION);
    expect(envelope.sequence).toBe(2);
    expect(envelope.operations).toHaveLength(2);

    const reloaded = await offlineQueue.getEnvelope();
    expect(reloaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(reloaded.operations.map((o: { id: string }) => o.id)).toHaveLength(2);
  });

  it('migrates a v1 bare array to v2 without losing any operation', async () => {
    const legacy = [
      {
        id: 'legacy-a',
        type: 'CREATE_SESSION',
        payload: { endpoint: '/mvp-sessions', data: { name: 'Court 1' } },
        timestamp: '2026-01-01T00:00:00.000Z',
        retryCount: 0,
      },
      {
        id: 'legacy-b',
        type: 'UPDATE_PLAYER_STATUS',
        payload: { endpoint: '/mvp-sessions/s1/players/p1/status', data: { status: 'RESTING' } },
        timestamp: '2026-01-01T00:00:01.000Z',
        retryCount: 1,
      },
    ];
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(legacy));
    await offlineQueue.resetForTesting({ clearStorage: false });

    const result = await offlineQueue.migrateQueue();
    expect(result.migrated).toBe(true);
    expect(result.quarantined).toBe(false);
    expect(result.count).toBe(2);

    const ops = await offlineQueue.getOperations();
    expect(ops).toHaveLength(2); // zero ops lost
    expect(new Set(ops.map((o) => o.id))).toEqual(new Set(['legacy-a', 'legacy-b']));

    // `sequence` was back-filled by array index (strictly increasing).
    expect(ops[0]!.sequence).toBeLessThan(ops[1]!.sequence);

    // The legacy body (`payload.data`) was preserved into `payload.body`.
    const withBody = ops.find((o) => o.payload.body !== undefined);
    expect(withBody).toBeDefined();

    // The counter continues after the migrated maximum.
    const next = await offlineQueue.enqueue(input(9), identity);
    expect(next!.sequence).toBeGreaterThan(Math.max(...ops.map((o) => o.sequence)));
  });

  it('quarantines a newer schemaVersion, leaving the original key intact', async () => {
    const newer = {
      schemaVersion: 99,
      sequence: 7,
      operations: [{ id: 'future-1', sequence: 7, entity: 'session', op: 'update' }],
      updatedAt: '2026-06-01T00:00:00.000Z',
    };
    const raw = JSON.stringify(newer);
    await AsyncStorage.setItem(QUEUE_KEY, raw);
    await offlineQueue.resetForTesting({ clearStorage: false });

    const result = await offlineQueue.migrateQueue();
    expect(result.quarantined).toBe(true);
    expect(result.count).toBe(0);

    // A quarantine record exists and the ORIGINAL payload is preserved verbatim.
    const quarantineRaw = await AsyncStorage.getItem(QUARANTINE_KEY);
    expect(quarantineRaw).not.toBeNull();
    expect(quarantineRaw).toContain('NEWER_SCHEMA_VERSION');
    expect(await AsyncStorage.getItem(QUEUE_KEY)).toBe(raw);

    const state = await offlineQueue.getMigrationState();
    expect(state.schemaQuarantine).toBe(true);

    // No silent discard: the flag is raised, nothing is returned as if empty.
    expect((await offlineQueue.getOperations()).length).toBe(0);
  });

  it('quarantines unparseable JSON instead of silently returning []', async () => {
    const raw = '{ this is not valid json ';
    await AsyncStorage.setItem(QUEUE_KEY, raw);
    await offlineQueue.resetForTesting({ clearStorage: false });

    const envelope = await offlineQueue.getEnvelope();
    expect(envelope.operations).toEqual([]);

    // Raw payload preserved under quarantine, original key untouched.
    expect(await AsyncStorage.getItem(QUEUE_KEY)).toBe(raw);
    const quarantineRaw = await AsyncStorage.getItem(QUARANTINE_KEY);
    expect(quarantineRaw).not.toBeNull();
    expect(quarantineRaw).toContain('PARSE_ERROR');

    const state = await offlineQueue.getMigrationState();
    expect(state.schemaQuarantine).toBe(true);
  });

  it('quarantines a corrupt PER-OP record instead of silently deleting it', async () => {
    // Regression (QA): a corrupt `offline_sync_queue:op:*` value used to be
    // skipped on read and then multiRemoved by the index cleanup — lost with no
    // quarantine record. Its bytes must survive for recovery (AC 8 / AC 10).
    const a = await offlineQueue.enqueue(input(0), identity);
    const b = await offlineQueue.enqueue(input(1), identity);

    // Corrupt B's append-only record, then cold-restart.
    const allKeys = await AsyncStorage.getAllKeys();
    const bKey = allKeys.find(
      (k) => k.startsWith(PER_OP_PREFIX) && k.endsWith(`:${b!.id}`),
    );
    expect(bKey).toBeDefined();
    await AsyncStorage.setItem(bKey as string, '{ corrupt json');
    await offlineQueue.resetForTesting({ clearStorage: false });

    // A normal mutation that triggers the per-op index cleanup.
    await offlineQueue.removeOperation(a!.id);

    // The corrupt raw bytes are preserved under quarantine, not deleted.
    const quarantine = await offlineQueue.readPerOpQuarantine();
    expect(quarantine.length).toBe(1);
    expect(quarantine[0]!.raw).toBe('{ corrupt json');
    expect(quarantine[0]!.sourceKey).toBe(bKey);

    const state = await offlineQueue.getMigrationState();
    expect(state.perOpQuarantinedCount).toBe(1);

    // And the quarantine record is physically on disk (survives the cleanup).
    const quarantineKeys = (await AsyncStorage.getAllKeys()).filter((k) =>
      k.startsWith('offline_sync_queue_quarantine:op:'),
    );
    expect(quarantineKeys.length).toBe(1);
  });
});
