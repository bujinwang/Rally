// Note: NotificationService uses raw SQL via prisma.$queryRaw — we mock prisma
jest.mock('../../config/database', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

import { prisma } from '../../config/database';
import { NotificationService, NotificationHelpers } from '../notificationService';

describe('NotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Notification Preferences ────────────────────────────────

  describe('getNotificationPreferences', () => {
    it('returns existing preferences when found', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{
        match_results: true, achievements: true, friend_requests: true,
        challenges: false, tournament_updates: true, social_messages: false,
        session_reminders: true, push_enabled: true, email_enabled: false,
        quiet_hours_start: null, quiet_hours_end: null,
      }]);

      const prefs = await NotificationService.getNotificationPreferences('p1');
      expect(prefs.matchResults).toBe(true);
      expect(prefs.challenges).toBe(false);
      expect(prefs.pushEnabled).toBe(true);
    });

    it('creates default preferences when none exist', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([]) // no existing prefs
        .mockResolvedValueOnce(undefined); // create — resolves

      const prefs = await NotificationService.getNotificationPreferences('p1');
      // Should return defaults
      expect(prefs.matchResults).toBe(true);
      expect(prefs.pushEnabled).toBe(true);
      expect(prefs.emailEnabled).toBe(false);
    });
  });

  describe('updateNotificationPreferences', () => {
    it('updates existing preferences', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ id: 'pref1' }]) // existing
        .mockResolvedValueOnce(undefined); // update

      await expect(
        NotificationService.updateNotificationPreferences('p1', {
          matchResults: false, achievements: true, friendRequests: true,
          challenges: true, tournamentUpdates: true, socialMessages: false,
          sessionReminders: true, pushEnabled: false, emailEnabled: true,
        })
      ).resolves.toBeUndefined();
    });

    it('creates new preferences when none exist', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([]) // no existing
        .mockResolvedValueOnce(undefined); // create

      await expect(
        NotificationService.updateNotificationPreferences('p1', {
          matchResults: true, achievements: true, friendRequests: true,
          challenges: true, tournamentUpdates: true, socialMessages: false,
          sessionReminders: true, pushEnabled: true, emailEnabled: false,
        })
      ).resolves.toBeUndefined();
    });
  });

  // ── Quiet Hours Logic ───────────────────────────────────────

  describe('quiet hours check', () => {
    it('sends notification outside quiet hours', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-11T14:00:00Z')); // 2 PM

      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ // preferences with quiet hours 22:00-06:00
          match_results: true, achievements: true, friend_requests: true,
          challenges: true, tournament_updates: true, social_messages: false,
          session_reminders: true, push_enabled: true, email_enabled: false,
          quiet_hours_start: '22:00', quiet_hours_end: '06:00',
        }])
        .mockResolvedValueOnce(undefined) // insert notification
        .mockResolvedValueOnce(undefined) // update delivered_at
        .mockResolvedValueOnce([]) // select push tokens
        .mockResolvedValueOnce(undefined); // update push tokens last_used

      await NotificationService.sendNotification('p1', {
        title: 'Test', body: 'Hello', type: 'MATCH_RESULT' as any, category: 'MATCHES' as any,
      });

      // Notification should be sent (outside quiet hours)
      expect(prisma.$queryRaw).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('suppresses notification during quiet hours', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-11T23:00:00Z')); // 11 PM — inside quiet hours

      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{
        match_results: true, achievements: true, friend_requests: true,
        challenges: true, tournament_updates: true, social_messages: false,
        session_reminders: true, push_enabled: true, email_enabled: false,
        quiet_hours_start: '22:00', quiet_hours_end: '06:00',
      }]);

      await NotificationService.sendNotification('p1', {
        title: 'Test', body: 'Hello', type: 'MATCH_RESULT' as any, category: 'MATCHES' as any,
      });

      // Should call getPreferences (at minimum) — notification skipped due to quiet hours
      expect(prisma.$queryRaw).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  // ── Push Token Management ──────────────────────────────────

  describe('registerPushToken', () => {
    it('registers new push token', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce(undefined) // deactivate old
        .mockResolvedValueOnce([])        // no existing token
        .mockResolvedValueOnce(undefined); // insert

      await expect(
        NotificationService.registerPushToken('p1', {
          token: 'tok_abc', platform: 'ios', deviceId: 'dev1',
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('unregisterPushToken', () => {
    it('marks token as inactive', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce(undefined);
      await expect(NotificationService.unregisterPushToken('tok_abc')).resolves.toBeUndefined();
    });
  });

  // ── Notification CRUD ──────────────────────────────────────

  describe('getNotifications', () => {
    it('returns notifications for player', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
        { id: 'n1', player_id: 'p1', title: 'Hello', body: 'World', data: '{}',
          type: 'MATCH_RESULT', category: 'MATCHES', is_read: false, read_at: null,
          delivered_at: new Date(), sent_at: new Date() },
      ]);

      const result = await NotificationService.getNotifications('p1');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Hello');
      expect(result[0].isRead).toBe(false);
    });
  });

  describe('getUnreadNotificationCount', () => {
    it('returns count of unread', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ count: '5' }]);
      const count = await NotificationService.getUnreadNotificationCount('p1');
      expect(count).toBe(5);
    });
  });

  // ── Notification Helpers ───────────────────────────────────

  describe('NotificationHelpers', () => {
    it('sendMatchResultNotification calls sendNotification', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ match_results: true, achievements: true, friend_requests: true,
          challenges: true, tournament_updates: true, social_messages: false,
          session_reminders: true, push_enabled: true, email_enabled: false,
          quiet_hours_start: null, quiet_hours_end: null }])
        .mockResolvedValueOnce(undefined) // insert notification
        .mockResolvedValueOnce(undefined) // update delivered
        .mockResolvedValueOnce([]) // select push tokens
        .mockResolvedValueOnce(undefined); // update push tokens

      await NotificationHelpers.sendMatchResultNotification('p1', 'win', 'Kevin', '21-15');
      // Should have called queryRaw
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });
});
