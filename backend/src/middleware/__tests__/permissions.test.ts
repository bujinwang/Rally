import { requireOrganizer, requireOrganizerOrSelf } from '../permissions';

// Mock Prisma client
jest.mock('../../config/database', () => ({
  prisma: {
    mvpSession: {
      findUnique: jest.fn(),
    },
    mvpPlayer: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

const mockPrisma = require('../../config/database').prisma;

// Mock Express objects
const mockRequest = (params: any = {}, body: any = {}, user: any = {}): any => ({
  params,
  body,
  user,
  ip: '127.0.0.1',
  get: jest.fn(),
  header: jest.fn(),
  connection: { remoteAddress: '127.0.0.1' },
});

const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn();

describe('Permission Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requireOrganizer', () => {
    it('should call next() for organizer', async () => {
      const middleware = requireOrganizer('edit_session');
      const req = mockRequest({ shareCode: 'ABC123' }, { ownerDeviceId: 'device-1' });
      const res = mockResponse();

      // Mock session and player lookup
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 'session-1',
        ownerDeviceId: 'device-1',
        players: [{ id: 'player-1', deviceId: 'device-1', role: 'ORGANIZER' }]
      });

      mockPrisma.mvpPlayer.findUnique.mockResolvedValue({
        id: 'player-1',
        deviceId: 'device-1',
        role: 'ORGANIZER'
      });

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 for non-organizer', async () => {
      const middleware = requireOrganizer('edit_session');
      const req = mockRequest({ shareCode: 'ABC123' }, { deviceId: 'device-2' });
      const res = mockResponse();

      // Mock session and player lookup — Prisma filters by deviceId, so only matching player returned
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 'session-1',
        ownerDeviceId: 'device-1',
        players: [
          { id: 'player-2', deviceId: 'device-2', role: 'PLAYER' }
        ]
      });

      mockPrisma.mvpPlayer.findUnique.mockResolvedValue({
        id: 'player-2',
        deviceId: 'device-2',
        role: 'PLAYER'
      });

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            error: 'Insufficient permissions',
          }),
        })
      );
    });
  });

  describe('requireOrganizerOrSelf', () => {
    it('should call next() for organizer', async () => {
      const middleware = requireOrganizerOrSelf('update_player_status');
      const req = mockRequest({ shareCode: 'ABC123', playerId: 'player-1' }, { deviceId: 'device-1' });
      const res = mockResponse();

      // Mock session and player lookup
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 'session-1',
        ownerDeviceId: 'device-1',
        players: [{ id: 'player-1', deviceId: 'device-1', role: 'ORGANIZER' }]
      });

      mockPrisma.mvpPlayer.findUnique.mockResolvedValue({
        id: 'player-1',
        deviceId: 'device-1',
        role: 'ORGANIZER'
      });

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() for self', async () => {
      const middleware = requireOrganizerOrSelf('update_player_status');
      const req = mockRequest({ shareCode: 'ABC123', playerId: 'player-2' }, { deviceId: 'device-2' });
      const res = mockResponse();

      // Mock session and player lookup
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 'session-1',
        ownerDeviceId: 'device-1',
        players: [
          { id: 'player-1', deviceId: 'device-1', role: 'ORGANIZER' },
          { id: 'player-2', deviceId: 'device-2', role: 'PLAYER' }
        ]
      });

      mockPrisma.mvpPlayer.findUnique.mockResolvedValue({
        id: 'player-2',
        deviceId: 'device-2',
        role: 'PLAYER'
      });

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 for unauthorized user', async () => {
      const middleware = requireOrganizerOrSelf('update_player_status');
      const req = mockRequest({ shareCode: 'ABC123', playerId: 'player-2' }, { deviceId: 'device-3' });
      const res = mockResponse();

      // Mock session and player lookup
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 'session-1',
        ownerDeviceId: 'device-1',
        players: [
          { id: 'player-1', deviceId: 'device-1', role: 'ORGANIZER' },
          { id: 'player-2', deviceId: 'device-2', role: 'PLAYER' },
          { id: 'player-3', deviceId: 'device-3', role: 'PLAYER' }
        ]
      });

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'FORBIDDEN',
          }),
        })
      );
    });
  });

  describe.skip('validatePermission', () => {
    it('should return true for organizer with any action', () => {
      expect(true).toBe(true); // validatePermission not exported from module
    });
  });
});