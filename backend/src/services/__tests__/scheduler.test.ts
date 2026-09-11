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
  notifyDevice: jest.fn(),
}));

jest.mock('../matchSchedulingService', () => ({
  MatchSchedulingService: {
    getUpcomingReminders: jest.fn(),
    markReminderSent: jest.fn(),
  },
}));

import { prisma } from '../../config/database';
import { notifySessionSubscribers, notifyDevice } from '../../utils/notificationHelper';
import { MatchSchedulingService } from '../matchSchedulingService';

const srv: any = scheduler;

const sessionFindMany = prisma.mvpSession.findMany as jest.Mock;
const sessionUpdate = prisma.mvpSession.update as jest.Mock;
const playerFindMany = prisma.mvpPlayer.findMany as jest.Mock;
const playerUpdateMany = prisma.mvpPlayer.updateMany as jest.Mock;

const notifySubscribers = notifySessionSubscribers as jest.Mock;
const notifyDev = notifyDevice as jest.Mock;
const getUpcomingReminders = MatchSchedulingService.getUpcomingReminders as jest.Mock;
const markReminderSent = MatchSchedulingService.markReminderSent as jest.Mock;

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
    it('registers 5 interval jobs and stops them', () => {
      const intervalSpy = jest.spyOn(global as any, 'setInterval').mockReturnValue(1 as any);
      const timeoutSpy = jest.spyOn(global as any, 'setTimeout').mockReturnValue(2 as any);
      const clearSpy = jest.spyOn(global as any, 'clearInterval').mockImplementation(() => {});

      srv.start();
      // 5 jobs since Story 6.6: the 4. job set plus the 24 h model retrain.
      expect(intervalSpy).toHaveBeenCalledTimes(5);
      expect(timeoutSpy).toHaveBeenCalledTimes(1);
      expect(srv.intervals).toHaveLength(5);

      srv.stop();
      expect(clearSpy).toHaveBeenCalledTimes(5);
      expect(srv.intervals).toHaveLength(0);
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

  // ── Match reminders ─────────────────────────────────────────
  describe('sendMatchReminders', () => {
    it('notifies each player and marks the reminder sent', async () => {
      getUpcomingReminders.mockResolvedValue([
        {
          id: 'r1',
          userId: 'u1',
          matchId: 'm1',
          match: { id: 'm1', title: 'Semi-final', sessionId: 's1' },
        },
      ]);
      notifyDev.mockResolvedValue(true);
      markReminderSent.mockResolvedValue(undefined);

      await srv.sendMatchReminders();

      expect(notifyDev).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ type: 'MATCH_REMINDER', data: { matchId: 'm1', sessionId: 's1' } }),
      );
      expect(markReminderSent).toHaveBeenCalledWith('r1');
    });

    it('skips reminders whose match is missing', async () => {
      getUpcomingReminders.mockResolvedValue([{ id: 'r2', userId: 'u1', matchId: 'm2', match: null }]);

      await srv.sendMatchReminders();

      expect(notifyDev).not.toHaveBeenCalled();
      expect(markReminderSent).not.toHaveBeenCalled();
    });

    it('does not mark sent when delivery fails', async () => {
      getUpcomingReminders.mockResolvedValue([
        { id: 'r3', userId: 'u1', matchId: 'm1', match: { id: 'm1', title: 'Final', sessionId: 's1' } },
      ]);
      notifyDev.mockResolvedValue(false);

      await srv.sendMatchReminders();

      expect(markReminderSent).not.toHaveBeenCalled();
    });

    it('swallows errors from the scheduling service', async () => {
      getUpcomingReminders.mockRejectedValue(new Error('db down'));

      await expect(srv.sendMatchReminders()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
