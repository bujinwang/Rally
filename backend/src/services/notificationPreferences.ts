import { NotificationType, NotificationPreferences } from '../types/notifications';

/**
 * Story 6.9 — pure notification-preference helpers.
 *
 * These three functions were the ONLY correct, DB-free logic in the deleted
 * `services/notificationService.ts`. That service was broken, not merely
 * orphaned: every DB method issued `$queryRaw` SQL against snake_case columns
 * (`player_id`, `is_active`, `match_results`, `is_read`, `sent_at`, …) that do
 * not exist in the live camelCase schema, so it threw on every call and had
 * never executed (its only importer was its own mock-based test). The DB methods
 * and the ten `NotificationHelper` domain senders were deliberately NOT ported —
 * they were unreachable AND non-functional.
 *
 * What remains here is pure: no `prisma`, no I/O, no clock side effects beyond
 * reading the current time. Kept byte-for-byte in behaviour with the originals.
 */

/**
 * Effective preferences for a recipient who has no stored row. Mirrors the
 * schema defaults (`socialMessages` defaults to `false`, everything else to
 * `true`). Kept here — not in the DB layer — so the send path and the
 * preferences endpoint resolve a missing row identically.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  matchResults: true,
  achievements: true,
  friendRequests: true,
  challenges: true,
  tournamentUpdates: true,
  socialMessages: false,
  sessionReminders: true,
  pushEnabled: true,
  emailEnabled: false,
};

/**
 * Structural shape of a persisted `notification_preferences` row (the columns
 * this module cares about). Typed structurally rather than importing the Prisma
 * model so this module stays dependency-free and unit-testable.
 */
export interface StoredNotificationPreferences {
  matchResults: boolean;
  achievements: boolean;
  friendRequests: boolean;
  challenges: boolean;
  tournamentUpdates: boolean;
  socialMessages: boolean;
  sessionReminders: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

/**
 * Map a persisted row onto the {@link NotificationPreferences} contract,
 * normalising the nullable quiet-hour columns to `undefined`.
 */
export function toNotificationPreferences(
  row: StoredNotificationPreferences,
): NotificationPreferences {
  return {
    matchResults: row.matchResults,
    achievements: row.achievements,
    friendRequests: row.friendRequests,
    challenges: row.challenges,
    tournamentUpdates: row.tournamentUpdates,
    socialMessages: row.socialMessages,
    sessionReminders: row.sessionReminders,
    pushEnabled: row.pushEnabled,
    emailEnabled: row.emailEnabled,
    quietHoursStart: row.quietHoursStart ?? undefined,
    quietHoursEnd: row.quietHoursEnd ?? undefined,
  };
}

/**
 * The preference column that governs a notification type.
 */
export type PreferenceColumn =
  | 'sessionReminders'
  | 'matchResults'
  | 'friendRequests'
  | 'challenges'
  | 'achievements'
  | 'socialMessages'
  | 'tournamentUpdates';

/**
 * SINGLE SOURCE OF TRUTH: live notification type string → preference column.
 *
 * The types used across the codebase are plain strings (not a Prisma enum), so
 * this map is the one place that binds them to a preference. Keys were reconciled
 * against the real call sites (`scheduler`, `scoring`, `pairings`, `mvpSessions`,
 * `friends`, `messaging`, `socket/notificationHandlers`). Do NOT scatter string
 * comparisons elsewhere.
 *
 * An unmapped type is intentionally NOT suppressed by a per-type flag (see
 * `isTypeEnabled`) — but it IS denied to device-only callers (see
 * `isAllowedForGuest`), which is the safety-critical direction.
 */
export const NOTIFICATION_TYPE_PREFERENCE: Readonly<Record<string, PreferenceColumn>> = {
  // Session lifecycle (the bulk of live call sites)
  SESSION_REMINDER: 'sessionReminders',
  SESSION_STARTING: 'sessionReminders',
  SESSION_UPDATED: 'sessionReminders',
  PLAYER_JOINED: 'sessionReminders',
  PAIRING_GENERATED: 'sessionReminders',
  GAME_READY: 'sessionReminders',
  NEXT_UP: 'sessionReminders',
  REST_APPROVED: 'sessionReminders',
  REST_DENIED: 'sessionReminders',
  // Matches / scoring
  MATCH_REMINDER: 'matchResults',
  MATCH_RESULT: 'matchResults',
  SCORE_RECORDED: 'matchResults',
  GAME_COMPLETED: 'matchResults',
  // Social
  FRIEND_REQUEST: 'friendRequests',
  FRIEND_ACCEPTED: 'friendRequests',
  NEW_MESSAGE: 'socialMessages',
  SOCIAL_MESSAGE: 'socialMessages',
  // Challenges
  CHALLENGE_RECEIVED: 'challenges',
  CHALLENGE_RESPONSE: 'challenges',
  // Achievements
  ACHIEVEMENT_UNLOCK: 'achievements',
  // Tournaments
  TOURNAMENT_UPDATE: 'tournamentUpdates',
};

/** Types delivered regardless of per-type flags (system announcements). */
export const ALWAYS_ON_NOTIFICATION_TYPES: ReadonlySet<string> = new Set(['SYSTEM_ANNOUNCEMENT']);

/**
 * AC 5 (product decision) — the ONLY types a **device-only** token (a token row
 * with no `userId`) may receive. This is a **deny-by-default** allow-list: any
 * type not present here — including any future/unmapped type — is refused for
 * guests, so a new type added without updating this list fails closed.
 */
export const GUEST_ALLOWED_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  'SESSION_REMINDER',
  'SESSION_STARTING',
  'SESSION_UPDATED',
  'PLAYER_JOINED',
  'PAIRING_GENERATED',
  'GAME_READY',
  'NEXT_UP',
  'SCORE_RECORDED',
]);

