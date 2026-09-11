import crypto from 'crypto';
import jwt from 'jsonwebtoken';

jest.mock('../../config/database', () => ({
  prisma: {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { prisma } from '../../config/database';
import { refreshTokenService, REUSE_GRACE_WINDOW_MS } from '../refreshTokenService';

const create = prisma.refreshToken.create as jest.Mock;
const findUnique = prisma.refreshToken.findUnique as jest.Mock;
const updateMany = prisma.refreshToken.updateMany as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;

const sha256 = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

const signRefresh = (overrides: Record<string, unknown> = {}) =>
  jwt.sign(
    { userId: 'u1', email: 'david@example.com', role: 'PLAYER', jti: 'jti-1', ...overrides },
    'test-refresh-secret',
    { expiresIn: '7d' }
  );

const activeRow = (raw: string, overrides: Record<string, unknown> = {}) => ({
  id: 'rt-1',
  userId: 'u1',
  tokenHash: sha256(raw),
  jti: 'jti-1',
  familyId: 'fam-1',
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
  replacedByJti: null,
  createdByIp: null,
  userAgent: null,
  createdAt: new Date(),
  ...overrides,
});

describe('refreshTokenService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    create.mockResolvedValue({});
    updateMany.mockResolvedValue({ count: 1 });
    // Run the transaction body against the same mocked client.
    transaction.mockImplementation((cb: any) => cb(prisma));
  });

  describe('store', () => {
    it('persists only the SHA-256 hash of the raw token', async () => {
      const raw = signRefresh();
      const result = await refreshTokenService.store('u1', raw, { ip: '1.2.3.4', userAgent: 'jest' });

      const data = create.mock.calls[0][0].data;
      expect(data.tokenHash).toBe(sha256(raw));
      expect(data.tokenHash).not.toBe(raw);
      expect(JSON.stringify(data)).not.toContain(raw);
      expect(data.jti).toBe('jti-1');
      expect(data.createdByIp).toBe('1.2.3.4');
      expect(result.jti).toBe('jti-1');
      expect(typeof result.familyId).toBe('string');
    });

    it('starts a new family by default and honours an explicit familyId', async () => {
      await refreshTokenService.store('u1', signRefresh({ jti: 'a' }));
      await refreshTokenService.store('u1', signRefresh({ jti: 'b' }), { familyId: 'fam-x' });

      const first = create.mock.calls[0][0].data;
      const second = create.mock.calls[1][0].data;
      expect(typeof first.familyId).toBe('string');
      expect(first.familyId).not.toBe(second.familyId);
      expect(second.familyId).toBe('fam-x');
    });
  });

  describe('isValid (pure)', () => {
    it('returns true for an active, unexpired token', async () => {
      const raw = signRefresh();
      findUnique.mockResolvedValue(activeRow(raw));

      await expect(refreshTokenService.isValid('u1', raw)).resolves.toBe(true);
    });

    it('returns false when the token is unknown', async () => {
      findUnique.mockResolvedValue(null);
      await expect(refreshTokenService.isValid('u1', signRefresh())).resolves.toBe(false);
    });

    it('returns false when the token belongs to another user', async () => {
      const raw = signRefresh();
      findUnique.mockResolvedValue(activeRow(raw, { userId: 'someone-else' }));
      await expect(refreshTokenService.isValid('u1', raw)).resolves.toBe(false);
    });

    it('returns false for an expired token', async () => {
      const raw = signRefresh();
      findUnique.mockResolvedValue(activeRow(raw, { expiresAt: new Date(Date.now() - 1000) }));
      await expect(refreshTokenService.isValid('u1', raw)).resolves.toBe(false);
    });

    it('tolerates a replay of a just-rotated token within the grace window', async () => {
      const raw = signRefresh();
      findUnique.mockResolvedValue(
        activeRow(raw, { revokedAt: new Date(), replacedByJti: 'next-jti' })
      );

      await expect(refreshTokenService.isValid('u1', raw)).resolves.toBe(true);
    });

    it('returns false for a revoked token beyond the grace window WITHOUT writing', async () => {
      const raw = signRefresh();
      findUnique.mockResolvedValue(
        activeRow(raw, {
          revokedAt: new Date(Date.now() - REUSE_GRACE_WINDOW_MS - 1000),
          replacedByJti: 'next-jti',
        })
      );

      await expect(refreshTokenService.isValid('u1', raw)).resolves.toBe(false);
      // Purity: the family revocation is deferred to rotate(), not done here.
      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('isReused', () => {
    it('is true only for a revoked token older than the grace window', async () => {
      const raw = signRefresh();
      findUnique.mockResolvedValue(
        activeRow(raw, { revokedAt: new Date(Date.now() - REUSE_GRACE_WINDOW_MS - 1000) })
      );
      await expect(refreshTokenService.isReused('u1', raw)).resolves.toBe(true);

      findUnique.mockResolvedValue(activeRow(raw, { revokedAt: new Date() }));
      await expect(refreshTokenService.isReused('u1', raw)).resolves.toBe(false);
    });
  });

  describe('revoke', () => {
    it('revokes a single token when one is supplied', async () => {
      const raw = signRefresh();
      await refreshTokenService.revoke('u1', raw);

      expect(updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', tokenHash: sha256(raw), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      // A token-scoped revoke must not fall through to revoke-all.
      expect(updateMany).not.toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('revokes all of the user\'s active tokens when no token is supplied (logout-all)', async () => {
      await refreshTokenService.revoke('u1');

      expect(updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('rotate', () => {
    it('revokes ONLY the presented row and continues the family', async () => {
      const presented = signRefresh({ jti: 'old-jti', familyId: 'fam-1' });
      const next = signRefresh({ jti: 'new-jti' });
      findUnique.mockResolvedValue(activeRow(presented, { jti: 'old-jti', familyId: 'fam-1' }));

      const result = await refreshTokenService.rotate('u1', presented, next);

      expect(result).toEqual({ ok: true, jti: 'new-jti', familyId: 'fam-1', toleratedRetry: false });
      expect(updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', tokenHash: sha256(presented), revokedAt: null },
        data: { revokedAt: expect.any(Date), replacedByJti: 'new-jti' },
      });
      // Never a blanket revoke of every token the user owns.
      expect(updateMany).not.toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(create.mock.calls[0][0].data).toMatchObject({
        tokenHash: sha256(next),
        jti: 'new-jti',
        familyId: 'fam-1',
      });
    });

    it('tolerates a within-grace retry: same family, nothing revoked', async () => {
      const presented = signRefresh({ jti: 'old-jti', familyId: 'fam-1' });
      const next = signRefresh({ jti: 'retry-jti' });
      findUnique.mockResolvedValue(
        activeRow(presented, {
          jti: 'old-jti',
          familyId: 'fam-1',
          revokedAt: new Date(),
          replacedByJti: 'new-jti',
        })
      );

      const result = await refreshTokenService.rotate('u1', presented, next);

      expect(result).toEqual({ ok: true, jti: 'retry-jti', familyId: 'fam-1', toleratedRetry: true });
      expect(updateMany).not.toHaveBeenCalled();
      expect(create.mock.calls[0][0].data).toMatchObject({ familyId: 'fam-1', jti: 'retry-jti' });
    });

    it('revokes the whole family on reuse beyond the grace window', async () => {
      const presented = signRefresh({ jti: 'old-jti', familyId: 'fam-1' });
      const next = signRefresh({ jti: 'new-jti' });
      findUnique.mockResolvedValue(
        activeRow(presented, {
          familyId: 'fam-1',
          revokedAt: new Date(Date.now() - REUSE_GRACE_WINDOW_MS - 1000),
          replacedByJti: 'new-jti',
        })
      );

      const result = await refreshTokenService.rotate('u1', presented, next);

      expect(result).toEqual({ ok: false, reason: 'REUSED' });
      expect(updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('reports NOT_FOUND / USER_MISMATCH / EXPIRED without side effects', async () => {
      const presented = signRefresh();
      const next = signRefresh({ jti: 'new-jti' });

      findUnique.mockResolvedValue(null);
      await expect(refreshTokenService.rotate('u1', presented, next)).resolves.toEqual({
        ok: false,
        reason: 'NOT_FOUND',
      });

      findUnique.mockResolvedValue(activeRow(presented, { userId: 'other' }));
      await expect(refreshTokenService.rotate('u1', presented, next)).resolves.toEqual({
        ok: false,
        reason: 'USER_MISMATCH',
      });

      findUnique.mockResolvedValue(activeRow(presented, { expiresAt: new Date(Date.now() - 1000) }));
      await expect(refreshTokenService.rotate('u1', presented, next)).resolves.toEqual({
        ok: false,
        reason: 'EXPIRED',
      });

      expect(updateMany).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it('does not revoke a different token than the one presented (interleaved refreshes)', async () => {
      const t1 = signRefresh({ jti: 'jti-1', familyId: 'fam-1' });
      const t2 = signRefresh({ jti: 'jti-2', familyId: 'fam-2' });
      const rows: Record<string, any> = {
        [sha256(t1)]: activeRow(t1, { jti: 'jti-1', familyId: 'fam-1' }),
        [sha256(t2)]: activeRow(t2, { jti: 'jti-2', familyId: 'fam-2' }),
      };
      findUnique.mockImplementation(({ where }: any) => Promise.resolve(rows[where.tokenHash] ?? null));

      // A presents t1; B presents t2. Each rotation must target its own row.
      await refreshTokenService.rotate('u1', t1, signRefresh({ jti: 'a-new' }));
      await refreshTokenService.rotate('u1', t2, signRefresh({ jti: 'b-new' }));

      const scoped = updateMany.mock.calls.map((c) => c[0].where);
      expect(scoped).toContainEqual({ userId: 'u1', tokenHash: sha256(t1), revokedAt: null });
      expect(scoped).toContainEqual({ userId: 'u1', tokenHash: sha256(t2), revokedAt: null });
      expect(scoped).not.toContainEqual({ userId: 'u1', revokedAt: null });
    });
  });
});
