// @ts-nocheck
import {
  scheduler,
} from '../scheduler';

jest.mock('../../config/database', () => ({
  prisma: {
    mvpSession: { findMany: jest.fn(), update: jest.fn() },
    mvpPlayer: { findMany: jest.fn(), updateMany: jest.fn() },
  },
}));

jest.mock('../../utils/notificationHelper', () => ({
  notifySessionSubscribers: jest.fn(),
}));

// Story 6.6 — the 24 h retrain job's two collaborators (named imports only).
jest.mock('../ml/trainingPipeline', () => ({
  trainingPipeline: { runAll: jest.fn() },
}));

jest.mock('../metricsRegistry', () => ({
  predictionRetrainTotal: { inc: jest.fn() },
}));

import { prisma } from '../../config/database';
import { notifySessionSubscribers } from '../../utils/notificationHelper';
import { trainingPipeline } from '../ml/trainingPipeline';
import { predictionRetrainTotal } from '../metricsRegistry';

const srv: any = scheduler;

const sessionFindMany = prisma.mvpSession.findMany as jest.Mock;
const sessionUpdate = prisma.mvpSession.update as jest.Mock;
const playerFindMany = prisma.mvpPlayer.findMany as jest.Mock;
const playerUpdateMany = prisma.mvpPlayer.updateMany as jest.Mock;

const notifySubscribers = notifySessionSubscribers as jest.Mock;
const runAll = trainingPipeline.runAll as jest.Mock;
const retrainInc = predictionRetrainTotal.inc as jest.Mock;

