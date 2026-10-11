/**
 * Session payload hygiene — Story 6.9 Phase 0 (device-token design §4.2 / §4.4).
 *
 * A session snapshot is broadcast to *every* participant in a room, so it must
 * carry neither account NOR device identity. This module is the single place
 * that:
 *   1. strips identity keys from an outgoing session payload
 *      (`stripSessionIdentity`), and
 *   2. computes the PUBLIC `organizerPlayerId` surrogate (`organizerPlayerIdOf`).
 *
 * Why a surrogate: a room broadcast is one payload to many recipients, so a
 * per-recipient `isOrganizer` flag is impossible without a per-socket emit loop
 * (explicitly rejected as too costly — design §4.2). Instead the snapshot carries
 * the organizer's *public* `player.id`; the client already learns its own
 * `player.id` from its own join response, so it self-determines
 * `isOwner = myPlayerId === organizerPlayerId` with no per-recipient work.
 *
 * Step B (landed): `deviceId` / `ownerDeviceId` are now stripped too. The client
 * derives organizer status from the server-computed `viewer.isOrganizer` (HTTP)
 * and the public `organizerPlayerId` (socket) instead of comparing raw ids, so
 * the device identity is no longer needed on the wire. The guard test
 * (`socket/events/__tests__/session-payload-identity.test.ts`) enumerates the
 * full public key set, so a re-introduced key fails immediately.
 */

import { PUBLIC_IDENTITY_KEYS, stripIdentityKeys } from '../../utils/identitySanitizer';

/**
 * Identity keys that must never appear in an outgoing session payload — the full
 * public set (account + device), shared with the public tournament read surfaces.
 *
 * `userId` is the per-player account link; `ownerUserId` the same class of
 * account identity as a scalar on the session row; `deviceId` / `ownerDeviceId`
 * the device identity pair. All four are stripped together (Step B).
 *
 * The implementation lives in `utils/identitySanitizer.ts`; this alias is kept so
 * the session call sites and the guard test read a single source of truth.
 */
export const SESSION_IDENTITY_KEYS = PUBLIC_IDENTITY_KEYS;

/**
 * Strip every identity key (account + device) from a session-surface payload,
 * returning a new structure. Dates are preserved by reference.
 */
export function stripSessionIdentity<T>(value: T): T {
  return stripIdentityKeys(value, PUBLIC_IDENTITY_KEYS);
}

/**
 * The PUBLIC surrogate for "who is the organizer" on a broadcast: the organizer
 * player's `id`. The organizer is the player whose `deviceId` matches the
 * session's `ownerDeviceId`. Returns `null` when it cannot be identified (e.g.
 * no owner device recorded, or the organizer has no player row in the payload).
 *
 * NOTE: this MUST be evaluated on the RAW session (before `stripSessionIdentity`
 * removes `ownerDeviceId` / `players[].deviceId`).
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
 * Build the `session` object for a socket broadcast: identity stripped (account
 * + device), plus the public `organizerPlayerId` surrogate.
 */
export function socketSessionPayload(
  session: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const stripped = stripSessionIdentity(session ?? {}) as Record<string, unknown>;
  return { ...stripped, organizerPlayerId: organizerPlayerIdOf(session as never) };
}
