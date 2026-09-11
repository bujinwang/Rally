import { requireOrganizer, requireOrganizerOrSelf, requireSessionOwner } from '../permissions';

jest.mock('../../config/database', () => ({
  prisma: {
    mvpSession: { findUnique: jest.fn() },
    mvpPlayer: { findUnique: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  },
}));

const mockPrisma = require('../../config/database').prisma;

const mockRequest = (params: any = {}, body: any = {}, user?: any): any => ({
  params,
  body,
  user,
  ip: '127.0.0.1',
  headers: {},
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

describe('permissions — user-aware (Story 6.1)', () => {
  const next = jest.fn();
  beforeEach(() => jest.clearAllMocks());

  describe('requireRole via JWT', () => {
    it('allows the session owner account (ownerUserId) without a player row', async () => {
      const middleware = requireOrganizer('edit_session');
      const req = mockRequest({ shareCode: 'ABC' }, {}, { id: 'u1', role: 'PLAYER' });
      const res = mockResponse();
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 's1',
        ownerUserId: 'u1',
        ownerDeviceId: null,
        players: [],
      });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('allows a player linked by userId with the ORGANIZER role', async () => {
      const middleware = requireOrganizer('edit_session');
      const req = mockRequest({ shareCode: 'ABC' }, {}, { id: 'u1', role: 'PLAYER' });
      const res = mockResponse();
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 's1',
        ownerUserId: null,
        players: [{ id: 'p1', userId: 'u1', deviceId: null, role: 'ORGANIZER', name: 'David' }],
      });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('denies a non-owner PLAYER linked by userId', async () => {
      const middleware = requireOrganizer('edit_session');
      const req = mockRequest({ shareCode: 'ABC' }, {}, { id: 'u2', role: 'PLAYER' });
      const res = mockResponse();
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 's1',
        ownerUserId: 'u1',
        players: [{ id: 'p2', userId: 'u2', deviceId: null, role: 'PLAYER', name: 'Kevin' }],
      });

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('preserves the device fallback when no JWT is present', async () => {
      const middleware = requireOrganizer('edit_session');
      const req = mockRequest({ shareCode: 'ABC' }, { deviceId: 'd1' });
      const res = mockResponse();
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 's1',
        ownerUserId: null,
        players: [{ id: 'p1', userId: null, deviceId: 'd1', role: 'ORGANIZER', name: 'David' }],
      });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      // Device path still filters players by deviceId in the query.
      expect(mockPrisma.mvpSession.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ include: { players: { where: { deviceId: 'd1' } } } })
      );
    });

    it('still rejects anonymous callers with MISSING_DEVICE_ID', async () => {
      const middleware = requireOrganizer('edit_session');
      const req = mockRequest({ shareCode: 'ABC' }, {});
      const res = mockResponse();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'MISSING_DEVICE_ID' }) })
      );
    });
  });

  describe('requireSessionOwner via JWT', () => {
    it('allows when session.ownerUserId matches the authenticated user', async () => {
      const req = mockRequest({ sessionId: 's1' }, {}, { id: 'u1', role: 'PLAYER' });
      const res = mockResponse();
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 's1',
        ownerUserId: 'u1',
        ownerDeviceId: null,
      });

      await requireSessionOwner(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('allows the device owner as before', async () => {
      const req = mockRequest({ sessionId: 's1' }, { deviceId: 'd1' });
      const res = mockResponse();
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 's1',
        ownerUserId: null,
        ownerDeviceId: 'd1',
      });

      await requireSessionOwner(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('denies an unrelated authenticated user', async () => {
      const req = mockRequest({ sessionId: 's1' }, {}, { id: 'u2', role: 'PLAYER' });
      const res = mockResponse();
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 's1',
        ownerUserId: 'u1',
        ownerDeviceId: 'd1',
      });

      await requireSessionOwner(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('requireOrganizerOrSelf via JWT', () => {
    it('allows a user updating their own player row (matched by userId)', async () => {
      const middleware = requireOrganizerOrSelf('update_player_status');
      const req = mockRequest(
        { shareCode: 'ABC', playerId: 'p1' },
        {},
        { id: 'u1', role: 'PLAYER' }
      );
      const res = mockResponse();
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 's1',
        ownerUserId: null,
        players: [{ id: 'p1', userId: 'u1', deviceId: null, role: 'PLAYER', name: 'David' }],
      });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('allows the session owner account to update any player', async () => {
      const middleware = requireOrganizerOrSelf('update_player_status');
      const req = mockRequest(
        { shareCode: 'ABC', playerId: 'p9' },
        {},
        { id: 'u1', role: 'PLAYER' }
      );
      const res = mockResponse();
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 's1',
        ownerUserId: 'u1',
        players: [{ id: 'p9', userId: 'u9', deviceId: null, role: 'PLAYER', name: 'Other' }],
      });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('denies a user updating someone else\'s row', async () => {
      const middleware = requireOrganizerOrSelf('update_player_status');
      const req = mockRequest(
        { shareCode: 'ABC', playerId: 'p9' },
        {},
        { id: 'u2', role: 'PLAYER' }
      );
      const res = mockResponse();
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 's1',
        ownerUserId: 'u1',
        players: [
          { id: 'p2', userId: 'u2', deviceId: null, role: 'PLAYER', name: 'Kevin' },
          { id: 'p9', userId: 'u9', deviceId: null, role: 'PLAYER', name: 'Other' },
        ],
      });

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
