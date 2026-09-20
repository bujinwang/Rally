/**
 * Story 6.9 — T12a: unit test for the pure label→preference-key mapping.
 *
 * This pins the two silently mis-wired rows (F11) and asserts that every key
 * the UI emits is one the server accepts. The accepted set is the backend
 * validator at `backend/src/routes/notifications.ts:61-73`; `pickPreferenceFields`
 * (`:102-117`) silently drops unknown keys, so a drift here would fail *open*
 * (a switch that appears to save but does nothing) — hence the explicit guard.
 *
 * Pure module, no rendering, no missing deps.
 */

import {
  NOTIFICATION_PREFERENCE_ENTRIES,
  PUSH_ENABLED_ENTRY,
  PUSH_ENABLED_KEY,
  UI_EMITTED_PREFERENCE_KEYS,
  ACCEPTED_PREFERENCE_KEYS,
  isAcceptedPreferenceKey,
} from '../notificationPreferenceMapping';

// Mirrors `preferencesUpdateValidation` (routes/notifications.ts:61-73). Hard-coded
// on purpose so a drift in the module's own accepted list is caught here.
const SERVER_ACCEPTED_KEYS = [
  'pushEnabled',
  'matchResults',
  'achievements',
  'friendRequests',
  'challenges',
  'tournamentUpdates',
  'socialMessages',
  'sessionReminders',
  'emailEnabled',
  'quietHoursStart',
  'quietHoursEnd',
];

describe('notificationPreferenceMapping (Story 6.9 AC 3)', () => {
  it('has exactly five category switches', () => {
    expect(NOTIFICATION_PREFERENCE_ENTRIES).toHaveLength(5);
  });

  it('maps "Messages" to socialMessages (was mis-wired to messages)', () => {
    const entry = NOTIFICATION_PREFERENCE_ENTRIES.find((e) => e.id === 'messages');
    expect(entry).toBeDefined();
    expect(entry?.preferenceKey).toBe('socialMessages');
    // The old, wrong key must not appear anywhere.
    expect(NOTIFICATION_PREFERENCE_ENTRIES.map((e) => e.preferenceKey)).not.toContain('messages');
  });

  it('maps "Session Invites" to sessionReminders (was mis-wired to sessionInvites)', () => {
    const entry = NOTIFICATION_PREFERENCE_ENTRIES.find((e) => e.id === 'sessionInvites');
    expect(entry).toBeDefined();
    expect(entry?.preferenceKey).toBe('sessionReminders');
    expect(NOTIFICATION_PREFERENCE_ENTRIES.map((e) => e.preferenceKey)).not.toContain('sessionInvites');
  });

  it('maps the unchanged rows correctly', () => {
    const byId = new Map(NOTIFICATION_PREFERENCE_ENTRIES.map((e) => [e.id, e.preferenceKey]));
    expect(byId.get('friendRequests')).toBe('friendRequests');
    expect(byId.get('matchResults')).toBe('matchResults');
    expect(byId.get('achievements')).toBe('achievements');
  });

  it('emits the master pushEnabled toggle', () => {
    expect(PUSH_ENABLED_ENTRY.preferenceKey).toBe('pushEnabled');
    expect(UI_EMITTED_PREFERENCE_KEYS).toContain(PUSH_ENABLED_KEY);
  });

  it('every emitted preferenceKey is in the server-accepted set', () => {
    for (const key of UI_EMITTED_PREFERENCE_KEYS) {
      expect(SERVER_ACCEPTED_KEYS).toContain(key);
      expect(isAcceptedPreferenceKey(key)).toBe(true);
    }
  });

  it('the module accepted set matches the backend validator exactly', () => {
    expect([...ACCEPTED_PREFERENCE_KEYS].sort()).toEqual([...SERVER_ACCEPTED_KEYS].sort());
  });

  it('rejects keys the server does not accept', () => {
    expect(isAcceptedPreferenceKey('messages')).toBe(false);
    expect(isAcceptedPreferenceKey('sessionInvites')).toBe(false);
    expect(isAcceptedPreferenceKey('nope')).toBe(false);
  });
});
