import request from 'supertest';
import express from 'express';

jest.mock('../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

jest.mock('../../utils/jwt', () => ({
  JWTUtils: { verifyAccessToken: jest.fn() },
}));

import { prisma } from '../../config/database';
import { JWTUtils } from '../../utils/jwt';
import { optionalAuth, AuthRequest } from '../auth';

const findUnique = prisma.user.findUnique as jest.Mock;
const verifyAccessToken = JWTUtils.verifyAccessToken as jest.Mock;

const app = express();
app.use(express.json());
app.get('/optional', optionalAuth, (req, res) => {
  const authReq = req as AuthRequest;
  res.json({ user: authReq.user ?? null, auth: authReq.auth ?? null });
});

describe('optionalAuth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('branch 1 — no Authorization header: anonymous, req.user undefined', async () => {
    const res = await request(app).get('/optional').expect(200);

    expect(res.body.user).toBeNull();
    expect(res.body.auth.source).toBe('anonymous');
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('branch 2 — valid token: sets req.user from the database', async () => {
    verifyAccessToken.mockReturnValue({ userId: 'u1', email: 'd@example.com', role: 'PLAYER' });
    findUnique.mockResolvedValue({ id: 'u1', email: 'd@example.com', role: 'PLAYER' });

    const res = await request(app)
      .get('/optional')
      .set('Authorization', 'Bearer good-token')
      .expect(200);

    expect(res.body.user).toEqual({ id: 'u1', email: 'd@example.com', role: 'PLAYER' });
    expect(res.body.auth).toEqual({ source: 'jwt', userId: 'u1' });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { id: true, email: true, role: true },
    });
  });

  it('branch 3 — present but invalid/expired token: 401, never a silent downgrade', async () => {
    verifyAccessToken.mockReturnValue(null);

    const res = await request(app)
      .get('/optional')
      .set('Authorization', 'Bearer expired-token')
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('treats a malformed Authorization header as an invalid token (401)', async () => {
    const res = await request(app).get('/optional').set('Authorization', 'Bearer').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when the token verifies but the user no longer exists', async () => {
    verifyAccessToken.mockReturnValue({ userId: 'ghost', email: '', role: 'PLAYER' });
    findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/optional')
      .set('Authorization', 'Bearer ghost-token')
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 500 (no stack leak) if verification throws unexpectedly', async () => {
    verifyAccessToken.mockImplementation(() => {
      throw new Error('boom');
    });

    const res = await request(app)
      .get('/optional')
      .set('Authorization', 'Bearer weird-token')
      .expect(500);

    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('boom');
  });
});
