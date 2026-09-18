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
 * Check whether a notification type is enabled by the given preferences.
 *
 * `SYSTEM_ANNOUNCEMENT` is always delivered; unknown types default to `true`.
 */
export function isNotificationEnabled(
  type: NotificationType,
  preferences: NotificationPreferences,
): boolean {
  switch (type) {
    case NotificationType.MATCH_RESULT:
      return preferences.matchResults;
    case NotificationType.ACHIEVEMENT_UNLOCK:
      return preferences.achievements;
    case NotificationType.FRIEND_REQUEST:
    case NotificationType.FRIEND_ACCEPTED:
      return preferences.friendRequests;
    case NotificationType.CHALLENGE_RECEIVED:
    case NotificationType.CHALLENGE_RESPONSE:
      return preferences.challenges;
    case NotificationType.TOURNAMENT_UPDATE:
      return preferences.tournamentUpdates;
    case NotificationType.SESSION_REMINDER:
      return preferences.sessionReminders;
    case NotificationType.SOCIAL_MESSAGE:
      return preferences.socialMessages;
    case NotificationType.SYSTEM_ANNOUNCEMENT:
      return true; // Always send system announcements
    default:
      return true;
  }
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
