/**
 * notificationPreferenceMapping.ts — pure, typed label→preference-key mapping
 * for the notification-consent UI (Story 6.9, AC 3, finding F11).
 *
 * ## Why this module exists
 *
 * The reachable Settings UI used to save its five notification switches to the
 * `user_settings` table, but the live push gate reads `notification_preferences`
 * (`backend/src/utils/notificationHelper.ts:118-131` → `loadPreferences`
 * `:95-106`). Two of the label→column mappings were silently mis-wired:
 *
 *   - "Messages"        → `user_settings.messages`        but the gate reads `socialMessages`
 *   - "Session Invites" → `user_settings.sessionInvites`  but the gate reads `sessionReminders`
 *
 * The mapping is extracted here as **pure data** so it can be unit-tested
 * directly (T12a) without rendering, and so the screen cannot drift from it.
 *
 * ## Contract
 *
 * Every emitted `preferenceKey` MUST be a column the backend accepts on
 * `PUT /notifications/preferences` (`backend/src/routes/notifications.ts:61-73`).
 * The handler's `pickPreferenceFields` (`:102-117`) **silently drops** unknown
 * keys, so a typo here would fail open (a switch that appears to save but does
 * nothing) rather than throw — hence the explicit accepted-set guard.
 */

import type { Translation } from '../i18n/translations';

/** A label key within the `settings` i18n group. */
export type SettingsI18nKey = keyof Translation['settings'];

/**
 * The `notification_preferences` columns this UI is allowed to read/write.
 * Deliberately a closed union so a bad key is a compile error.
 */
export type NotificationPreferenceKey =
  | 'friendRequests'
  | 'socialMessages'
  | 'sessionReminders'
  | 'matchResults'
  | 'achievements'
  | 'pushEnabled';

/** One notification switch: UI identity + the preference column it controls. */
export interface NotificationPreferenceEntry {
  /** Stable UI id (React key + toggle handler argument). */
  readonly id: string;
  /** The `notification_preferences` column this switch reads and writes. */
  readonly preferenceKey: NotificationPreferenceKey;
  /** i18n key for the switch label. */
  readonly labelKey: SettingsI18nKey;
  /** i18n key for the switch description. */
  readonly descriptionKey: SettingsI18nKey;
}

/**
 * The five per-category switches, in display order. The two re-mapped rows
 * (`socialMessages`, `sessionReminders`) are the fix for the silent mis-wiring.
 */
export const NOTIFICATION_PREFERENCE_ENTRIES: readonly NotificationPreferenceEntry[] = [
  {
    id: 'friendRequests',
    preferenceKey: 'friendRequests',
    labelKey: 'friendRequests',
    descriptionKey: 'friendRequestsDescription',
  },
  {
    id: 'messages',
    preferenceKey: 'socialMessages',
    labelKey: 'messages',
    descriptionKey: 'messagesDescription',
  },
  {
    id: 'sessionInvites',
    preferenceKey: 'sessionReminders',
    labelKey: 'sessionInvites',
    descriptionKey: 'sessionInvitesDescription',
  },
  {
    id: 'matchResults',
    preferenceKey: 'matchResults',
    labelKey: 'matchResults',
    descriptionKey: 'matchResultsDescription',
  },
  {
    id: 'achievements',
    preferenceKey: 'achievements',
    labelKey: 'achievements',
    descriptionKey: 'achievementsDescription',
  },
] as const;

/** The master push toggle's preference column. `false` suppresses all pushes. */
export const PUSH_ENABLED_KEY = 'pushEnabled' as const;

/** The master push toggle descriptor (currently unreachable from any other UI). */
export const PUSH_ENABLED_ENTRY: NotificationPreferenceEntry = {
  id: 'pushEnabled',
  preferenceKey: PUSH_ENABLED_KEY,
  labelKey: 'pushEnabled',
  descriptionKey: 'pushEnabledDescription',
} as const;

/**
 * Every preference key the backend accepts on `PUT /notifications/preferences`
 * (`backend/src/routes/notifications.ts:61-73`). Kept as the single source of
 * truth for the accepted-set assertion in T12a and the client-side sanitizer.
 */
export const ACCEPTED_PREFERENCE_KEYS = [
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
] as const;

export type AcceptedPreferenceKey = (typeof ACCEPTED_PREFERENCE_KEYS)[number];

/** Every preference key this UI emits: the five switches + the master toggle. */
export const UI_EMITTED_PREFERENCE_KEYS: readonly NotificationPreferenceKey[] = [
  ...NOTIFICATION_PREFERENCE_ENTRIES.map((entry) => entry.preferenceKey),
  PUSH_ENABLED_KEY,
];

/** Type guard: is `key` a column the backend accepts? */
export function isAcceptedPreferenceKey(key: string): key is AcceptedPreferenceKey {
  return (ACCEPTED_PREFERENCE_KEYS as readonly string[]).includes(key);
}
