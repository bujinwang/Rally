// @ts-nocheck
import request from 'supertest';
import express from 'express';

jest.mock('../../middleware/auth', () => ({ authenticateToken: (_r, _s, n) => n() }));
jest.mock('../../utils/validation', () => ({ validate: () => (_r, _s, n) => n() }));
jest.mock('../../services/messagingService', () => ({
  messagingService: {
    createThread: jest.fn().mockResolvedValue({ id: 't1' }),
    sendMessage: jest.fn().mockResolvedValue({ id: 'm1' }),
    getUserThreads: jest.fn().mockResolvedValue([{ id: 't1' }]),
    getThreadMessages: jest.fn().mockResolvedValue([{ id: 'm1', content: 'Hi' }]),
    markMessagesAsRead: jest.fn().mockResolvedValue({ success: true }),
    getUnreadCount: jest.fn().mockResolvedValue(3),
    getThreadUnreadCount: jest.fn().mockResolvedValue(1),
    deleteMessage: jest.fn().mockResolvedValue({ success: true }),
    leaveThread: jest.fn().mockResolvedValue({ success: true }),
    addParticipants: jest.fn().mockResolvedValue({ success: true }),
    getThreadDetails: jest.fn().mockResolvedValue({ id: 't1' }),
    searchMessages: jest.fn().mockResolvedValue([{ id: 'm1' }]),
  },
}));

import messagingRouter from '../messaging-old';

const app = express();
app.use(express.json());
app.use((r: any, _s, n) => { r.user = { id: 'u1', role: 'player' }; n(); });
app.use('/messaging', messagingRouter);

describe('Messaging Routes (legacy)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /threads — creates thread', async () => {
    const res = await request(app).post('/messaging/threads').send({ participants: ['u1', 'u2'] }).expect(201);
    expect(res.body.success).toBe(true);
  });

  it('POST /messages — sends message', async () => {
    const res = await request(app).post('/messaging/messages').send({ threadId: 't1', content: 'Hello' }).expect(201);
    expect(res.body.success).toBe(true);
  });

  it('GET /threads — returns threads', async () => {
    const res = await request(app).get('/messaging/threads').expect(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /threads/:id/messages — returns messages', async () => {
    const res = await request(app).get('/messaging/threads/t1/messages').expect(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /threads/:id/read — marks read', async () => {
    const res = await request(app).post('/messaging/threads/t1/read').expect(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /unread — returns unread count', async () => {
    const res = await request(app).get('/messaging/unread').expect(200);
    expect(res.body.data.count).toBe(3);
  });

  it('DELETE /messages/:id — deletes message', async () => {
    const res = await request(app).delete('/messaging/messages/m1').expect(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /threads/:id/leave — leaves thread', async () => {
    const res = await request(app).post('/messaging/threads/t1/leave').expect(200);
    expect(res.body.success).toBe(true);
  });
});
