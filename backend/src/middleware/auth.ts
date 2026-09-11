import { Request, Response, NextFunction } from 'express';
import { JWTUtils } from '../utils/jwt';
import { prisma } from '../config/database';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string | null;
    role: string;
  };
  auth?: {
    source: 'jwt' | 'device' | 'anonymous';
    userId?: string;
    deviceId?: string;
  };
}

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token required'
        },
        timestamp: new Date().toISOString()
      });
    }

    const decoded = JWTUtils.verifyAccessToken(token);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired access token'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication error'
      },
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Optional auth (design D1).
 *   1. No `Authorization` header  → anonymous, `req.user` stays undefined, next().
 *   2. Header present, token valid → `req.user` is set, next().
 *   3. Header present, token invalid/expired → 401 (never a silent downgrade).
 *
 * Rule 3 is what lets the client transparently refresh-on-401 and retry.
 */
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      req.auth = { source: 'anonymous' };
      return next();
    }

    const token = authHeader.split(' ')[1]; // Bearer TOKEN
    const decoded = token ? JWTUtils.verifyAccessToken(token) : null;
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired access token'
        },
        timestamp: new Date().toISOString()
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    req.user = user;
    req.auth = { source: 'jwt', userId: user.id };
    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication error'
      },
      timestamp: new Date().toISOString()
    });
  }
};

/** Readability alias: `authenticateToken` is the "required auth" middleware. */
export const requiredAuth = authenticateToken;

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void | Response => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        },
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

// Utility function to get current user
export const getCurrentUser = (req: AuthRequest) => {
  return req.user;
};