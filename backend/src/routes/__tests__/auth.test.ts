import request from 'supertest';
import express from 'express';

jest.mock('../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}));

jest.mock('../../utils/jwt', () => ({
  JWTUtils: {
    generateTokens: jest.fn(),
    verifyRefreshToken: jest.fn(),
    storeRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
    isRefreshTokenValid: jest.fn(),
    rotateRefreshToken: jest.fn(),
  },
}));

jest.mock('../../utils/password', () => ({
  PasswordUtils: {
    hashPassword: jest.fn(),
    verifyPassword: jest.fn(),
    validatePasswordStrength: jest.fn(),
  },
}));

import { prisma } from '../../config/database';
import { JWTUtils } from '../../utils/jwt';
import { PasswordUtils } from '../../utils/password';
import authRouter from '../auth';

const app = express();
app.use(express.json());
app.use('/auth', authRouter);

const findUnique = prisma.user.findUnique as jest.Mock;
const createUser = prisma.user.create as jest.Mock;
const updateUser = prisma.user.update as jest.Mock;

const generateTokens = JWTUtils.generateTokens as jest.Mock;
const verifyRefreshToken = JWTUtils.verifyRefreshToken as jest.Mock;
const storeRefreshToken = JWTUtils.storeRefreshToken as jest.Mock;
const revokeRefreshToken = JWTUtils.revokeRefreshToken as jest.Mock;
const isRefreshTokenValid = JWTUtils.isRefreshTokenValid as jest.Mock;
const rotateRefreshToken = JWTUtils.rotateRefreshToken as jest.Mock;

const hashPassword = PasswordUtils.hashPassword as jest.Mock;
const verifyPassword = PasswordUtils.verifyPassword as jest.Mock;
const validatePasswordStrength = PasswordUtils.validatePasswordStrength as jest.Mock;

const validRegister = {
  name: 'David',
  email: 'david@example.com',
  password: 'Password123',
  deviceId: 'dev-1',
};

const dbUser = {
  id: 'u1',
  name: 'David',
  email: 'david@example.com',
  phone: null,
  role: 'PLAYER',
  passwordHash: 'hashed-password',
};

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    generateTokens.mockReturnValue({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    storeRefreshToken.mockResolvedValue(undefined);
    revokeRefreshToken.mockResolvedValue(undefined);
    isRefreshTokenValid.mockResolvedValue(true);
    rotateRefreshToken.mockResolvedValue({
      ok: true,
      jti: 'jti-new',
      familyId: 'fam-1',
      toleratedRetry: false,
    });
    hashPassword.mockResolvedValue('hashed-password');
    validatePasswordStrength.mockReturnValue({ isValid: true, errors: [] });
  });

  // ── POST /auth/register ─────────────────────────────────────
  describe('POST /auth/register', () => {
    it('registers a new user and returns tokens', async () => {
      findUnique.mockResolvedValue(null);
      createUser.mockResolvedValue(dbUser);

      const res = await request(app).post('/auth/register').send(validRegister).expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe('u1');
      expect(res.body.data.tokens.accessToken).toBe('access-token');
      expect(createUser).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'David',
          email: 'david@example.com',
          passwordHash: 'hashed-password',
          deviceId: 'dev-1',
        }),
      });
      expect(hashPassword).toHaveBeenCalledWith('Password123');
      expect(storeRefreshToken).toHaveBeenCalledWith('u1', 'refresh-token');
    });

    it('returns 409 when email already exists', async () => {
      findUnique.mockResolvedValue(dbUser);

      const res = await request(app).post('/auth/register').send(validRegister).expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(createUser).not.toHaveBeenCalled();
    });

    it('returns 400 when password is too weak', async () => {
      findUnique.mockResolvedValue(null);
      validatePasswordStrength.mockReturnValue({ isValid: false, errors: ['Password too weak'] });

      const res = await request(app).post('/auth/register').send(validRegister).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toContain('Password too weak');
      expect(createUser).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid payload (Joi)', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'short' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('returns 500 when user creation fails', async () => {
      findUnique.mockResolvedValue(null);
      createUser.mockRejectedValue(new Error('db down'));

      const res = await request(app).post('/auth/register').send(validRegister).expect(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  // ── POST /auth/login ────────────────────────────────────────
  describe('POST /auth/login', () => {
    it('logs in with valid credentials', async () => {
      findUnique.mockResolvedValue(dbUser);
      verifyPassword.mockResolvedValue(true);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'david@example.com', password: 'Password123', deviceId: 'dev-2' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens.refreshToken).toBe('refresh-token');
      expect(res.body.message).toBe('Login successful');
      expect(updateUser).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { deviceId: 'dev-2' } });
      expect(storeRefreshToken).toHaveBeenCalledWith('u1', 'refresh-token');
    });

    it('does not update deviceId when omitted', async () => {
      findUnique.mockResolvedValue(dbUser);
      verifyPassword.mockResolvedValue(true);

      await request(app)
        .post('/auth/login')
        .send({ email: 'david@example.com', password: 'Password123' })
        .expect(200);

      expect(updateUser).not.toHaveBeenCalled();
    });

    it('returns 401 when user does not exist', async () => {
      findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'Password123' })
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(verifyPassword).not.toHaveBeenCalled();
    });

    it('returns 401 when user has no password hash', async () => {
      findUnique.mockResolvedValue({ ...dbUser, passwordHash: null });

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'david@example.com', password: 'Password123' })
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when password is incorrect', async () => {
      findUnique.mockResolvedValue(dbUser);
      verifyPassword.mockResolvedValue(false);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'david@example.com', password: 'WrongPass123' })
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(generateTokens).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid payload (Joi)', async () => {
      const res = await request(app).post('/auth/login').send({ email: 'david@example.com' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 500 on unexpected error', async () => {
      findUnique.mockRejectedValue(new Error('db down'));

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'david@example.com', password: 'Password123' })
        .expect(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  // ── POST /auth/refresh ──────────────────────────────────────
  describe('POST /auth/refresh', () => {
    it('issues new tokens and rotates the refresh token', async () => {
      verifyRefreshToken.mockReturnValue({ userId: 'u1', email: 'david@example.com', role: 'PLAYER' });
      findUnique.mockResolvedValue(dbUser);
      rotateRefreshToken.mockResolvedValue({
        ok: true,
        jti: 'jti-new',
        familyId: 'fam-1',
        toleratedRetry: false,
      });

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'old-refresh' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens.accessToken).toBe('access-token');
      // The PRESENTED token is passed to the atomic rotation.
      expect(rotateRefreshToken).toHaveBeenCalledWith(
        'u1',
        'old-refresh',
        'refresh-token',
        expect.anything()
      );
    });

    it('returns 401 when refresh token is invalid/expired', async () => {
      verifyRefreshToken.mockReturnValue(null);

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'bad-token' })
        .expect(401);
      expect(res.body.error.message).toBe('Invalid refresh token');
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('returns 401 when refresh token was revoked', async () => {
      verifyRefreshToken.mockReturnValue({ userId: 'u1', email: 'david@example.com', role: 'PLAYER' });
      findUnique.mockResolvedValue(dbUser);
      rotateRefreshToken.mockResolvedValue({ ok: false, reason: 'REUSED' });

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'revoked' })
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toBe('Refresh token has been revoked');
    });

    it('returns 401 when user no longer exists', async () => {
      verifyRefreshToken.mockReturnValue({ userId: 'ghost', email: 'x@y.com', role: 'PLAYER' });
      isRefreshTokenValid.mockResolvedValue(true);
      findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'valid' })
        .expect(401);
      expect(res.body.error.message).toBe('User not found');
    });

    it('returns 400 when refreshToken is missing (Joi)', async () => {
      const res = await request(app).post('/auth/refresh').send({}).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 500 on unexpected error', async () => {
      verifyRefreshToken.mockImplementation(() => {
        throw new Error('boom');
      });

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'whatever' })
        .expect(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
