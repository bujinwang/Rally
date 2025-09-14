import request from 'supertest';
import express from 'express';
import mvpSessionsRouter from '../routes/mvpSessions';
import { prisma } from '../config/database';

// Mock the database
jest.mock('../config/database', () => ({
  prisma: {
    mvpSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    mvpPlayer: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

// Mock Socket.IO
jest.mock('../server', () => ({
  io: {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/sessions', mvpSessionsRouter);

describe('POST /api/sessions - Create Session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a session successfully with valid data', async () => {
    const mockSession = {
      id: 'session-123',
      name: 'Test Session',
      shareCode: 'ABC123',
      scheduledAt: new Date('2025-01-15T10:00:00Z'),
      location: 'Test Court',
      maxPlayers: 20,
      ownerName: 'John Doe',
      status: 'ACTIVE',
      createdAt: new Date(),
    };

    const mockPlayer = {
      id: 'player-123',
      name: 'John Doe',
      status: 'ACTIVE',
      joinedAt: new Date(),
    };

    // Mock the database calls
    (prisma.mvpSession.create as jest.Mock).mockResolvedValue(mockSession);
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({
      ...mockSession,
      players: [mockPlayer],
    });
    (prisma.mvpPlayer.create as jest.Mock).mockResolvedValue(mockPlayer);

    const requestData = {
      name: 'Test Session',
      dateTime: '2025-01-15T10:00:00Z',
      location: 'Test Court',
      maxPlayers: 20,
      organizerName: 'John Doe',
    };

    const response = await request(app)
      .post('/api/sessions')
      .send(requestData)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.session.shareCode).toBe('ABC123');
    expect(response.body.data.session.organizerName).toBe('John Doe');
    expect(response.body.data.shareLink).toContain('/join/ABC123');

    // Verify database calls
    expect(prisma.mvpSession.create).toHaveBeenCalledWith({
      data: {
        name: 'Test Session',
        scheduledAt: new Date('2025-01-15T10:00:00Z'),
        location: 'Test Court',
        maxPlayers: 20,
        ownerName: 'John Doe',
        shareCode: expect.any(String),
        status: 'ACTIVE',
      },
    });

    expect(prisma.mvpPlayer.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-123',
        name: 'John Doe',
        deviceId: undefined,
        status: 'ACTIVE',
      },
    });
  });

  it('should create session with auto-generated name when name is not provided', async () => {
    const mockSession = {
      id: 'session-124',
      name: 'Test Court - Jan 15, 10:00 AM',
      shareCode: 'DEF456',
      scheduledAt: new Date('2025-01-15T10:00:00Z'),
      location: 'Test Court',
      maxPlayers: 20,
      ownerName: 'Jane Doe',
      status: 'ACTIVE',
      createdAt: new Date(),
    };

    (prisma.mvpSession.create as jest.Mock).mockResolvedValue(mockSession);
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({
      ...mockSession,
      players: [],
    });
    (prisma.mvpPlayer.create as jest.Mock).mockResolvedValue({});

    const requestData = {
      dateTime: '2025-01-15T10:00:00Z',
      location: 'Test Court',
      maxPlayers: 20,
      organizerName: 'Jane Doe',
    };

    const response = await request(app)
      .post('/api/sessions')
      .send(requestData)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.session.name).toBe('Test Court - Jan 15, 10:00 AM');
  });

  it('should validate required fields', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({
        name: 'Test Session',
        location: 'Test Court',
        maxPlayers: 20,
        // Missing organizerName and dateTime
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toBeDefined();
  });

  it('should validate organizer name length', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({
        dateTime: '2025-01-15T10:00:00Z',
        location: 'Test Court',
        maxPlayers: 20,
        organizerName: 'A', // Too short
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.details.some((detail: any) =>
      detail.msg.includes('Organizer name is required')
    )).toBe(true);
  });

  it('should validate session name length if provided', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({
        name: 'AB', // Too short
        dateTime: '2025-01-15T10:00:00Z',
        location: 'Test Court',
        maxPlayers: 20,
        organizerName: 'John Doe',
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.details.some((detail: any) =>
      detail.msg.includes('Session name must be between 3 and 50 characters')
    )).toBe(true);
  });

  it('should validate max players range', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({
        dateTime: '2025-01-15T10:00:00Z',
        location: 'Test Court',
        maxPlayers: 1, // Too low
        organizerName: 'John Doe',
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.details.some((detail: any) =>
      detail.msg.includes('Max players must be between 2 and 20')
    )).toBe(true);
  });

  it('should validate future date/time', async () => {
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 1);

    const response = await request(app)
      .post('/api/sessions')
      .send({
        dateTime: pastDate.toISOString(),
        location: 'Test Court',
        maxPlayers: 20,
        organizerName: 'John Doe',
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.details.some((detail: any) =>
      detail.msg.includes('Valid date/time required')
    )).toBe(true);
  });

  it('should generate unique share code', async () => {
    // Mock first call to findUnique returns existing session (collision)
    (prisma.mvpSession.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'existing-session' }) // First collision
      .mockResolvedValueOnce(null); // Second call succeeds

    const mockSession = {
      id: 'session-125',
      name: 'Test Session',
      shareCode: 'XYZ789',
      scheduledAt: new Date('2025-01-15T10:00:00Z'),
      location: 'Test Court',
      maxPlayers: 20,
      ownerName: 'John Doe',
      status: 'ACTIVE',
      createdAt: new Date(),
    };

    (prisma.mvpSession.create as jest.Mock).mockResolvedValue(mockSession);
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({
      ...mockSession,
      players: [],
    });
    (prisma.mvpPlayer.create as jest.Mock).mockResolvedValue({});

    const requestData = {
      dateTime: '2025-01-15T10:00:00Z',
      location: 'Test Court',
      maxPlayers: 20,
      organizerName: 'John Doe',
    };

    await request(app)
      .post('/api/sessions')
      .send(requestData)
      .expect(201);

    // Verify findUnique was called twice (collision detection)
    expect(prisma.mvpSession.findUnique).toHaveBeenCalledTimes(2);
  });

  it('should handle database errors gracefully', async () => {
    (prisma.mvpSession.create as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

    const requestData = {
      dateTime: '2025-01-15T10:00:00Z',
      location: 'Test Court',
      maxPlayers: 20,
      organizerName: 'John Doe',
    };

    const response = await request(app)
      .post('/api/sessions')
      .send(requestData)
      .expect(500);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body.error.message).toBe('Failed to create session');
  });
});

describe('GET /api/sessions/:shareCode - Get Session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return session data successfully', async () => {
    const mockSession = {
      id: 'session-123',
      name: 'Test Session',
      shareCode: 'ABC123',
      scheduledAt: new Date('2025-01-15T10:00:00Z'),
      location: 'Test Court',
      maxPlayers: 20,
      ownerName: 'John Doe',
      status: 'ACTIVE',
      createdAt: new Date(),
      players: [
        {
          id: 'player-1',
          name: 'John Doe',
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      ],
      games: [],
      matches: [],
    };

    (prisma.mvpSession.findFirst as jest.Mock).mockResolvedValue(mockSession);

    const response = await request(app)
      .get('/api/sessions/ABC123')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.session.shareCode).toBe('ABC123');
    expect(response.body.data.session.players).toHaveLength(1);
  });

  it('should return 404 for non-existent session', async () => {
    (prisma.mvpSession.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .get('/api/sessions/NONEXISTENT')
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('SESSION_NOT_FOUND');
  });
});

describe('POST /api/sessions/join/:shareCode - Join Session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow player to join session successfully', async () => {
    const mockSession = {
      id: 'session-123',
      shareCode: 'ABC123',
      status: 'ACTIVE',
      players: [],
      maxPlayers: 20,
    };

    const mockPlayer = {
      id: 'player-456',
      name: 'Jane Smith',
      status: 'ACTIVE',
      joinedAt: new Date(),
    };

    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(mockSession);
    (prisma.mvpPlayer.findFirst as jest.Mock).mockResolvedValue(null); // No existing player
    (prisma.mvpPlayer.create as jest.Mock).mockResolvedValue(mockPlayer);

    const requestData = {
      name: 'Jane Smith',
      deviceId: 'device-123',
    };

    const response = await request(app)
      .post('/api/sessions/join/ABC123')
      .send(requestData)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.player.name).toBe('Jane Smith');
    expect(response.body.data.player.status).toBe('ACTIVE');
  });

  it('should prevent joining full session', async () => {
    const mockSession = {
      id: 'session-123',
      shareCode: 'ABC123',
      status: 'ACTIVE',
      players: Array(20).fill({}), // 20 players already
      maxPlayers: 20,
    };

    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(mockSession);

    const requestData = {
      name: 'Jane Smith',
      deviceId: 'device-123',
    };

    const response = await request(app)
      .post('/api/sessions/join/ABC123')
      .send(requestData)
      .expect(403);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('SESSION_FULL');
  });

  it('should prevent duplicate player names', async () => {
    const mockSession = {
      id: 'session-123',
      shareCode: 'ABC123',
      status: 'ACTIVE',
      players: [{ name: 'Jane Smith' }],
      maxPlayers: 20,
    };

    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(mockSession);

    const requestData = {
      name: 'Jane Smith', // Same name as existing player
      deviceId: 'device-123',
    };

    const response = await request(app)
      .post('/api/sessions/join/ABC123')
      .send(requestData)
      .expect(409);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NAME_EXISTS');
  });
});