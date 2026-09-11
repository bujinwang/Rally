import { Router } from 'express';
import { prisma } from '../config/database';
import { JWTUtils } from '../utils/jwt';
import { PasswordUtils } from '../utils/password';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  claimSchema,
  logoutSchema,
  validate,
} from '../utils/validation';
import { requiredAuth, AuthRequest } from '../middleware/auth';
import { createRateLimiters } from '../middleware/rateLimit';
import { deviceClaimService } from '../services/deviceClaimService';

const router = Router();

// Rate limiting stays ACTIVE under test so AC 7/11 are actually exercised, but
// with a high ceiling so unrelated suites sharing the in-memory counter cannot
// trip it. The dedicated rate-limit test tunes the ceiling down via the
// test-only env vars to force a 429. Production values (5 / 10) are unchanged.
const isTest = process.env.NODE_ENV === 'test';
const rateLimiters = createRateLimiters(
  isTest
    ? {
        authMax: Number(process.env.AUTH_RATE_LIMIT_MAX_TEST ?? 10000),
        sensitiveMax: Number(process.env.SENSITIVE_RATE_LIMIT_MAX_TEST ?? 10000),
      }
    : undefined
);
const authLimiter = rateLimiters.auth;
const sensitiveLimiter = rateLimiters.sensitive;

// Register new user
router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  try {
    const { name, email, phone, password, deviceId } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'User with this email already exists'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Validate password strength
    const passwordValidation = PasswordUtils.validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Password too weak',
          details: passwordValidation.errors
        },
        timestamp: new Date().toISOString()
      });
    }

    // Hash password
    const passwordHash = await PasswordUtils.hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        deviceId
      }
    });

    // Generate tokens
    const tokens = JWTUtils.generateTokens({
      userId: user.id,
      email: user.email || '',
      role: user.role
    });

    // Store refresh token
    await JWTUtils.storeRefreshToken(user.id, tokens.refreshToken);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        tokens
      },
      message: 'User registered successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Registration failed'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Login user
router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Verify password
    const isPasswordValid = await PasswordUtils.verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Update device ID if provided
    if (deviceId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { deviceId }
      });
    }

    // Generate tokens
    const tokens = JWTUtils.generateTokens({
      userId: user.id,
      email: user.email || '',
      role: user.role
    });

    // Store refresh token
    await JWTUtils.storeRefreshToken(user.id, tokens.refreshToken);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        tokens
      },
      message: 'Login successful',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Login failed'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Refresh access token (rotation + reuse-detection handled atomically by
// refreshTokenService.rotate)
router.post('/refresh', authLimiter, validate(refreshTokenSchema), async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Verify refresh token signature
    const decoded = JWTUtils.verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid refresh token'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Verify user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
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

    // Issue a candidate pair. `rotate` owns family assignment, so no familyId is
    // passed here — on a tolerated retry it carries the existing family forward.
    const tokens = JWTUtils.generateTokens({
      userId: user.id,
      email: user.email || '',
      role: user.role
    });

    // Atomically revoke the presented row, link the lineage, and persist the new
    // token in the same family. A concurrent refresh can never revoke a token it
    // did not present.
    const rotation = await JWTUtils.rotateRefreshToken(
      user.id,
      refreshToken,
      tokens.refreshToken,
      { ip: req.ip, userAgent: req.get('user-agent') }
    );

    if (!rotation.ok) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Refresh token has been revoked'
        },
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: { tokens },
      message: 'Token refreshed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Token refresh failed'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Logout — revoke the caller's refresh token(s)
router.post('/logout', sensitiveLimiter, requiredAuth, validate(logoutSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { refreshToken } = req.body || {};

    await JWTUtils.revokeRefreshToken(userId, refreshToken);

    res.json({
      success: true,
      message: 'Logged out successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Logout failed'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Claim guest-created sessions/players that belong to the caller's device.
// NOTE: distinct from `POST /mvp-sessions/claim` (organizer-secret based).
router.post('/claim', sensitiveLimiter, requiredAuth, validate(claimSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { deviceId } = req.body;

    const result = await deviceClaimService.claim(userId, deviceId, {
      actorName: req.user!.email || userId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: result,
      message: 'Device activity linked to your account',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Device claim error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to link device activity'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
