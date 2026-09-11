import { prisma } from '../config/database';
import { AuditLogger } from '../utils/auditLogger';

export interface ClaimSkipped {
  type: 'session' | 'player';
  id: string;
  reason: 'OWNED_BY_OTHER_USER';
}

export interface ClaimResult {
  claimed: { sessions: number; players: number };
  alreadyOwned: { sessions: number; players: number };
  skipped: ClaimSkipped[];
}

export interface ClaimMeta {
  actorName?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Story 6.1 (AC 5) — atomically link guest-created session/player rows that were
 * created on `deviceId` to the authenticated user.
 *
 * - Rows already owned by a *different* user are skipped, never stolen.
 * - Rows already owned by this user are counted as `alreadyOwned` (idempotent).
 * - The whole migration runs in one transaction; an audit entry is written after.
 *
 * This is distinct from `POST /mvp-sessions/claim`, which claims organizer
 * control of a session using the organizer secret (no account involved).
 */
export const deviceClaimService = {
  async claim(userId: string, deviceId: string, meta?: ClaimMeta): Promise<ClaimResult> {
    const result = await prisma.$transaction(async (tx) => {
      const out: ClaimResult = {
        claimed: { sessions: 0, players: 0 },
        alreadyOwned: { sessions: 0, players: 0 },
        skipped: [],
      };

      const sessions = await tx.mvpSession.findMany({
        where: { ownerDeviceId: deviceId },
        select: { id: true, ownerUserId: true },
      });

      for (const session of sessions) {
        if (session.ownerUserId === userId) {
          out.alreadyOwned.sessions += 1;
        } else if (session.ownerUserId === null) {
          await tx.mvpSession.update({
            where: { id: session.id },
            data: { ownerUserId: userId },
          });
          out.claimed.sessions += 1;
        } else {
          out.skipped.push({ type: 'session', id: session.id, reason: 'OWNED_BY_OTHER_USER' });
        }
      }

      const players = await tx.mvpPlayer.findMany({
        where: { deviceId },
        select: { id: true, userId: true },
      });

      for (const player of players) {
        if (player.userId === userId) {
          out.alreadyOwned.players += 1;
        } else if (player.userId === null) {
          await tx.mvpPlayer.update({
            where: { id: player.id },
            data: { userId },
          });
          out.claimed.players += 1;
        } else {
          out.skipped.push({ type: 'player', id: player.id, reason: 'OWNED_BY_OTHER_USER' });
        }
      }

      return out;
    });

    await AuditLogger.logAction({
      action: 'DEVICE_CLAIMED',
      actorId: userId,
      actorName: meta?.actorName || userId,
      metadata: {
        deviceId,
        claimed: result.claimed,
        alreadyOwned: result.alreadyOwned,
        skipped: result.skipped,
      },
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return result;
  },
};

export default deviceClaimService;
