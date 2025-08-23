import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class JWTUtils {
  private static accessTokenSecret = process.env.JWT_SECRET || 'access-secret';
  private static refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'refresh-secret';
  private static accessTokenExpiry = process.env.JWT_EXPIRES_IN || '15m';
  private static refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

  static generateTokens(payload: JWTPayload): TokenPair {
    const accessToken = jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry
    } as jwt.SignOptions);

    const refreshToken = jwt.sign(payload, this.refreshTokenSecret, {
      expiresIn: this.refreshTokenExpiry
    } as jwt.SignOptions);

    return { accessToken, refreshToken };
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

  static async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    // In a real implementation, you would store this in Redis with an expiry
    // For now, we'll just log it
    console.log(`Storing refresh token for user ${userId}`);
  }

  static async revokeRefreshToken(userId: string): Promise<void> {
    // In a real implementation, you would remove this from Redis
    console.log(`Revoking refresh token for user ${userId}`);
  }

  static async isRefreshTokenValid(userId: string, refreshToken: string): Promise<boolean> {
    // In a real implementation, you would check Redis for the token
    console.log(`Checking refresh token validity for user ${userId}`);
    return true; // Placeholder
  }
}