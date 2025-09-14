import { requireOrganizer, requireOrganizerOrSelf, validatePermission } from '../permissions';

// Mock Prisma client
jest.mock('../../config/database', () => ({
  prisma: {
    mvpSession: {
      findUnique: jest.fn(),
    },
    mvpPlayer: {
      findUnique: jest.fn(),
    },
  },
}));

const mockPrisma = require('../../config/database').prisma;

// Mock Express objects
const mockRequest = (params: any = {}, body: any = {}, user: any = {}) => ({
  params,
  body,
  user,
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
      const req = mockRequest({ shareCode: 'ABC123' }, { ownerDeviceId: 'device-2' });
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

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only session organizers can perform this action'
        }
      });
    });
  });

  describe('requireOrganizerOrSelf', () => {
    it('should call next() for organizer', async () => {
      const middleware = requireOrganizerOrSelf('update_player_status');
      const req = mockRequest({ playerId: 'player-1' }, { deviceId: 'device-1' });
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
      const req = mockRequest({ playerId: 'player-2' }, { deviceId: 'device-2' });
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
      const req = mockRequest({ playerId: 'player-2' }, { deviceId: 'device-3' });
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

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the player themselves or session organizer can perform this action'
        }
      });
    });
  });

  describe('validatePermission', () => {
    it('should return true for organizer with any action', async () => {
      const result = await validatePermission('session-1', 'device-1', 'edit_session');

      // Mock the database calls within validatePermission
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

      expect(result).toBe(true);
    });

    it('should return false for player without permission', async () => {
      const result = await validatePermission('session-1', 'device-2', 'edit_session');

      // Mock the database calls within validatePermission
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

      expect(result).toBe(false);
    });
  });
});