/**
 * Whether a notification type is enabled by the given preferences.
 *
 * `ALWAYS_ON` types (system announcements) ignore per-type flags; an unmapped
 * type is not suppressed (the per-type flag is a preference, not a policy — the
 * guest allow-list is the policy gate).
 */
export function isTypeEnabled(type: string, preferences: NotificationPreferences): boolean {
  if (ALWAYS_ON_NOTIFICATION_TYPES.has(type)) return true;
  const column = NOTIFICATION_TYPE_PREFERENCE[type];
  if (!column) return true; // unmapped: no per-type flag to honour
  return preferences[column];
}

/**
 * Whether a device-only (guest) token may receive the given type.
 * Deny-by-default: unknown/unmapped types return `false`.
 */
export function isAllowedForGuest(type: string): boolean {
  return GUEST_ALLOWED_NOTIFICATION_TYPES.has(type);
}

/**
 * Check whether a notification type is enabled by the given preferences.
 *
 * `SYSTEM_ANNOUNCEMENT` is always delivered; unknown types default to `true`.
 * Delegates to {@link isTypeEnabled} so there is a single mapping.
 */
export function isNotificationEnabled(
  type: NotificationType,
  preferences: NotificationPreferences,
): boolean {
  return isTypeEnabled(type as string, preferences);
}

/**
 * Parse a time string (`HH:MM`) into an `HHMM` integer (hours * 100 + minutes).
 *
 * NOTE: despite the original comment ("minutes since midnight"), the encoding is
 * `HHMM` — preserved verbatim so quiet-hour comparisons keep working.
 */
export function parseTimeString(timeString: string): number {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 100 + minutes;
}

/**
 * Check whether the current time falls within the configured quiet hours.
 *
 * Handles both same-day windows (e.g. 13:00–15:00) and overnight windows
 * (e.g. 22:00–08:00). Returns `false` when either bound is unset.
 *
 * `now` defaults to the current time; it is injectable so the boundary logic is
 * testable deterministically without faking the global clock.
 */
export function isInQuietHours(
  preferences: NotificationPreferences,
  now: Date = new Date(),
): boolean {
  if (!preferences.quietHoursStart || !preferences.quietHoursEnd) {
    return false;
  }

  const currentTime = now.getHours() * 100 + now.getMinutes();

  const startTime = parseTimeString(preferences.quietHoursStart);
  const endTime = parseTimeString(preferences.quietHoursEnd);

  if (startTime < endTime) {
    // Same-day quiet hours (e.g., 13:00 to 15:00)
    return currentTime >= startTime && currentTime <= endTime;
  } else {
    // Overnight quiet hours (e.g., 22:00 to 08:00 next day)
    return currentTime >= startTime || currentTime <= endTime;
  }
}
