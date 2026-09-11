import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

jest.mock('../../services/refreshTokenService', () => ({
  refreshTokenService: {
    store: jest.fn(),
    revoke: jest.fn(),
    isValid: jest.fn(),
  },
  REUSE_GRACE_WINDOW_MS: 10_000,
}));

import { JWTUtils } from '../jwt';
import { refreshTokenService } from '../../services/refreshTokenService';

const payload = { userId: 'u1', email: 'david@example.com', role: 'PLAYER' };

describe('JWTUtils', () => {
  describe('generateTokens', () => {
    it('issues an access token, a refresh token, and a jti', () => {
      const tokens = JWTUtils.generateTokens(payload);

      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
      expect(typeof tokens.jti).toBe('string');
      expect(tokens.jti.length).toBeGreaterThan(0);
    });

    it('signs tokens with the env-provided secrets (no hardcoded fallback)', () => {
      const tokens = JWTUtils.generateTokens(payload);

      expect(jwt.verify(tokens.accessToken, env.jwt.secret)).toMatchObject({ userId: 'u1' });
      expect(jwt.verify(tokens.refreshToken, env.jwt.refreshSecret)).toMatchObject({ userId: 'u1' });

      // A different secret must not verify.
      expect(() => jwt.verify(tokens.accessToken, 'not-the-secret')).toThrow();
    });

    it('embeds the jti claim in the refresh token', () => {
      const tokens = JWTUtils.generateTokens(payload);
      const decoded = JWTUtils.verifyRefreshToken(tokens.refreshToken);

      expect(decoded?.jti).toBe(tokens.jti);
    });

    it('threads an explicit familyId into the refresh token', () => {
      const tokens = JWTUtils.generateTokens(payload, { familyId: 'fam-1' });
      const decoded = JWTUtils.verifyRefreshToken(tokens.refreshToken);

      expect(decoded?.familyId).toBe('fam-1');
    });
  });

  describe('verifyAccessToken / verifyRefreshToken', () => {
    it('round-trips valid tokens', () => {
      const tokens = JWTUtils.generateTokens(payload);

      expect(JWTUtils.verifyAccessToken(tokens.accessToken)).toMatchObject(payload);
      expect(JWTUtils.verifyRefreshToken(tokens.refreshToken)).toMatchObject(payload);
    });

    it('returns null for a malformed token', () => {
      expect(JWTUtils.verifyAccessToken('not-a-jwt')).toBeNull();
      expect(JWTUtils.verifyRefreshToken('not-a-jwt')).toBeNull();
    });

    it('returns null for an expired access token', () => {
      const expired = jwt.sign(payload, env.jwt.secret, { expiresIn: '-1s' });
      expect(JWTUtils.verifyAccessToken(expired)).toBeNull();
    });

    it('does not accept a refresh token as an access token', () => {
      const tokens = JWTUtils.generateTokens(payload);
      expect(JWTUtils.verifyAccessToken(tokens.refreshToken)).toBeNull();
    });
  });

  describe('refresh-token store delegation', () => {
    beforeEach(() => jest.clearAllMocks());

    it('delegates storeRefreshToken to the service', async () => {
      await JWTUtils.storeRefreshToken('u1', 'raw-refresh', { ip: '127.0.0.1' });
      expect(refreshTokenService.store).toHaveBeenCalledWith('u1', 'raw-refresh', { ip: '127.0.0.1' });
    });

    it('delegates revokeRefreshToken (with and without a token)', async () => {
      await JWTUtils.revokeRefreshToken('u1');
      expect(refreshTokenService.revoke).toHaveBeenCalledWith('u1', undefined);

      await JWTUtils.revokeRefreshToken('u1', 'raw-refresh');
      expect(refreshTokenService.revoke).toHaveBeenCalledWith('u1', 'raw-refresh');
    });

    it('delegates isRefreshTokenValid to the service', async () => {
      (refreshTokenService.isValid as jest.Mock).mockResolvedValue(true);
      await expect(JWTUtils.isRefreshTokenValid('u1', 'raw-refresh')).resolves.toBe(true);
      expect(refreshTokenService.isValid).toHaveBeenCalledWith('u1', 'raw-refresh');
    });
  });
});
