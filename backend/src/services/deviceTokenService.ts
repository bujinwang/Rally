import crypto from 'crypto';
import { prisma } from '../config/database';
import env from '../config/env';

/**
 * Device token service (Option B, Phase 1).
 *
 * The credential is an opaque, server-generated 256-bit random value returned
 * to the client base64url-encoded and stored ONLY as its SHA-256 hash — exactly
 * the `RefreshToken` pattern (`services/refreshTokenService.ts`,
 * `RefreshToken.tokenHash @unique`). There is no signing key: the DB is the only
 * secret, and per-token revocation is a single `revokedAt` write.
 *
 * The RAW token is never persisted and never logged. Only `deviceId`, `ip` and
 * `userAgent` may appear in logs (design §1).
 */

/** Default lifetime of a device token: `DEVICE_TOKEN_TTL_DAYS` (design §2.2). */
export const DEVICE_TOKEN_TTL_MS = env.deviceToken.ttlDays * 24 * 60 * 60 * 1000;

const hashToken = (raw: string): string =>
  crypto.createHash('sha256').update(raw).digest('hex');

/** Optional request metadata recorded on a minted row (never the raw token). */
export interface DeviceTokenMeta {
  ip?: string;
  userAgent?: string;
}

/** A freshly minted credential. `token` is the raw value — returned once. */
export interface MintedDeviceToken {
  deviceId: string;
  token: string;
  expiresAt: Date;
}

/** A verified credential: the authoritative `deviceId` it resolves to. */
export interface VerifiedDeviceToken {
  deviceId: string;
}

export type AdoptFailureReason = 'ACTIVE_BINDING_EXISTS';

export type AdoptResult =
  | { ok: true; deviceId: string; token: string; expiresAt: Date }
  | { ok: false; reason: AdoptFailureReason };

export type RotateFailureReason = 'NOT_FOUND' | 'EXPIRED' | 'REVOKED';

export type RotateResult =
  | { ok: true; deviceId: string; token: string; expiresAt: Date }
  | { ok: false; reason: RotateFailureReason };

/** Generate a fresh opaque device id (a random UUID — never client-supplied). */
const newDeviceId = (): string => crypto.randomUUID();

/** Generate a fresh 256-bit raw token, base64url-encoded. */
const newRawToken = (): string => crypto.randomBytes(32).toString('base64url');

const newExpiry = (): Date => new Date(Date.now() + DEVICE_TOKEN_TTL_MS);

export const deviceTokenService = {
  /** Exposed for tests and callers that need the id generator in isolation. */
  newDeviceId,
  newRawToken,

  /**
   * Mint a brand-new device identity plus its token. The `deviceId` is
   * server-generated; a caller cannot choose it (§2.1 rule 1).
   */
  async mint(meta?: DeviceTokenMeta): Promise<MintedDeviceToken> {
    const deviceId = newDeviceId();
    const token = newRawToken();
    const expiresAt = newExpiry();

    await prisma.deviceToken.create({
      data: {
        deviceId,
        tokenHash: hashToken(token),
        expiresAt,
        createdByIp: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });

    return { deviceId, token, expiresAt };
  },

  /**
   * Adopt an existing `deviceId` for a guest migrating to the token model
   * (§2.1 rule 2 / §5.3). Succeeds only if NO active row already holds the id;
   * otherwise the caller gets `ACTIVE_BINDING_EXISTS` (mapped to 409) — this is
   * what stops a second caller from claiming an id another token holds.
   *
   * The check-then-insert runs inside one `prisma.$transaction` so two
   * concurrent adoptions of the same id cannot both succeed.
   */
  async adopt(deviceId: string, meta?: DeviceTokenMeta): Promise<AdoptResult> {
    const token = newRawToken();
    const expiresAt = newExpiry();

    return prisma.$transaction(async (tx) => {
      const active = await tx.deviceToken.findFirst({
        where: { deviceId, revokedAt: null },
      });

      if (active) {
        return { ok: false as const, reason: 'ACTIVE_BINDING_EXISTS' as const };
      }

      await tx.deviceToken.create({
        data: {
          deviceId,
          tokenHash: hashToken(token),
          expiresAt,
          createdByIp: meta?.ip,
          userAgent: meta?.userAgent,
        },
      });

      return { ok: true as const, deviceId, token, expiresAt };
    });
  },

  /**
   * Pure, read-only verification. Returns the authoritative `deviceId` for a
   * valid (known, unrevoked, unexpired) token, or `null` otherwise. No mutation
   * — `resolveIdentity` runs on every request, so this must not write.
   */
  async verifyDeviceToken(raw: string): Promise<VerifiedDeviceToken | null> {
    const row = await prisma.deviceToken.findUnique({
      where: { tokenHash: hashToken(raw) },
    });

    if (!row) return null;
    if (row.revokedAt) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;

    return { deviceId: row.deviceId };
  },

  /**
   * Rotate: present a valid token, receive a new one bound to the SAME
   * `deviceId`; the presented row is revoked and linked via `replacedByTokenId`
   * (§2.2). Runs in one transaction so concurrent refreshes cannot interleave.
   */
  async rotate(presentedRaw: string, meta?: DeviceTokenMeta): Promise<RotateResult> {
    const presentedHash = hashToken(presentedRaw);
    const token = newRawToken();
    const expiresAt = newExpiry();

    return prisma.$transaction(async (tx) => {
      const row = await tx.deviceToken.findUnique({
        where: { tokenHash: presentedHash },
      });

      if (!row) return { ok: false as const, reason: 'NOT_FOUND' as const };
      if (row.revokedAt) return { ok: false as const, reason: 'REVOKED' as const };
      if (row.expiresAt.getTime() <= Date.now()) {
        return { ok: false as const, reason: 'EXPIRED' as const };
      }

      const created = await tx.deviceToken.create({
        data: {
          deviceId: row.deviceId,
          tokenHash: hashToken(token),
          expiresAt,
          createdByIp: meta?.ip,
          userAgent: meta?.userAgent,
        },
      });

      await tx.deviceToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date(), replacedByTokenId: created.id },
      });

      return { ok: true as const, deviceId: row.deviceId, token, expiresAt };
    });
  },

  /**
   * Revoke the presented token (self-service, §2.3). Idempotent: revoking an
   * unknown or already-revoked token is a no-op.
   */
  async revoke(raw: string): Promise<void> {
    await prisma.deviceToken.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  /**
   * Global invalidation (compromise response, §2.3): revoke every active token
   * with a single UPDATE. Because ids are opaque this is the "rotate the key"
   * equivalent and needs no key.
   */
  async revokeAll(): Promise<number> {
    const result = await prisma.deviceToken.updateMany({
      where: { revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  },
};

export default deviceTokenService;