describe('Scheduler', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    srv.remindedSessions.clear();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Lifecycle ───────────────────────────────────────────────
  describe('start / stop', () => {
    it('registers one interval job per scheduled job and stops them all', () => {
      const intervalSpy = jest.spyOn(global as any, 'setInterval').mockReturnValue(1 as any);
      const timeoutSpy = jest.spyOn(global as any, 'setTimeout').mockReturnValue(2 as any);
      const clearSpy = jest.spyOn(global as any, 'clearInterval').mockImplementation(() => {});

      srv.start();
      // Assert the invariant, not a magic count: `start()` must register exactly
      // one interval per job and track each one for `stop()` to clear. This stays
      // valid when a job is added/removed (e.g. Story 6.6's 24 h model retrain).
      const jobCount = intervalSpy.mock.calls.length;
      expect(jobCount).toBeGreaterThanOrEqual(4); // 3 base jobs + model retrain
      expect(timeoutSpy).toHaveBeenCalledTimes(1); // single deferred startup run
      expect(srv.intervals).toHaveLength(jobCount);

      srv.stop();
      expect(clearSpy).toHaveBeenCalledTimes(jobCount);
      expect(srv.intervals).toHaveLength(0);
    });
  });

  // ── Predictive model retraining (Story 6.6) ─────────────────
  describe('retrainModels', () => {
    it('records one metric per type, mapping a skip to its literal reason', async () => {
      runAll.mockResolvedValue({
        demand: { status: 'trained', version: 'v1', evaluation: {} },
        churn: { status: 'skipped', reason: 'insufficient-samples' },
        seasonal: { status: 'trained', version: 'v2', evaluation: {} },
      });

      await srv.retrainModels();

      // Trained types report 'trained' …
      expect(retrainInc).toHaveBeenCalledWith({ type: 'demand', status: 'trained' });
      expect(retrainInc).toHaveBeenCalledWith({ type: 'seasonal', status: 'trained' });
      // … while a skip reports its literal `reason`, NOT the string 'skipped'.
      // (Mapping: `status === 'trained' ? 'trained' : outcome.reason`.)
      expect(retrainInc).toHaveBeenCalledWith({ type: 'churn', status: 'insufficient-samples' });
      expect(retrainInc).not.toHaveBeenCalledWith({ type: 'churn', status: 'skipped' });

      // One increment per returned type.
      expect(retrainInc).toHaveBeenCalledTimes(3);
    });

    it('logs and swallows a pipeline failure — never throws', async () => {
      runAll.mockRejectedValue(new Error('db down'));

      await expect(srv.retrainModels()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalled();
      expect(retrainInc).not.toHaveBeenCalled();
    });
  });

  // ── Session reminders ───────────────────────────────────────
  describe('sendSessionReminders', () => {
    it('notifies subscribers for upcoming sessions', async () => {
      sessionFindMany.mockResolvedValue([
        {
          id: 's1',
          name: 'Monday Badminton',
          scheduledAt: new Date(Date.now() + 30 * 60_000),
          location: 'Community Center',
          shareCode: 'ABC',
        },
      ]);
      notifySubscribers.mockResolvedValue(2);

      await srv.sendSessionReminders();

      expect(notifySubscribers).toHaveBeenCalledTimes(1);
      const [sessionId, payload] = notifySubscribers.mock.calls[0];
      expect(sessionId).toBe('s1');
      expect(payload.type).toBe('SESSION_REMINDER');
      expect(payload.body).toContain('Monday Badminton');
      expect(payload.data.shareCode).toBe('ABC');
    });

    it('dedups reminders across repeated runs', async () => {
      sessionFindMany.mockResolvedValue([
        { id: 's1', name: 'A', scheduledAt: new Date(Date.now() + 30 * 60_000), location: null, shareCode: 'A' },
      ]);
      notifySubscribers.mockResolvedValue(1);

      await srv.sendSessionReminders();
      await srv.sendSessionReminders();

      expect(notifySubscribers).toHaveBeenCalledTimes(1);
    });

    it('clears dedup set when there are no upcoming sessions', async () => {
      srv.remindedSessions.add('old');
      sessionFindMany.mockResolvedValue([]);

      await srv.sendSessionReminders();

      expect(srv.remindedSessions.size).toBe(0);
    });

    it('swallows database errors', async () => {
      sessionFindMany.mockRejectedValue(new Error('db down'));

      await expect(srv.sendSessionReminders()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  // ── Rest expiration ─────────────────────────────────────────
  describe('expireRestPeriods', () => {
    it('flips expired RESTING players back to ACTIVE', async () => {
      playerFindMany.mockResolvedValue([
        { id: 'p1', name: 'Alice', sessionId: 's1' },
        { id: 'p2', name: 'Bob', sessionId: 's1' },
      ]);
      playerUpdateMany.mockResolvedValue({ count: 2 });

      await srv.expireRestPeriods();

      expect(playerUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ['p1', 'p2'] } },
        data: { status: 'ACTIVE', restGamesRemaining: 0, restExpiresAt: null },
      });
    });

    it('does nothing when nobody has an expired rest period', async () => {
      playerFindMany.mockResolvedValue([]);

      await srv.expireRestPeriods();

      expect(playerUpdateMany).not.toHaveBeenCalled();
    });

    it('swallows database errors', async () => {
      playerFindMany.mockRejectedValue(new Error('db down'));

      await expect(srv.expireRestPeriods()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  // ── Auto-complete sessions ──────────────────────────────────
  describe('autoCompleteSessions', () => {
    it('completes a stale session with no in-progress games', async () => {
      sessionFindMany.mockResolvedValue([{ id: 's1', name: 'Old Session', games: [] }]);
      sessionUpdate.mockResolvedValue({ id: 's1', status: 'COMPLETED' });

      await srv.autoCompleteSessions();

      expect(sessionUpdate).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'COMPLETED' },
      });
    });

    it('skips sessions that still have in-progress games', async () => {
      sessionFindMany.mockResolvedValue([
        { id: 's1', name: 'Busy', games: [{ id: 'g1' }] },
      ]);

      await srv.autoCompleteSessions();

      expect(sessionUpdate).not.toHaveBeenCalled();
    });

    it('swallows database errors', async () => {
      sessionFindMany.mockRejectedValue(new Error('db down'));

      await expect(srv.autoCompleteSessions()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
