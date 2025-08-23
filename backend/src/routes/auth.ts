import { Router } from 'express';
import { prisma } from '../config/database';
import { JWTUtils } from '../utils/jwt';
import { PasswordUtils } from '../utils/password';
import { registerSchema, loginSchema, refreshTokenSchema, validate } from '../utils/validation';

const router = Router();

// Register new user
router.post('/register', validate(registerSchema), async (req, res) => {
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
router.post('/login', validate(loginSchema), async (req, res) => {
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

// Refresh access token
router.post('/refresh', validate(refreshTokenSchema), async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Verify refresh token
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

    // Check if refresh token is valid in storage
    const isValid = await JWTUtils.isRefreshTokenValid(decoded.userId, refreshToken);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Refresh token has been revoked'
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

    // Generate new tokens
    const tokens = JWTUtils.generateTokens({
      userId: user.id,
      email: user.email || '',
      role: user.role
    });

    // Store new refresh token and revoke old one
    await JWTUtils.revokeRefreshToken(decoded.userId);
    await JWTUtils.storeRefreshToken(user.id, tokens.refreshToken);

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

export default router;