import { Request, Response, NextFunction, RequestHandler } from 'express';
import { prisma } from '../config/database';
import { resolveIdentity } from './permissions';

/**
 * Story 6.7 (design §D6, AC 15) — tournament-scoped organizer guard.
 *
 * Why a new guard exists
 * ----------------------
 * `requireOrganizer` (permissions.ts) is *session*-scoped: it resolves a player
 * row inside an `MvpSession` via `shareCode`. It cannot express "is this person
 * the organizer of *this* tournament". `Tournament.organizer` is a free-text
 * `String` and must NOT be used for authorization. T01 added two additive
 * nullable columns — `organizerUserId` and `organizerDeviceId` — which are the
 * only source of truth consulted here.
 *
 * Fail-closed policy
 * ------------------
 * The guard denies (and never calls `next()`) whenever ownership cannot be
 * *positively proven*:
 *   - the caller is anonymous (no JWT, no deviceId) — nothing to match against;
 *   - both `organizerUserId` and `organizerDeviceId` are `null` (tournaments
 *     created before T01 have no recorded organizer identity, so nobody can
 *     prove ownership);
 *   - the Prisma lookup throws → 500, and `next()` is not called.
 *
 * Judgment call — JWT present *and* a deviceId present (documented decision)
 * -------------------------------------------------------------------------
 * `resolveIdentity(req)` returns *both* `userId` and `deviceId` for an
 * authenticated request (the JWT wins for `source`, but `deviceId` is still
 * carried along from `req.body.deviceId` / the `x-device-id` header).
 *
 * The identityPrecedence QA suite already flagged the *permissive* reading of
 * this situation as a finding: "JWT user A presenting a device owned by user B
 * is GRANTED B's role". Repeating that here would let any authenticated user
 * impersonate a device-based organizer simply by echoing a device id they do
 * not own — a privilege-escalation hole.
 *
 * Decision: **strict**. When a verified JWT is present (`source === 'jwt'`), the
 * request is authorized *solely* by `userId === organizerUserId`; the carried
 * `deviceId` is NOT consulted. The device column is only ever matched when the
 * identity source is `'device'` (i.e. there is no JWT). Consequence: an
 * authenticated user who happens to share the creating device is denied unless
 * they are also the recorded `organizerUserId`. This trades a small convenience
 * for a strictly safer, fail-closed posture, which is the stated point of this
 * task. Test case "judgment call" pins this behaviour.
 *
 * Scope
 * -----
 * This module is additive. It does not change any existing export in
 * `permissions.ts` and does not touch `routes/tournaments.ts`. Wiring it into
 * the new mutation endpoints is T04's job.
 */

export interface TournamentOrganizerGuardOptions {
  /** Name of the route param that carries the tournament id. Defaults to `'id'`. */
  param?: string;
}

/**
 * Emit the standard error envelope used across this codebase
 * (see `permissions.ts` `deny()` / `requireSessionOwner`).
 */
const deny = (res: Response, status: number, code: string, message: string): void => {
  res.status(status).json({
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  });
};

/**
 * Build an Express middleware that authorizes the organizer of the tournament
 * identified by the configured route param.
 *
 * @param options.param Route param name holding the tournament id (default `'id'`).
 * @returns A `RequestHandler` that calls `next()` only for a proven organizer.
 */
export const requireTournamentOrganizer = (
  options: TournamentOrganizerGuardOptions = {}
): RequestHandler => {
  const param = options.param && options.param.length > 0 ? options.param : 'id';

  const handler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tournamentId = req.params?.[param];

      if (!tournamentId || tournamentId.trim() === '') {
        deny(res, 400, 'MISSING_TOURNAMENT_ID', 'Tournament id is required');
        return;
      }

      // Load only the two ownership columns — nothing else is needed.
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { organizerUserId: true, organizerDeviceId: true },
      });

      if (!tournament) {
        deny(res, 404, 'TOURNAMENT_NOT_FOUND', 'Tournament not found');
        return;
      }

      const identity = resolveIdentity(req);

      // Fail closed: an anonymous caller has no identity to match against.
      if (identity.source === 'anonymous') {
        deny(res, 403, 'FORBIDDEN', 'Only the tournament organizer can perform this action');
        return;
      }

      const { organizerUserId, organizerDeviceId } = tournament;

      // Strict matching (see header comment). A verified JWT is authoritative:
      // only `userId` is compared. The device fallback applies only when there
      // is no JWT. Both columns being null therefore denies everyone.
      const isAuthorized =
        identity.source === 'jwt'
          ? !!organizerUserId && identity.userId === organizerUserId
          : !!organizerDeviceId && identity.deviceId === organizerDeviceId;

      if (!isAuthorized) {
        deny(res, 403, 'FORBIDDEN', 'Only the tournament organizer can perform this action');
        return;
      }

      next();
    } catch (error) {
      // Any failure to authorize is a denial: `next()` is deliberately not called.
      console.error('requireTournamentOrganizer error:', error);
      deny(res, 500, 'INTERNAL_ERROR', 'Failed to authorize tournament organizer');
    }
  };

  return handler;
};
