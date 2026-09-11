import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import {
  refreshTokenService,
  RefreshTokenMeta,
  RotateResult,
} from '../services/refreshTokenService';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  jti?: string;
  familyId?: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  jti: string;
}

export class JWTUtils {
  // Secrets and expiries come exclusively from the validated env module —
  // no hardcoded fallbacks (AC 18).
  private static accessTokenSecret = env.jwt.secret;
  private static refreshTokenSecret = env.jwt.refreshSecret;
  private static accessTokenExpiry = env.jwt.accessExpiry;
  private static refreshTokenExpiry = env.jwt.refreshExpiry;

  static generateTokens(
    payload: { userId: string; email: string; role: string },
    opts?: { familyId?: string }
  ): TokenPair {
    const accessToken = jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry
    } as jwt.SignOptions);

    // Every refresh token carries a `jti` so its row can be looked up and
    // rotated server-side without ever persisting the raw token.
    const jti = crypto.randomUUID();
    const refreshToken = jwt.sign(
      {
        ...payload,
        jti,
        ...(opts?.familyId ? { familyId: opts.familyId } : {})
      },
      this.refreshTokenSecret,
      { expiresIn: this.refreshTokenExpiry } as jwt.SignOptions
    );

    return { accessToken, refreshToken, jti };
  }

  static verifyAccessToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, this.accessTokenSecret) as JWTPayload;
    } catch (error) {
      return null;
    }
  }

  static verifyRefreshToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, this.refreshTokenSecret) as JWTPayload;
    } catch (error) {
      return null;
    }
  }

  /** Persist a newly-issued refresh token (hashed) via the token service. */
  static async storeRefreshToken(
    userId: string,
    refreshToken: string,
    meta?: RefreshTokenMeta
  ): Promise<void> {
    await refreshTokenService.store(userId, refreshToken, meta);
  }

  /**
   * Revoke a single refresh token when one is supplied, otherwise revoke the
   * caller's refresh token(s). The optional second argument keeps existing
   * single-arg call sites compiling.
   */
  static async revokeRefreshToken(userId: string, refreshToken?: string): Promise<void> {
    await refreshTokenService.revoke(userId, refreshToken);
  }

  static async isRefreshTokenValid(userId: string, refreshToken: string): Promise<boolean> {
    return refreshTokenService.isValid(userId, refreshToken);
  }

  /**
   * Atomically rotate the presented refresh token (revoke only that row, carry
   * the family forward, tolerate a within-grace retry, revoke the family on
   * genuine reuse).
   */
  static async rotateRefreshToken(
    userId: string,
    presentedRawToken: string,
    newRawToken: string,
    meta?: RefreshTokenMeta
  ): Promise<RotateResult> {
    return refreshTokenService.rotate(userId, presentedRawToken, newRawToken, meta);
  }
}
