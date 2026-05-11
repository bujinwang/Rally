import request from 'supertest';
import express from 'express';

jest.mock('../../middleware/auth', () => ({ authenticateToken: (_r: any, _s: any, n: any) => n() }));
jest.mock('../../utils/validation', () => ({ validate: () => (_r: any, _s: any, n: any) => n() }));
jest.mock('../../utils/notificationHelper', () => ({ notifyDevice: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../services/messagingService', () => ({
  messagingService: {
    createThread: jest.fn(),
    sendMessage: jest.fn(),
    getUserThreads: jest.fn(),
    getThreadMessages: jest.fn(),
    markMessagesAsRead: jest.fn(),
    getUnreadCount: jest.fn(),
    getThreadUnreadCount: jest.fn(),
    deleteMessage: jest.fn(),
    leaveThread: jest.fn(),
    addParticipants: jest.fn(),
    getThreadDetails: jest.fn(),
    searchMessages: jest.fn(),
  },
}));

import { messagingService } from '../../services/messagingService';
import messagingRouter from '../messaging';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => { req.user = { id: 'user1', email: 'a@b.com', role: 'player' }; next(); });
app.use('/messaging', messagingRouter);

describe('Messaging Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /messaging/threads', () => {
    it('creates thread with current user included', async () => {
      (messagingService.createThread as jest.Mock).mockResolvedValue({ id: 't1', participants: ['user1', 'user2'] });
      const res = await request(app).post('/messaging/threads').send({ participants: ['user2'] }).expect(201);
      expect(res.body.data.id).toBe('t1');
    });

    it('returns 401 when not authenticated', async () => {
      const appNoAuth = express();
      appNoAuth.use(express.json());
      appNoAuth.use((_r: any, _s: any, n: any) => n()); // no user
      appNoAuth.use('/messaging', messagingRouter);
      await request(appNoAuth).post('/messaging/threads').send({ participants: ['user2'] }).expect(401);
    });
  });

  describe('POST /messaging/messages', () => {
    it('sends message', async () => {
      (messagingService.sendMessage as jest.Mock).mockResolvedValue({ id: 'm1', content: 'Hello' });
      (messagingService.getThreadDetails as jest.Mock).mockResolvedValue({ participants: ['user1', 'user2'] });
      const res = await request(app).post('/messaging/messages').send({ threadId: 't1', content: 'Hello' }).expect(201);
      expect(res.body.data.content).toBe('Hello');
    });
  });

  describe('GET /messaging/threads', () => {
    it('returns user threads', async () => {
      (messagingService.getUserThreads as jest.Mock).mockResolvedValue([{ id: 't1' }]);
      const res = await request(app).get('/messaging/threads').expect(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /messaging/threads/:threadId/messages', () => {
    it('returns messages with pagination', async () => {
      (messagingService.getThreadMessages as jest.Mock).mockResolvedValue([{ id: 'm1', content: 'Hi' }]);
      const res = await request(app).get('/messaging/threads/t1/messages?limit=10').expect(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('POST /messaging/threads/:threadId/read', () => {
    it('marks thread as read', async () => {
      (messagingService.markMessagesAsRead as jest.Mock).mockResolvedValue({ success: true });
      const res = await request(app).post('/messaging/threads/t1/read').expect(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /messaging/unread', () => {
    it('returns unread count', async () => {
      (messagingService.getUnreadCount as jest.Mock).mockResolvedValue(5);
      const res = await request(app).get('/messaging/unread').expect(200);
      expect(res.body.data.count).toBe(5);
    });
  });

  describe('GET /messaging/threads/:threadId/unread', () => {
    it('returns thread unread count', async () => {
      (messagingService.getThreadUnreadCount as jest.Mock).mockResolvedValue(3);
      const res = await request(app).get('/messaging/threads/t1/unread').expect(200);
      expect(res.body.data.count).toBe(3);
    });
  });

  describe('DELETE /messaging/messages/:messageId', () => {
    it('deletes message', async () => {
      (messagingService.deleteMessage as jest.Mock).mockResolvedValue({ success: true });
      const res = await request(app).delete('/messaging/messages/m1').expect(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /messaging/threads/:threadId/leave', () => {
    it('leaves thread', async () => {
      (messagingService.leaveThread as jest.Mock).mockResolvedValue({ success: true });
      const res = await request(app).post('/messaging/threads/t1/leave').expect(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /messaging/threads/:threadId/participants', () => {
    it('adds participants', async () => {
      (messagingService.addParticipants as jest.Mock).mockResolvedValue({ success: true });
      const res = await request(app).post('/messaging/threads/t1/participants').send({ participants: ['user3'] }).expect(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /messaging/threads/:threadId', () => {
    it('returns thread details', async () => {
      (messagingService.getThreadDetails as jest.Mock).mockResolvedValue({ id: 't1', participants: ['user1', 'user2'] });
      const res = await request(app).get('/messaging/threads/t1').expect(200);
      expect(res.body.data.id).toBe('t1');
    });
  });

  describe('GET /messaging/threads/:threadId/search', () => {
    it('searches messages', async () => {
      (messagingService.searchMessages as jest.Mock).mockResolvedValue([{ id: 'm1', content: 'Hello' }]);
      const res = await request(app).get('/messaging/threads/t1/search?q=Hello').expect(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('requires search query', async () => {
      await request(app).get('/messaging/threads/t1/search').expect(400);
    });
  });
});
