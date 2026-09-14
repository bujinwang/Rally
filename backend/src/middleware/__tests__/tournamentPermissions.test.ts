/**
 * Story 6.7 (design §D6, AC 15) — `requireTournamentOrganizer` guard.
 *
 * These tests invoke the middleware DIRECTLY with hand-built req/res/next mocks.
 * We deliberately do not use supertest / bind a port: `src/__tests__/setup.ts`
 * allocates loopback ports keyed on `JEST_WORKER_ID`, and a second concurrent
 * jest run in this repo collides on those ports (EADDRINUSE). Direct invocation
 * sidesteps that entirely.
 */
import { requireTournamentOrganizer } from '../tournamentPermissions';

jest.mock('../../config/database', () => ({
  prisma: {
    tournament: { findUnique: jest.fn() },
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

const mockRequest = (
  params: any = {},
  body: any = {},
  user?: any,
  headers: any = {}
): any => ({
  params,
  body,
  user,
  headers,
  ip: '127.0.0.1',
  get: jest.fn(),
  header: jest.fn(),
  connection: { remoteAddress: '127.0.0.1' },
});

const asOrganizer = () => requireTournamentOrganizer();

describe('requireTournamentOrganizer (Story 6.7 AC 15)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('1. allows a JWT user matching organizerUserId, next() called', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      organizerUserId: 'u1',
      organizerDeviceId: null,
    });
    const res = mockResponse();

    await asOrganizer()(mockRequest({ id: 't1' }, {}, { id: 'u1' }), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('2. denies a JWT user not matching organizerUserId (403), next() NOT called', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      organizerUserId: 'u1',
      organizerDeviceId: null,
    });
    const res = mockResponse();

    await asOrganizer()(mockRequest({ id: 't1' }, {}, { id: 'u2' }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
        timestamp: expect.any(String),
      })
    );
  });

  it('3. allows a device-only identity matching organizerDeviceId, next() called', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      organizerUserId: null,
      organizerDeviceId: 'dev1',
    });
    const res = mockResponse();

    await asOrganizer()(mockRequest({ id: 't1' }, { deviceId: 'dev1' }), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('4. denies a device-only identity that does not match (403), next() NOT called', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      organizerUserId: null,
      organizerDeviceId: 'dev1',
    });
    const res = mockResponse();

    await asOrganizer()(mockRequest({ id: 't1' }, { deviceId: 'dev2' }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('5. denies an anonymous caller (no JWT, no deviceId) — fail closed, next() NOT called', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      organizerUserId: 'u1',
      organizerDeviceId: 'dev1',
    });
    const res = mockResponse();

    await asOrganizer()(mockRequest({ id: 't1' }, {}), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'FORBIDDEN' }) })
    );
  });

  it('6. denies when both organizer columns are null (legacy row) — fail closed, next() NOT called', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      organizerUserId: null,
      organizerDeviceId: null,
    });

    // A caller presenting a valid JWT must still be denied: no recorded owner.
    const resJwt = mockResponse();
    await asOrganizer()(mockRequest({ id: 't1' }, {}, { id: 'u1' }), resJwt, next);
    expect(next).not.toHaveBeenCalled();
    expect(resJwt.status).toHaveBeenCalledWith(403);

    // A caller presenting a deviceId must also be denied.
    const resDev = mockResponse();
    await asOrganizer()(mockRequest({ id: 't1' }, { deviceId: 'dev1' }), resDev, next);
    expect(next).not.toHaveBeenCalled();
    expect(resDev.status).toHaveBeenCalledWith(403);
  });

  it('7. returns 404 when the tournament is not found, next() NOT called', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue(null);
    const res = mockResponse();

    await asOrganizer()(mockRequest({ id: 'missing' }, {}, { id: 'u1' }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'TOURNAMENT_NOT_FOUND' }) })
    );
  });

  it('8. returns 400 when the route param is missing, next() NOT called', async () => {
    const res = mockResponse();

    await asOrganizer()(mockRequest({}, {}, { id: 'u1' }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'MISSING_TOURNAMENT_ID' }) })
    );
    // No DB work should happen without an id.
    expect(mockPrisma.tournament.findUnique).not.toHaveBeenCalled();
  });

  it('9. returns 500 (INTERNAL_ERROR) when Prisma throws, next() NOT called', async () => {
    mockPrisma.tournament.findUnique.mockRejectedValue(new Error('db down'));
    const res = mockResponse();

    await asOrganizer()(mockRequest({ id: 't1' }, {}, { id: 'u1' }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'INTERNAL_ERROR' }) })
    );
  });

  it('10. JUDGMENT CALL: a JWT user whose userId mismatches organizerUserId but whose deviceId matches organizerDeviceId is DENIED (strict policy), next() NOT called', async () => {
    // A verified JWT is authoritative: the carried deviceId is not consulted,
    // so a user cannot impersonate a device-based organizer by echoing a device
    // id they do not own. See the header comment in tournamentPermissions.ts.
    mockPrisma.tournament.findUnique.mockResolvedValue({
      organizerUserId: 'u-owner',
      organizerDeviceId: 'dev-owner',
    });
    const res = mockResponse();

    await asOrganizer()(
      mockRequest({ id: 't1' }, { deviceId: 'dev-owner' }, { id: 'u-attacker' }),
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('11. honours a deviceId supplied via the x-device-id header (documented fallback), next() called', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      organizerUserId: null,
      organizerDeviceId: 'dev-header',
    });
    const res = mockResponse();

    await asOrganizer()(
      mockRequest({ id: 't1' }, {}, undefined, { 'x-device-id': 'dev-header' }),
      res,
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('12. honours a configurable route param name', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      organizerUserId: 'u1',
      organizerDeviceId: null,
    });
    const res = mockResponse();

    await requireTournamentOrganizer({ param: 'tournamentId' })(
      mockRequest({ tournamentId: 't1' }, {}, { id: 'u1' }),
      res,
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockPrisma.tournament.findUnique).toHaveBeenCalledWith({
      where: { id: 't1' },
      select: { organizerUserId: true, organizerDeviceId: true },
    });
  });
});
