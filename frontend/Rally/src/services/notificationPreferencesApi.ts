/**
 * notificationPreferencesApi.ts — the single, authenticated client for the
 * caller's notification consent (Story 6.9, AC 3, findings F11/F12).
 *
 * ## Why this exists
 *
 * The push gate reads `notification_preferences` via
 * `GET`/`PUT /notifications/preferences` (`backend/src/routes/notifications.ts:258,296`).
 * The reachable UI used to write `user_settings` instead (the wrong store), and
 * the only pre-existing preferences client was orphaned and contract-wrong (it
 * read `result.preferences` while the route returns `{ success, data, timestamp }`).
 * This module is the one correct client.
 *
 * ## Contract
 *
 * - Base URL comes from `../config/api` — host + `/api/v1`, honours
 *   `EXPO_PUBLIC_API_URL`. (NOT `../config`, which is host-only and hardcoded to
 *   localhost in production.)
 * - Both responses are `{ success, data, timestamp }`; we **unwrap `data`**.
 * - `updatePreferences` sends only columns the server accepts
 *   (`notificationPreferenceMapping.ACCEPTED_PREFERENCE_KEYS`), because the
 *   route's `pickPreferenceFields` (`:102-117`) silently drops unknown keys. It
 *   also drops `undefined`/`null` values: the route rejects `null` quiet-hour
 *   bounds with a 400, and the sanctioned way to clear one is an empty string
 *   (the route maps `''` → null).
 *
 * Shape mirrors `services/userApi.ts` (`getAuthHeaders()` + `fetch`, throwing
 * `error.error?.message`).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, ACCESS_TOKEN_KEY } from '../config/api';
import {
  ACCEPTED_PREFERENCE_KEYS,
} from './notificationPreferenceMapping';

/**
 * The caller's notification preferences, as returned by the backend. Mirrors
 * the `notification_preferences` columns the route exposes: nine boolean
 * columns, plus the two quiet-hour string bounds.
 *
 * The quiet-hour bounds are **optional** (`string | undefined`), not
 * `string | null`. `toNotificationPreferences`
 * (`backend/src/services/notificationPreferences.ts`) maps a null column to
 * `undefined`, and `JSON.stringify` drops undefined keys — so the server simply
 * *omits* them when unset and never sends `null`. Declaring them `null` would
 * assert a contract the server does not honour (the same class of error as the
 * original F12 defect). To *clear* a bound a client sends an empty string; the
 * route maps `''` → null (see `pickAcceptedFields`).
 */
export interface NotificationPreferences {
  pushEnabled: boolean;
  matchResults: boolean;
  achievements: boolean;
  friendRequests: boolean;
  challenges: boolean;
  tournamentUpdates: boolean;
  socialMessages: boolean;
  sessionReminders: boolean;
  emailEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

/** A partial update — only accepted keys are ever sent. */
export type NotificationPreferencesPatch = Partial<NotificationPreferences>;

/**
 * Keep only the keys the backend accepts, and only those explicitly present
 * with a non-null value:
 *  - unknown keys are dropped (the route's `pickPreferenceFields` drops them
 *    silently, so a client should not rely on the server to ignore them);
 *  - `undefined` keys are dropped (a partial PUT never clears a column the
 *    caller did not mention);
 *  - `null` keys are dropped too: the route validates quiet-hour bounds with
 *    `optional().isString()`, which **rejects null** with a 400
 *    VALIDATION_ERROR. To clear a bound, send an empty string instead — the
 *    route maps `''` → null (`notifications.ts:109-114`), so empty strings are
 *    forwarded, not dropped.
 */
function pickAcceptedFields(
  patch: NotificationPreferencesPatch,
): NotificationPreferencesPatch {
  const raw = patch as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ACCEPTED_PREFERENCE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const value = raw[key];
    if (value === undefined || value === null) continue;
    out[key] = value;
  }
  return out as NotificationPreferencesPatch;
}

/** Type guard used by the defensive response reader. */
function isPreferences(value: unknown): value is NotificationPreferences {
  return typeof value === 'object' && value !== null;
}

class NotificationPreferencesApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  /** Auth headers with the stored JWT, mirroring `userApi.getAuthHeaders()`. */
  private async getAuthHeaders(): Promise<HeadersInit> {
    const token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  /** Extract the backend's `error.error.message`, falling back to `fallback`. */
  private async throwForError(response: Response, fallback: string): Promise<never> {
    let message = fallback;
    try {
      const body = await response.json();
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* non-JSON error body — keep the fallback */
    }
    throw new Error(message);
  }

  /**
   * Read the caller's effective preferences.
   * `GET /notifications/preferences` → `{ success, data, timestamp }`.
   */
  async getPreferences(): Promise<NotificationPreferences> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/notifications/preferences`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      await this.throwForError(response, 'Failed to fetch notification preferences');
    }

    const result = await response.json();
    // The route returns the preferences under `data` — reading `result.preferences`
    // was the exact defect in the orphaned client (F12).
    if (!isPreferences(result?.data)) {
      throw new Error('Malformed notification preferences response');
    }
    return result.data;
  }

  /**
   * Update the caller's preferences with a partial body and return the saved,
   * effective preferences.
   * `PUT /notifications/preferences` → `{ success, data, message, timestamp }`.
   */
  async updatePreferences(
    patch: NotificationPreferencesPatch,
  ): Promise<NotificationPreferences> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/notifications/preferences`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(pickAcceptedFields(patch)),
    });

    if (!response.ok) {
      await this.throwForError(response, 'Failed to update notification preferences');
    }

    const result = await response.json();
    if (!isPreferences(result?.data)) {
      throw new Error('Malformed notification preferences response');
    }
    return result.data;
  }
}

export const notificationPreferencesApi = new NotificationPreferencesApiService();
export default notificationPreferencesApi;
