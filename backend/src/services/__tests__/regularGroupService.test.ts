import { predictNextSessionTime } from '../regularGroupService';

// Mock Prisma for getSessionSuggestions
jest.mock('../../config/database', () => ({
  prisma: {
    mvpSession: { findMany: jest.fn() },
  },
}));

import { prisma } from '../../config/database';
import { getSessionSuggestions } from '../regularGroupService';

describe('regularGroupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── predictNextSessionTime ──────────────────────────────────

  describe('predictNextSessionTime', () => {
    it('predicts next weekday occurrence correctly', () => {
      // Mock date to Monday May 11, 2026
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-11T12:00:00')); // Monday

      // Predict next Friday (day 5) at 19:00
      const result = predictNextSessionTime(5, '19:00');

      // Should be Friday May 15
      expect(result.getDay()).toBe(5); // Friday
      expect(result.getHours()).toBe(19);
      expect(result.getMinutes()).toBe(0);

      jest.useRealTimers();
    });

    it('predicts next week if target day is today (same day)', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-11T10:00:00')); // Monday

      // Predict next Monday (day 1) at 19:00 — same day
      const result = predictNextSessionTime(1, '19:00');

      // Since daysUntil <= 0 when currentDay === targetDay, it adds 7
      expect(result.getDay()).toBe(1); // Monday
      expect(result.getDate()).toBeGreaterThan(11); // Must be next week (18)

      jest.useRealTimers();
    });

    it('predicts same week if target day is later this week', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-11T10:00:00')); // Monday

      // Predict Wednesday (day 3) at 20:30
      const result = predictNextSessionTime(3, '20:30');

      expect(result.getDay()).toBe(3); // Wednesday
      // Should be May 13 (2 days from May 11)
      expect(result.getHours()).toBe(20);
      expect(result.getMinutes()).toBe(30);

      jest.useRealTimers();
    });

    it('defaults to 18:00 when typicalTime is malformed', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-11T10:00:00'));

      // empty string defaults to 18:00
      const result = predictNextSessionTime(5, '');
      expect(result.getHours()).toBe(18);
      expect(result.getMinutes()).toBe(0);

      jest.useRealTimers();
    });

    it('handles Sunday correctly', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-16T10:00:00')); // Saturday

      // Predict next Sunday (day 0) at 10:00
      const result = predictNextSessionTime(0, '10:00');

      expect(result.getDay()).toBe(0); // Sunday
      // Should be tomorrow (May 17)

      jest.useRealTimers();
    });

    it('crosses month boundaries correctly', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-29T10:00:00')); // Friday

      // Predict next Monday (day 1) at 19:00
      const result = predictNextSessionTime(1, '19:00');

      expect(result.getDay()).toBe(1); // Monday
      // Should be June 1, 2026

      jest.useRealTimers();
    });
  });

  // ── getSessionSuggestions ───────────────────────────────────

  describe('getSessionSuggestions', () => {
    it('returns empty array when device has < 2 sessions', async () => {
      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getSessionSuggestions('device1');
      expect(result).toEqual([]);
    });

    it('detects single-day recurring group', async () => {
      // 4 sessions, all Mondays, same players
      const sessions = [
        makeSession('Mon Session', '2026-05-04T19:00:00', ['David', 'Kevin', 'Jie'], 'Community Center'),
        makeSession('Mon Session 2', '2026-04-27T19:00:00', ['David', 'Kevin', 'Jie'], 'Community Center'),
        makeSession('Mon Session 3', '2026-04-20T19:00:00', ['David', 'Kevin', 'Jie'], 'Community Center'),
        makeSession('Mon Session 4', '2026-04-13T19:30:00', ['David', 'Kevin', 'Jie'], 'Community Center'),
      ];

      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue(sessions);

      const result = await getSessionSuggestions('device1', 2, 0); // minDaysSinceLast=0 to include all

      expect(result.length).toBe(1); // one group, one recurring day
      expect(result[0].playerNames).toEqual(['David', 'Jie', 'Kevin']);
      expect(result[0].dayOfWeek).toBe(1); // Monday
      expect(result[0].recurringDays).toEqual([1]);
      expect(result[0].sessionCount).toBe(4);
      expect(result[0].daySessionCount).toBe(4);
      expect(result[0].sport).toBe('badminton');
    });

    it('detects multi-day recurring group (Mon + Fri)', async () => {
      // 6 sessions: 3 Mondays, 3 Fridays, same players
      const sessions = [
        makeSession('Monday A', '2026-05-04T19:00:00', ['David', 'Kevin'], 'Community Center'),
        makeSession('Friday A', '2026-05-01T20:00:00', ['David', 'Kevin'], 'Community Center'),
        makeSession('Monday B', '2026-04-27T19:00:00', ['David', 'Kevin'], 'Community Center'),
        makeSession('Friday B', '2026-04-24T20:00:00', ['David', 'Kevin'], 'Community Center'),
        makeSession('Monday C', '2026-04-20T19:00:00', ['David', 'Kevin'], 'Community Center'),
        makeSession('Friday C', '2026-04-17T20:00:00', ['David', 'Kevin'], 'Community Center'),
      ];

      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue(sessions);

      const result = await getSessionSuggestions('device1', 2, 0);

      // Should produce TWO suggestions — one for Monday, one for Friday
      expect(result.length).toBe(2);

      const monday = result.find(s => s.dayOfWeek === 1)!;
      const friday = result.find(s => s.dayOfWeek === 5)!;

      expect(monday).toBeTruthy();
      expect(friday).toBeTruthy();

      // Both share the same recurringDays context
      expect(monday.recurringDays.sort()).toEqual([1, 5]);
      expect(friday.recurringDays.sort()).toEqual([1, 5]);

      expect(monday.typicalTime).toContain('19:');
      expect(friday.typicalTime).toContain('20:');

      expect(monday.daySessionCount).toBe(3);
      expect(friday.daySessionCount).toBe(3);
      expect(monday.sessionCount).toBe(6);
    });

    it('excludes groups with fewer sessions than minOccurrences', async () => {
      const sessions = [
        makeSession('One', '2026-05-04T19:00:00', ['David', 'Kevin'], 'CC'),
      ];

      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue(sessions);

      const result = await getSessionSuggestions('device1', 2, 0);
      expect(result).toEqual([]);
    });

    it('excludes groups that played too recently', async () => {
      // Session from 2 days ago — less than minDaysSinceLast=5
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const oneWeekAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

      const sessions = [
        makeSession('Recent', twoDaysAgo, ['David', 'Kevin'], 'CC'),
        makeSession('Older', oneWeekAgo, ['David', 'Kevin'], 'CC'),
      ];

      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue(sessions);

      const result = await getSessionSuggestions('device1', 2, 5);
      expect(result).toEqual([]); // too recent
    });

    it('ignores sessions with < 2 players', async () => {
      const sessions = [
        makeSession('Solo', '2026-05-04T19:00:00', ['David'], 'CC'),
        makeSession('Solo 2', '2026-04-27T19:00:00', ['David'], 'CC'),
      ];

      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue(sessions);

      const result = await getSessionSuggestions('device1', 2, 0);
      expect(result).toEqual([]);
    });

    it('identifies most common location and sport across sessions', async () => {
      const sessions = [
        makeSession('A', '2026-05-04T19:00:00', ['David', 'Kevin'], 'Gym A', 'pickleball'),
        makeSession('B', '2026-04-27T19:00:00', ['David', 'Kevin'], 'Gym A', 'pickleball'),
        makeSession('C', '2026-04-20T19:00:00', ['David', 'Kevin'], 'Gym B', 'badminton'),
      ];

      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue(sessions);

      const result = await getSessionSuggestions('device1', 2, 0);

      expect(result[0].location).toBe('Gym A'); // 2 of 3 at Gym A
      expect(result[0].sport).toBe('pickleball'); // 2 of 3 pickleball
    });

    it('computes typicalTime per day as hourly average', async () => {
      const sessions = [
        makeSession('Mon Late', '2026-05-04T20:30:00', ['David', 'Kevin'], 'CC'),
        makeSession('Mon Early', '2026-04-27T18:30:00', ['David', 'Kevin'], 'CC'),
        makeSession('Mon Mid', '2026-04-20T19:30:00', ['David', 'Kevin'], 'CC'),
        makeSession('Mon Mid2', '2026-04-13T19:30:00', ['David', 'Kevin'], 'CC'),
      ];

      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue(sessions);

      const result = await getSessionSuggestions('device1', 2, 0);

      // One suggestion for Monday with averaged time
      expect(result.length).toBe(1);
      expect(result[0].dayOfWeek).toBe(1); // Monday
      // Average of (20:30=1230min, 18:30=1110min, 19:30=1170min, 19:30=1170min) / 4 = 1170min = 19:30
      expect(result[0].typicalTime).toBe('19:30');
      expect(result[0].daySessionCount).toBe(4);
    });
  });
});

// ── Helpers ──────────────────────────────────────────────────

function makeSession(
  name: string,
  isoDate: string,
  playerNames: string[],
  location: string,
  sport: string = 'badminton',
) {
  // Parse without timezone to use local time, matching how the service accesses .getHours()
  const d = new Date(isoDate);
  return {
    name,
    scheduledAt: d,
    location,
    sport,
    players: playerNames.map(name => ({ name })),
    ownerDeviceId: 'device1',
    status: 'COMPLETED',
  };
}
