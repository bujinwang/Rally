/**
 * Story 6.9 — unit tests for the pure notification-preference helpers.
 *
 * These are the only survivors of the deleted `notificationService.ts` (which was
 * broken: its raw SQL targeted nonexistent snake_case columns). They are pure, so
 * they are tested directly with no DB and no mocked persistence layer.
 */

import {
  isNotificationEnabled,
  isInQuietHours,
  parseTimeString,
} from '../notificationPreferences';
import { NotificationType, NotificationPreferences } from '../../types/notifications';

function prefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    matchResults: true,
    achievements: true,
    friendRequests: true,
    challenges: true,
    tournamentUpdates: true,
    socialMessages: false,
    sessionReminders: true,
    pushEnabled: true,
    emailEnabled: false,
    ...overrides,
  };
}

describe('parseTimeString', () => {
  it('encodes HH:MM as HHMM', () => {
    expect(parseTimeString('22:00')).toBe(2200);
    expect(parseTimeString('08:30')).toBe(830);
    expect(parseTimeString('00:00')).toBe(0);
    expect(parseTimeString('23:59')).toBe(2359);
  });
});

describe('isNotificationEnabled', () => {
  it('maps each type to its preference flag', () => {
    const all = prefs({
      matchResults: true,
      achievements: true,
      friendRequests: true,
      challenges: true,
      tournamentUpdates: true,
      socialMessages: true,
      sessionReminders: true,
    });

    expect(isNotificationEnabled(NotificationType.MATCH_RESULT, all)).toBe(true);
    expect(isNotificationEnabled(NotificationType.ACHIEVEMENT_UNLOCK, all)).toBe(true);
    expect(isNotificationEnabled(NotificationType.FRIEND_REQUEST, all)).toBe(true);
    expect(isNotificationEnabled(NotificationType.FRIEND_ACCEPTED, all)).toBe(true);
    expect(isNotificationEnabled(NotificationType.CHALLENGE_RECEIVED, all)).toBe(true);
    expect(isNotificationEnabled(NotificationType.CHALLENGE_RESPONSE, all)).toBe(true);
    expect(isNotificationEnabled(NotificationType.TOURNAMENT_UPDATE, all)).toBe(true);
    expect(isNotificationEnabled(NotificationType.SESSION_REMINDER, all)).toBe(true);
    expect(isNotificationEnabled(NotificationType.SOCIAL_MESSAGE, all)).toBe(true);
  });

  it('honours a disabled flag', () => {
    expect(
      isNotificationEnabled(NotificationType.MATCH_RESULT, prefs({ matchResults: false })),
    ).toBe(false);
    expect(
      isNotificationEnabled(NotificationType.SOCIAL_MESSAGE, prefs({ socialMessages: false })),
    ).toBe(false);
    expect(
      isNotificationEnabled(NotificationType.SESSION_REMINDER, prefs({ sessionReminders: false })),
    ).toBe(false);
  });

  it('always delivers SYSTEM_ANNOUNCEMENT regardless of flags', () => {
    const allOff = prefs({
      matchResults: false,
      achievements: false,
      friendRequests: false,
      challenges: false,
      tournamentUpdates: false,
      socialMessages: false,
      sessionReminders: false,
    });
    expect(isNotificationEnabled(NotificationType.SYSTEM_ANNOUNCEMENT, allOff)).toBe(true);
  });
});

describe('isInQuietHours', () => {
  it('returns false when either bound is missing', () => {
    expect(isInQuietHours(prefs())).toBe(false);
    expect(isInQuietHours(prefs({ quietHoursStart: '22:00' }))).toBe(false);
    expect(isInQuietHours(prefs({ quietHoursEnd: '08:00' }))).toBe(false);
  });

  it('handles a same-day window (13:00–15:00)', () => {
    const p = prefs({ quietHoursStart: '13:00', quietHoursEnd: '15:00' });
    // local-time Dates so getHours()/getMinutes() are deterministic
    expect(isInQuietHours(p, new Date(2026, 0, 1, 14, 0))).toBe(true);
    expect(isInQuietHours(p, new Date(2026, 0, 1, 13, 0))).toBe(true); // inclusive start
    expect(isInQuietHours(p, new Date(2026, 0, 1, 15, 0))).toBe(true); // inclusive end
    expect(isInQuietHours(p, new Date(2026, 0, 1, 12, 59))).toBe(false);
    expect(isInQuietHours(p, new Date(2026, 0, 1, 15, 1))).toBe(false);
  });

  it('handles an overnight window (22:00–08:00)', () => {
    const p = prefs({ quietHoursStart: '22:00', quietHoursEnd: '08:00' });
    expect(isInQuietHours(p, new Date(2026, 0, 1, 23, 0))).toBe(true);
    expect(isInQuietHours(p, new Date(2026, 0, 1, 2, 0))).toBe(true);
    expect(isInQuietHours(p, new Date(2026, 0, 1, 22, 0))).toBe(true); // inclusive start
    expect(isInQuietHours(p, new Date(2026, 0, 1, 8, 0))).toBe(true); // inclusive end
    expect(isInQuietHours(p, new Date(2026, 0, 1, 12, 0))).toBe(false);
    expect(isInQuietHours(p, new Date(2026, 0, 1, 21, 59))).toBe(false);
  });
});
