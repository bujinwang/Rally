/**
 * Story 6.1 — independent QA verification of identity precedence (design D2/D3).
 *
 * Design D2 states "when both a JWT and a deviceId are present, the JWT wins",
 * but design D3 explicitly says the JWT branch may "fallback deviceId" for the
 * player lookup. These two statements are in tension. This suite pins down the
 * *actual* behaviour so the team can decide whether it is acceptable.
 */
import { requireOrganizer, requireSessionOwner } from '../permissions';

jest.mock('../../config/database', () => ({
  prisma: {
    mvpSession: { findUnique: jest.fn() },
    mvpPlayer: { findUnique: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  },
}));

const mockPrisma = require('../../config/database').prisma;
const next = jest.fn();

const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

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

describe('QA — identity precedence (JWT vs deviceId)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requireOrganizer: ownerUserId owner is allowed with no device and no player row', async () => {
    const middleware = requireOrganizer('edit_session');
    mockPrisma.mvpSession.findUnique.mockResolvedValue({
      id: 's1',
      ownerUserId: 'uA',
      ownerDeviceId: 'devB',
      players: [],
    });
    const res = mockResponse();

    await middleware(mockRequest({ shareCode: 'S' }, {}, { id: 'uA', role: 'PLAYER' }), res, next);

    expect(next).toHaveBeenCalled();
  });

  it('requireOrganizer: a JWT member matched by userId is honoured', async () => {
    const middleware = requireOrganizer('edit_session');
    mockPrisma.mvpSession.findUnique.mockResolvedValue({
      id: 's1',
      ownerUserId: null,
      players: [{ id: 'pA', userId: 'uA', deviceId: null, role: 'ORGANIZER', name: 'A' }],
    });
    const res = mockResponse();

    await middleware(mockRequest({ shareCode: 'S' }, {}, { id: 'uA', role: 'PLAYER' }), res, next);

    expect(next).toHaveBeenCalled();
  });

  it('requireOrganizer: a JWT user who is neither owner nor a member is denied (404)', async () => {
    const middleware = requireOrganizer('edit_session');
    mockPrisma.mvpSession.findUnique.mockResolvedValue({
      id: 's1',
      ownerUserId: 'uB',
      players: [{ id: 'pB', userId: 'uB', deviceId: 'devB', role: 'ORGANIZER', name: 'B' }],
    });
    const res = mockResponse();

    await middleware(mockRequest({ shareCode: 'S' }, {}, { id: 'uC', role: 'PLAYER' }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('QA FINDING: JWT user A presenting a device owned by user B is GRANTED B\'s role', async () => {
    // Design D3 ("fallback deviceId" inside the JWT branch) makes this pass.
    // A strict reading of D2 ("JWT wins") would deny it. Documented, not asserted
    // as a failure — reported to team-lead as a precedence ambiguity.
    const middleware = requireOrganizer('edit_session');
    mockPrisma.mvpSession.findUnique.mockResolvedValue({
      id: 's1',
      ownerUserId: 'uB',
      ownerDeviceId: 'devB',
      players: [{ id: 'pB', userId: 'uB', deviceId: 'devB', role: 'ORGANIZER', name: 'B' }],
    });
    const res = mockResponse();

    await middleware(
      mockRequest({ shareCode: 'S' }, { deviceId: 'devB' }, { id: 'uA', role: 'PLAYER' }),
      res,
      next
    );

    expect(next).toHaveBeenCalled(); // observed: allowed via the device fallback
  });

  it('QA FINDING: requireSessionOwner also falls back to the device of another user', async () => {
    mockPrisma.mvpSession.findUnique.mockResolvedValue({
      id: 's1',
      ownerUserId: 'uB',
      ownerDeviceId: 'devB',
    });
    const res = mockResponse();

    await requireSessionOwner(
      mockRequest({ sessionId: 's1' }, { deviceId: 'devB' }, { id: 'uA', role: 'PLAYER' }),
      res,
      next
    );

    expect(next).toHaveBeenCalled(); // observed: allowed via the device fallback
  });

  it('requireSessionOwner: an unrelated authenticated user with no device is denied', async () => {
    mockPrisma.mvpSession.findUnique.mockResolvedValue({
      id: 's1',
      ownerUserId: 'uB',
      ownerDeviceId: 'devB',
    });
    const res = mockResponse();

    await requireSessionOwner(
      mockRequest({ sessionId: 's1' }, {}, { id: 'uA', role: 'PLAYER' }),
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
