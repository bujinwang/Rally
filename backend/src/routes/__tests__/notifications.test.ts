// @ts-nocheck
import request from 'supertest';
import express from 'express';

jest.mock('../../config/database', () => ({
  prisma: {
    pushToken: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    mvpSession: { findUnique: jest.fn() },
    sessionSubscription: { upsert: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
  },
}));

import { prisma } from '../../config/database';
import notificationsRouter from '../notifications';

const app = express();
app.use(express.json());
app.use('/notifications', notificationsRouter);

describe('Notifications Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /notifications/register', () => {
    const validBody = { pushToken: 'tok-1', deviceId: 'dev-1', platform: 'ios' };

    it('creates a new push token when none exists', async () => {
      (prisma.pushToken.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.pushToken.create as jest.Mock).mockResolvedValue({ id: 'pt1', deviceId: 'dev-1' });

      const res = await request(app).post('/notifications/register').send(validBody).expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ tokenId: 'pt1', deviceId: 'dev-1' });
      expect(prisma.pushToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ token: 'tok-1', deviceId: 'dev-1', platform: 'ios', isActive: true }),
      });
      expect(prisma.pushToken.update).not.toHaveBeenCalled();
    });

    it('updates the existing token for the device', async () => {
      (prisma.pushToken.findFirst as jest.Mock).mockResolvedValue({ id: 'pt-existing' });
      (prisma.pushToken.update as jest.Mock).mockResolvedValue({ id: 'pt-existing', deviceId: 'dev-1' });

      const res = await request(app).post('/notifications/register').send(validBody).expect(200);

      expect(res.body.data.tokenId).toBe('pt-existing');
      expect(prisma.pushToken.update).toHaveBeenCalledWith({
        where: { id: 'pt-existing' },
        data: expect.objectContaining({ token: 'tok-1', platform: 'ios' }),
      });
      expect(prisma.pushToken.create).not.toHaveBeenCalled();
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app).post('/notifications/register').send({}).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(prisma.pushToken.create).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid platform', async () => {
      const res = await request(app)
        .post('/notifications/register')
        .send({ ...validBody, platform: 'windows' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 500 when the database fails', async () => {
      (prisma.pushToken.findFirst as jest.Mock).mockRejectedValue(new Error('boom'));
      const res = await request(app).post('/notifications/register').send(validBody).expect(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('DELETE /notifications/register/:deviceId', () => {
    it('deactivates tokens for the device', async () => {
      (prisma.pushToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const res = await request(app).delete('/notifications/register/dev-1').expect(200);

      expect(res.body.success).toBe(true);
      expect(prisma.pushToken.updateMany).toHaveBeenCalledWith({
        where: { deviceId: 'dev-1' },
        data: { isActive: false },
      });
    });

    it('returns 500 when the database fails', async () => {
      (prisma.pushToken.updateMany as jest.Mock).mockRejectedValue(new Error('boom'));
      const res = await request(app).delete('/notifications/register/dev-1').expect(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('POST /notifications/:shareCode/subscribe', () => {
    it('returns 400 when deviceId is missing', async () => {
      const res = await request(app).post('/notifications/ABC123/subscribe').send({}).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when the session does not exist', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await request(app)
        .post('/notifications/ABC123/subscribe')
        .send({ deviceId: 'dev-1' })
        .expect(404);
      expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
    });

    it('upserts an active subscription', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({ id: 's1' });
      (prisma.sessionSubscription.upsert as jest.Mock).mockResolvedValue({});

      const res = await request(app)
        .post('/notifications/ABC123/subscribe')
        .send({ deviceId: 'dev-1' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(prisma.sessionSubscription.upsert).toHaveBeenCalledWith({
        where: { sessionId_deviceId: { sessionId: 's1', deviceId: 'dev-1' } },
        create: { sessionId: 's1', deviceId: 'dev-1', isActive: true },
        update: { isActive: true },
      });
    });

    it('returns 500 when the database fails', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockRejectedValue(new Error('boom'));
      await request(app).post('/notifications/ABC123/subscribe').send({ deviceId: 'dev-1' }).expect(500);
    });
  });

  describe('DELETE /notifications/:shareCode/unsubscribe', () => {
    it('returns 400 when deviceId is missing', async () => {
      const res = await request(app).delete('/notifications/ABC123/unsubscribe').send({}).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when the session does not exist', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await request(app)
        .delete('/notifications/ABC123/unsubscribe')
        .send({ deviceId: 'dev-1' })
        .expect(404);
      expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
    });

    it('deactivates the subscription', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({ id: 's1' });
      (prisma.sessionSubscription.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const res = await request(app)
        .delete('/notifications/ABC123/unsubscribe')
        .send({ deviceId: 'dev-1' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(prisma.sessionSubscription.updateMany).toHaveBeenCalledWith({
        where: { sessionId: 's1', deviceId: 'dev-1' },
        data: { isActive: false },
      });
    });

    it('returns 500 when the database fails', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockRejectedValue(new Error('boom'));
      await request(app).delete('/notifications/ABC123/unsubscribe').send({ deviceId: 'dev-1' }).expect(500);
    });
  });

  describe('GET /notifications/:shareCode/subscribers', () => {
    it('returns 404 when the session does not exist', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await request(app).get('/notifications/ABC123/subscribers').expect(404);
      expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
    });

    it('returns the active subscriber count and list', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({ id: 's1' });
      (prisma.sessionSubscription.findMany as jest.Mock).mockResolvedValue([
        { deviceId: 'dev-1', createdAt: new Date('2026-01-01T00:00:00Z') },
        { deviceId: 'dev-2', createdAt: new Date('2026-01-02T00:00:00Z') },
      ]);

      const res = await request(app).get('/notifications/ABC123/subscribers').expect(200);

      expect(res.body.data.count).toBe(2);
      expect(res.body.data.subscribers).toHaveLength(2);
      expect(prisma.sessionSubscription.findMany).toHaveBeenCalledWith({
        where: { sessionId: 's1', isActive: true },
        select: { deviceId: true, createdAt: true },
      });
    });

    it('returns 500 when the database fails', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({ id: 's1' });
      (prisma.sessionSubscription.findMany as jest.Mock).mockRejectedValue(new Error('boom'));
      await request(app).get('/notifications/ABC123/subscribers').expect(500);
    });
  });
});
