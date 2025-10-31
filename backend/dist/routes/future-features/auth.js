"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const jwt_1 = require("../utils/jwt");
const password_1 = require("../utils/password");
const validation_1 = require("../utils/validation");
const router = (0, express_1.Router)();
// Register new user
router.post('/register', (0, validation_1.validate)(validation_1.registerSchema), async (req, res) => {
    try {
        const { name, email, phone, password, deviceId } = req.body;
        // Check if user already exists
        const existingUser = await database_1.prisma.user.findUnique({
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
        const passwordValidation = password_1.PasswordUtils.validatePasswordStrength(password);
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
        const passwordHash = await password_1.PasswordUtils.hashPassword(password);
        // Create user
        const user = await database_1.prisma.user.create({
            data: {
                name,
                email,
                phone,
                passwordHash,
                deviceId
            }
        });
        // Generate tokens
        const tokens = jwt_1.JWTUtils.generateTokens({
            userId: user.id,
            email: user.email || '',
            role: user.role
        });
        // Store refresh token
        await jwt_1.JWTUtils.storeRefreshToken(user.id, tokens.refreshToken);
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
    }
    catch (error) {
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
router.post('/login', (0, validation_1.validate)(validation_1.loginSchema), async (req, res) => {
    try {
        const { email, password, deviceId } = req.body;
        // Find user
        const user = await database_1.prisma.user.findUnique({
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
        const isPasswordValid = await password_1.PasswordUtils.verifyPassword(password, user.passwordHash);
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
            await database_1.prisma.user.update({
                where: { id: user.id },
                data: { deviceId }
            });
        }
        // Generate tokens
        const tokens = jwt_1.JWTUtils.generateTokens({
            userId: user.id,
            email: user.email || '',
            role: user.role
        });
        // Store refresh token
        await jwt_1.JWTUtils.storeRefreshToken(user.id, tokens.refreshToken);
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
    }
    catch (error) {
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
router.post('/refresh', (0, validation_1.validate)(validation_1.refreshTokenSchema), async (req, res) => {
    try {
        const { refreshToken } = req.body;
        // Verify refresh token
        const decoded = jwt_1.JWTUtils.verifyRefreshToken(refreshToken);
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
        const isValid = await jwt_1.JWTUtils.isRefreshTokenValid(decoded.userId, refreshToken);
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
        const user = await database_1.prisma.user.findUnique({
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
        const tokens = jwt_1.JWTUtils.generateTokens({
            userId: user.id,
            email: user.email || '',
            role: user.role
        });
        // Store new refresh token and revoke old one
        await jwt_1.JWTUtils.revokeRefreshToken(decoded.userId);
        await jwt_1.JWTUtils.storeRefreshToken(user.id, tokens.refreshToken);
        res.json({
            success: true,
            data: { tokens },
            message: 'Token refreshed successfully',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
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
exports.default = router;
//# sourceMappingURL=auth.js.map