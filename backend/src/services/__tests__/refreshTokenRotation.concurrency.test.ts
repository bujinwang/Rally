/**
 * Story 6.1 — independent QA verification of refresh-token ROTATION atomicity.
 *
 * `refreshTokenService.rotate(userId, presentedRawToken, newRawToken)` runs in a
 * single `prisma.$transaction` and identifies the presented row by
 * `sha256(presentedRawToken)`. It is therefore token-scoped and stateless: no
 * module-level side channel, so two concurrent refreshes for the same user can
 * never revoke a token they did not present, and can never fall back to a
 * blanket "revoke everything" update.
 *
 * (Round 1 found the previous implementation used userId-keyed in-process state
 * that rotated the wrong token under concurrency. That side channel is gone;
 * these tests now guard the new atomic contract.)
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

jest.mock('../../config/database', () => ({
  prisma: {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    // Execute the transaction callback with the mocked client itself.
    $transaction: jest.fn(),
  },
}));

import { prisma } from '../../config/database';
import { refreshTokenService } from '../refreshTokenService';

const sha256 = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

const sign = (jti: string, familyId: string) =>
  jwt.sign(
    { userId: 'u1', email: 'e@example.com', role: 'PLAYER', jti, familyId },
    'test-secret',
    { expiresIn: '7d' }
  );

const activeRow = (raw: string, jti: string, familyId: string) => ({
  id: `row-${jti}`,
  userId: 'u1',
  tokenHash: sha256(raw),
  jti,
  familyId,
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
  replacedByJti: null,
  createdByIp: null,
  userAgent: null,
  createdAt: new Date(),
});

const revokeWheres = () =>
  (prisma.refreshToken.updateMany as jest.Mock).mock.calls.map((c) => c[0].where);

describe('QA — refresh rotation atomicity (token-scoped)', () => {
  const t1 = sign('jti-1', 'fam-1');
  const t2 = sign('jti-2', 'fam-2');
  const newT1 = sign('jti-1-new', 'fam-1');
  const newT2 = sign('jti-2-new', 'fam-2');

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => cb(prisma));
    (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});
    const rows: Record<string, any> = {
      [sha256(t1)]: activeRow(t1, 'jti-1', 'fam-1'),
      [sha256(t2)]: activeRow(t2, 'jti-2', 'fam-2'),
    };
    (prisma.refreshToken.findUnique as jest.Mock).mockImplementation(({ where }: any) =>
      Promise.resolve(rows[where.tokenHash] ?? null)
    );
  });

  it('interleaved rotations each revoke exactly the token they presented (no blanket revoke)', async () => {
    const [r1, r2] = await Promise.all([
      refreshTokenService.rotate('u1', t1, newT1),
      refreshTokenService.rotate('u1', t2, newT2),
    ]);

    expect(r1).toMatchObject({ ok: true, toleratedRetry: false });
    expect(r2).toMatchObject({ ok: true, toleratedRetry: false });

    const wheres = revokeWheres();
    // Each presented token is revoked, token-scoped.
    expect(wheres).toContainEqual({ userId: 'u1', tokenHash: sha256(t1), revokedAt: null });
    expect(wheres).toContainEqual({ userId: 'u1', tokenHash: sha256(t2), revokedAt: null });
    // Never a blanket "revoke all of the user's tokens".
    expect(wheres).not.toContainEqual({ userId: 'u1', revokedAt: null });

    // Both new tokens are persisted, each in its own presented token's family.
    const created = (prisma.refreshToken.create as jest.Mock).mock.calls.map((c) => c[0].data);
    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tokenHash: sha256(newT1), familyId: 'fam-1' }),
        expect.objectContaining({ tokenHash: sha256(newT2), familyId: 'fam-2' }),
      ])
    );
  });

  it('rotating t1 revokes only t1 and leaves t2 untouched', async () => {
    const result = await refreshTokenService.rotate('u1', t1, newT1);

    expect(result).toMatchObject({ ok: true, familyId: 'fam-1', toleratedRetry: false });

    const wheres = revokeWheres();
    expect(wheres).toContainEqual({ userId: 'u1', tokenHash: sha256(t1), revokedAt: null });
    expect(wheres).not.toContainEqual({ userId: 'u1', tokenHash: sha256(t2), revokedAt: null });
    expect(wheres).not.toContainEqual({ userId: 'u1', revokedAt: null });
  });

  it('is a no-op on the DB for an unknown presented token', async () => {
    const result = await refreshTokenService.rotate('u1', sign('ghost', 'fam-x'), newT1);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });
});
