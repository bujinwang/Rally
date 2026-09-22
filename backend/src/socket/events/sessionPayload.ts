/**
 * Session payload hygiene — Story 6.9 Phase 0 (device-token design §4.2 / §4.4).
 *
 * A session snapshot is broadcast to *every* participant in a room, so it must
 * not carry account identity. This module is the single place that:
 *   1. strips account-identity keys from an outgoing session payload
 *      (`stripUserIdentity`), and
 *   2. computes the PUBLIC `organizerPlayerId` surrogate (`organizerPlayerIdOf`).
 *
 * Why a surrogate: a room broadcast is one payload to many recipients, so a
 * per-recipient `isOrganizer` flag is impossible without a per-socket emit loop
 * (explicitly rejected as too costly — design §4.2). Instead the snapshot carries
 * the organizer's *public* `player.id`; the client already learns its own
 * `player.id` from its own join response, so it self-determines
 * `isOwner = myPlayerId === organizerPlayerId` with no per-recipient work.
 *
 * `deviceId` / `ownerDeviceId` are intentionally **not** stripped here: the
 * client still compares them to derive organizer status today, so removing them
 * is a separate, client-coupled step (design §4.2, the `viewer.isOrganizer` /
 * `players[].isYou` interface change). The guard test
 * (`socket/events/__tests__/session-payload-identity.test.ts`) is written so
 * extending it to those keys is a one-line change.
 */

import { ACCOUNT_IDENTITY_KEYS, stripUserIdentity } from '../../utils/identitySanitizer';

/**
 * Account-identity keys that must never appear in an outgoing session payload.
 *
 * `userId` is the per-player account link; `ownerUserId` is the same class of
 * account identity carried as a scalar on the session row (a full `MvpSession`
 * row includes it), so both are stripped together.
 *
 * The implementation now lives in `utils/identitySanitizer.ts` (shared with the
 * public tournament read surfaces); this alias is kept so the session call sites
 * and the guard test keep reading a single source of truth.
 */
export const SESSION_IDENTITY_KEYS = ACCOUNT_IDENTITY_KEYS;

export { stripUserIdentity };

/**
 * The PUBLIC surrogate for "who is the organizer" on a broadcast: the organizer
 * player's `id`. The organizer is the player whose `deviceId` matches the
 * session's `ownerDeviceId`. Returns `null` when it cannot be identified (e.g.
 * no owner device recorded, or the organizer has no player row in the payload).
 */
export function organizerPlayerIdOf(session: {
  ownerDeviceId?: string | null;
  players?: Array<{ id?: string; deviceId?: string | null }> | null;
} | null | undefined): string | null {
  const owner = session?.ownerDeviceId;
  if (!owner) return null;
  const player = (session?.players ?? []).find((entry) => entry?.deviceId === owner);
  return player?.id ?? null;
}

/**
 * Build the `session` object for a socket broadcast: account identity stripped,
 * plus the public `organizerPlayerId` surrogate.
 */
export function socketSessionPayload(
  session: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const stripped = stripUserIdentity(session ?? {}) as Record<string, unknown>;
  return { ...stripped, organizerPlayerId: organizerPlayerIdOf(session as never) };
}
