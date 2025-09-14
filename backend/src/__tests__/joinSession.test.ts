import request from 'supertest';
import { app } from '../server';
import { prisma } from '../config/database';

describe('Join Session API', () => {
  let testSession: any;
  let testShareCode: string;

  beforeAll(async () => {
    // Create a test session
    testSession = await prisma.mvpSession.create({
      data: {
        name: 'Test Join Session',
        scheduledAt: new Date('2025-01-15T10:00:00Z'),
        location: 'Test Court',
        maxPlayers: 4,
        ownerName: 'Test Owner',
        shareCode: 'TEST123',
        status: 'ACTIVE'
      }
    });
    testShareCode = testSession.shareCode;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.mvpPlayer.deleteMany({
      where: { sessionId: testSession.id }
    });
    await prisma.mvpSession.delete({
      where: { id: testSession.id }
    });
  });

  describe('GET /api/mvp-sessions/join/:shareCode', () => {
    it('should return session details for valid share code', async () => {
      const response = await request(app)
        .get(`/api/v1/mvp-sessions/join/${testShareCode}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.session.shareCode).toBe(testShareCode);
      expect(response.body.data.session.name).toBe('Test Join Session');
      expect(response.body.data.session.status).toBe('ACTIVE');
    });

    it('should return 404 for invalid share code', async () => {
      const response = await request(app)
        .get('/api/v1/mvp-sessions/join/INVALID')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 for inactive session', async () => {
      // Create inactive session
      const inactiveSession = await prisma.mvpSession.create({
        data: {
          name: 'Inactive Session',
          scheduledAt: new Date('2025-01-15T10:00:00Z'),
          location: 'Test Court',
          maxPlayers: 4,
          ownerName: 'Test Owner',
          shareCode: 'INACTIVE',
          status: 'CANCELLED'
        }
      });

      const response = await request(app)
        .get('/api/v1/mvp-sessions/join/INACTIVE')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('SESSION_INACTIVE');

      // Clean up
      await prisma.mvpSession.delete({ where: { id: inactiveSession.id } });
    });
  });

  describe('POST /api/mvp-sessions/join/:shareCode', () => {
    beforeEach(async () => {
      // Clean up players before each test
      await prisma.mvpPlayer.deleteMany({
        where: { sessionId: testSession.id }
      });
    });

    it('should successfully join session with valid data', async () => {
      const joinData = {
        name: 'Test Player',
        deviceId: 'device123'
      };

      const response = await request(app)
        .post(`/api/v1/mvp-sessions/join/${testShareCode}`)
        .send(joinData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.player.name).toBe('Test Player');
      expect(response.body.message).toBe('Successfully joined session');
    });

    it('should prevent duplicate player names', async () => {
      // First join
      await request(app)
        .post(`/api/v1/mvp-sessions/join/${testShareCode}`)
        .send({ name: 'Duplicate Player', deviceId: 'device1' })
        .expect(201);

      // Second join with same name
      const response = await request(app)
        .post(`/api/v1/mvp-sessions/join/${testShareCode}`)
        .send({ name: 'Duplicate Player', deviceId: 'device2' })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NAME_EXISTS');
    });

    it('should reject join when session is full', async () => {
      // Fill the session
      for (let i = 1; i <= 4; i++) {
        await request(app)
          .post(`/api/v1/mvp-sessions/join/${testShareCode}`)
          .send({ name: `Player ${i}`, deviceId: `device${i}` })
          .expect(201);
      }

      // Try to join when full
      const response = await request(app)
        .post(`/api/v1/mvp-sessions/join/${testShareCode}`)
        .send({ name: 'Extra Player', deviceId: 'device5' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('SESSION_FULL');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post(`/api/v1/mvp-sessions/join/${testShareCode}`)
        .send({}) // Missing name
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate name length', async () => {
      const response = await request(app)
        .post(`/api/v1/mvp-sessions/join/${testShareCode}`)
        .send({ name: 'A', deviceId: 'device123' }) // Too short
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});