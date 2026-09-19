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
  isTypeEnabled,
  isAllowedForGuest,
  NOTIFICATION_TYPE_PREFERENCE,
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

describe('NOTIFICATION_TYPE_PREFERENCE (single source of truth)', () => {
  it('maps every type observed at a live call site to a preference column', () => {
    // These strings are the ones actually passed to notifySessionSubscribers /
    // notifyDevice / notifyPlayer (grep of routes, services and socket handlers).
    const liveTypes = [
      'FRIEND_REQUEST',
      'FRIEND_ACCEPTED',
      'NEW_MESSAGE',
      'SESSION_REMINDER',
      'MATCH_REMINDER',
      'SCORE_RECORDED',
      'PAIRING_GENERATED',
      'PLAYER_JOINED',
      'GAME_COMPLETED',
    ];
    for (const type of liveTypes) {
      expect(NOTIFICATION_TYPE_PREFERENCE[type]).toBeDefined();
    }
  });

  it('routes each type to the expected column', () => {
    expect(NOTIFICATION_TYPE_PREFERENCE.SESSION_REMINDER).toBe('sessionReminders');
    expect(NOTIFICATION_TYPE_PREFERENCE.SCORE_RECORDED).toBe('matchResults');
    expect(NOTIFICATION_TYPE_PREFERENCE.MATCH_REMINDER).toBe('matchResults');
    expect(NOTIFICATION_TYPE_PREFERENCE.FRIEND_REQUEST).toBe('friendRequests');
    expect(NOTIFICATION_TYPE_PREFERENCE.NEW_MESSAGE).toBe('socialMessages');
    expect(NOTIFICATION_TYPE_PREFERENCE.CHALLENGE_RECEIVED).toBe('challenges');
    expect(NOTIFICATION_TYPE_PREFERENCE.ACHIEVEMENT_UNLOCK).toBe('achievements');
    expect(NOTIFICATION_TYPE_PREFERENCE.TOURNAMENT_UPDATE).toBe('tournamentUpdates');
  });
});

describe('isTypeEnabled', () => {
  it('honours the mapped preference column', () => {
    expect(isTypeEnabled('SESSION_REMINDER', prefs({ sessionReminders: false }))).toBe(false);
    expect(isTypeEnabled('SESSION_REMINDER', prefs({ sessionReminders: true }))).toBe(true);
    expect(isTypeEnabled('NEW_MESSAGE', prefs({ socialMessages: false }))).toBe(false);
    expect(isTypeEnabled('NEW_MESSAGE', prefs({ socialMessages: true }))).toBe(true);
  });

  it('is not suppressed for an unmapped type (no column to honour)', () => {
    expect(isTypeEnabled('SOME_FUTURE_TYPE', prefs())).toBe(true);
  });

  it('always delivers SYSTEM_ANNOUNCEMENT', () => {
    const allOff = prefs({
      matchResults: false,
      achievements: false,
      friendRequests: false,
      challenges: false,
      tournamentUpdates: false,
      socialMessages: false,
      sessionReminders: false,
    });
    expect(isTypeEnabled('SYSTEM_ANNOUNCEMENT', allOff)).toBe(true);
  });
});

describe('isAllowedForGuest (AC 5 — deny-by-default allow-list)', () => {
  it('allows exactly the eight guest types', () => {
    const allowed = [
      'SESSION_REMINDER',
      'SESSION_STARTING',
      'SESSION_UPDATED',
      'PLAYER_JOINED',
      'PAIRING_GENERATED',
      'GAME_READY',
      'NEXT_UP',
      'SCORE_RECORDED',
    ];
    for (const type of allowed) {
      expect(isAllowedForGuest(type)).toBe(true);
    }
  });

  it('denies social, challenge, achievement, match-result and tournament types', () => {
    const denied = [
      'FRIEND_REQUEST',
      'FRIEND_ACCEPTED',
      'CHALLENGE_RECEIVED',
      'CHALLENGE_RESPONSE',
      'SOCIAL_MESSAGE',
      'NEW_MESSAGE',
      'ACHIEVEMENT_UNLOCK',
      'MATCH_RESULT',
      'TOURNAMENT_UPDATE',
    ];
    for (const type of denied) {
      expect(isAllowedForGuest(type)).toBe(false);
    }
  });

  it('denies SYSTEM_ANNOUNCEMENT by default', () => {
    expect(isAllowedForGuest('SYSTEM_ANNOUNCEMENT')).toBe(false);
  });

  it('denies an unknown/unmapped type (fails closed)', () => {
    expect(isAllowedForGuest('TOTALLY_NEW_TYPE')).toBe(false);
    expect(isAllowedForGuest('')).toBe(false);
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
