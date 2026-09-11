import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';

export interface RefreshTokenMeta {
  ip?: string;
  userAgent?: string;
  familyId?: string;
}

/**
 * Reuse-detection grace window (ms), design R9. A client whose refresh response
 * was lost may retry with the token it just rotated; within this window we
 * tolerate that retry instead of treating it as token theft.
 */
export const REUSE_GRACE_WINDOW_MS = 10_000;

export type RotateFailureReason = 'NOT_FOUND' | 'USER_MISMATCH' | 'EXPIRED' | 'REUSED';

export type RotateResult =
  | { ok: true; jti: string; familyId: string; toleratedRetry: boolean }
  | { ok: false; reason: RotateFailureReason };

const hashToken = (raw: string): string =>
  crypto.createHash('sha256').update(raw).digest('hex');

const decodeToken = (raw: string): { jti?: string; exp?: number } | null => {
  const decoded = jwt.decode(raw);
  return decoded && typeof decoded === 'object' ? (decoded as { jti?: string; exp?: number }) : null;
};

const revokeFamilyById = async (familyId: string): Promise<void> => {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

export const refreshTokenService = {
  /**
   * Persist a newly-issued refresh token (stores the SHA-256 hash only).
   * `meta.familyId` explicitly continues an existing rotation family; otherwise
   * a fresh family is started.
   */
  async store(
    userId: string,
    rawToken: string,
    meta?: RefreshTokenMeta
  ): Promise<{ jti: string; familyId: string }> {
    const tokenHash = hashToken(rawToken);
    const decoded = decodeToken(rawToken);
    const jti = decoded?.jti || crypto.randomUUID();
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const familyId = meta?.familyId || crypto.randomUUID();

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        jti,
        familyId,
        expiresAt,
        createdByIp: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });

    return { jti, familyId };
  },

  /**
   * Pure, read-only validity check — no mutation and no DB writes. A token that
   * was revoked beyond the grace window is reported invalid here; the family
   * revocation for genuine reuse happens atomically inside `rotate()`.
   */
  async isValid(userId: string, rawToken: string): Promise<boolean> {
    const tokenHash = hashToken(rawToken);
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!row || row.userId !== userId) return false;

    const now = Date.now();
    if (row.expiresAt.getTime() <= now) return false;

    if (row.revokedAt) {
      const age = now - row.revokedAt.getTime();
      // Tolerated retry of a just-rotated token; anything older is a reuse.
      return age <= REUSE_GRACE_WINDOW_MS && !!row.replacedByJti;
    }

    return true;
  },

  /** Detect theft: the token is known but revoked beyond the grace window. */
  async isReused(userId: string, rawToken: string): Promise<boolean> {
    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!row || row.userId !== userId || !row.revokedAt) return false;
    return Date.now() - row.revokedAt.getTime() > REUSE_GRACE_WINDOW_MS;
  },

  /**
   * Atomically rotate the presented refresh token.
   *
   * Runs entirely inside one `prisma.$transaction` so concurrent refreshes for
   * the same user cannot interleave: the presented row is identified by its own
   * hash, so exactly that row is revoked (never a different device's token, and
   * never every token the user owns).
   */
  async rotate(
    userId: string,
    presentedRawToken: string,
    newRawToken: string,
    meta?: RefreshTokenMeta
  ): Promise<RotateResult> {
    const presentedHash = hashToken(presentedRawToken);
    const newHash = hashToken(newRawToken);
    const decoded = decodeToken(newRawToken);
    const jti = decoded?.jti || crypto.randomUUID();
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    return prisma.$transaction(async (tx) => {
      const row = await tx.refreshToken.findUnique({ where: { tokenHash: presentedHash } });

      if (!row) return { ok: false as const, reason: 'NOT_FOUND' as const };
      if (row.userId !== userId) return { ok: false as const, reason: 'USER_MISMATCH' as const };

      const now = Date.now();
      if (row.expiresAt.getTime() <= now) {
        return { ok: false as const, reason: 'EXPIRED' as const };
      }

      if (row.revokedAt) {
        const age = now - row.revokedAt.getTime();
        if (age <= REUSE_GRACE_WINDOW_MS && row.replacedByJti) {
          // Tolerated retry of a just-rotated token: issue the new token in the
          // same family and revoke nothing.
          await tx.refreshToken.create({
            data: {
              userId,
              tokenHash: newHash,
              jti,
              familyId: row.familyId,
              expiresAt,
              createdByIp: meta?.ip,
              userAgent: meta?.userAgent,
            },
          });
          return { ok: true as const, jti, familyId: row.familyId, toleratedRetry: true };
        }

        // Genuine reuse of a revoked token → revoke the entire family.
        await tx.refreshToken.updateMany({
          where: { familyId: row.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return { ok: false as const, reason: 'REUSED' as const };
      }

      // Active token → revoke THIS row only and record the replacement lineage.
      await tx.refreshToken.updateMany({
        where: { userId, tokenHash: presentedHash, revokedAt: null },
        data: { revokedAt: new Date(), replacedByJti: jti },
      });
      await tx.refreshToken.create({
        data: {
          userId,
          tokenHash: newHash,
          jti,
          familyId: row.familyId,
          expiresAt,
          createdByIp: meta?.ip,
          userAgent: meta?.userAgent,
        },
      });

      return { ok: true as const, jti, familyId: row.familyId, toleratedRetry: false };
    });
  },

  /**
   * Revoke a single token when `rawToken` is supplied. With no token this means
   * exactly one thing: revoke ALL of the user's active tokens (logout-all).
   */
  async revoke(userId: string, rawToken?: string): Promise<void> {
    const now = new Date();

    if (rawToken) {
      await prisma.refreshToken.updateMany({
        where: { userId, tokenHash: hashToken(rawToken), revokedAt: null },
        data: { revokedAt: now },
      });
      return;
    }

    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  },

  /** Revoke every token sharing a familyId (reuse response). */
  async revokeFamily(familyId: string): Promise<void> {
    await revokeFamilyById(familyId);
  },
};

export default refreshTokenService;
