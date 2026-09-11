/**
 * versionConflict.test.ts — Story 6.5 / T02.
 *
 * Unit tests for `middleware/versioning.ts` (design §5.2/§5.3, §12 rows):
 *   - stale `X-Entity-Version` → `409 VERSION_CONFLICT` + authoritative body
 *     (`data.current` + `data.serverVersion`) and NO write applied
 *   - matching version → `200` with `version` incremented
 *   - no `X-Entity-Version` header → legacy behaviour unchanged (back-compat)
 *   - a non-existent entity → the route proceeds (its own 404), never a
 *     fabricated conflict
 *   - a non-numeric header is ignored (treated as absent)
 *
 * The middleware is exercised directly against a tiny Express app so the test
 * is fast and does not depend on the full `mvpSessions` route.
 */

jest.mock('../../config/database', () => ({
  prisma: {
    mvpSession: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    mvpPlayer: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import express from 'express';
import request from 'supertest';
import { prisma } from '../../config/database';
import { versioning, parseEntityVersionHeader, sanitizeEntity } from '../../middleware/versioning';

const sessionFindFirst = prisma.mvpSession.findFirst as jest.Mock;
const sessionUpdateMany = prisma.mvpSession.updateMany as jest.Mock;
const playerFindUnique = prisma.mvpPlayer.findUnique as jest.Mock;
const playerUpdate = prisma.mvpPlayer.update as jest.Mock;

const makeApp = () => {
  const app = express();
  app.use(express.json());

  app.put(
    '/mvp-sessions/:shareCode',
    versioning({ entity: 'session', resolveId: (req) => req.params.shareCode }),
    (_req, res) => {
      res.json({ success: true, data: { session: { id: 's1', name: 'Updated' } } });
    },
  );

  app.put(
    '/mvp-sessions/:shareCode/players/:playerId/status',
    versioning({ entity: 'player', resolveId: (req) => req.params.playerId }),
    (_req, res) => {
      res.json({ success: true, data: { player: { id: 'p1', status: 'ACTIVE' } } });
    },
  );

  return app;
};

const app = makeApp();

beforeEach(() => {
  jest.clearAllMocks();
  // Default: session exists at v5, player exists at v5.
  sessionFindFirst.mockResolvedValue({ id: 's1', shareCode: 'ABC', name: 'Old', version: 5 });
  sessionUpdateMany.mockResolvedValue({ count: 1 });
  playerFindUnique.mockResolvedValue({ id: 'p1', sessionId: 's1', status: 'RESTING', version: 5 });
  playerUpdate.mockResolvedValue({ version: 6 });
});

describe('versioning middleware — session route', () => {
  it('stale X-Entity-Version → 409 VERSION_CONFLICT + authoritative body, no write', async () => {
    const res = await request(app)
      .put('/mvp-sessions/ABC')
      .set('X-Entity-Version', '3')
      .send({ location: 'Local Venue' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
    expect(res.body.data.serverVersion).toBe(5);
    // Authoritative entity returned so the client can apply LWW.
    expect(res.body.data.current).toMatchObject({ id: 's1', name: 'Old', version: 5 });

    // Crucially: the write was NOT applied.
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });

  it('QA defect 2: the 409 authoritative body never leaks server secrets', async () => {
    // The row as Prisma returns it includes the organizer claim credential.
    sessionFindFirst.mockResolvedValue({
      id: 's1',
      shareCode: 'ABC',
      name: 'Old',
      version: 5,
      organizerSecretHash: '$2b$10$SUPER-SECRET-HASH',
      organizerSecretUpdatedAt: '2026-01-01T00:00:00.000Z',
      ownershipClaimedAt: '2026-01-01T00:00:00.000Z',
    });

    const res = await request(app)
      .put('/mvp-sessions/ABC')
      .set('X-Entity-Version', '3')
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
    // Non-secret authoritative fields survive for LWW…
    expect(res.body.data.current).toMatchObject({ id: 's1', name: 'Old', version: 5 });
    expect(res.body.data.current.ownershipClaimedAt).toBe('2026-01-01T00:00:00.000Z');
    // …but the credential is gone, and its literal value is absent from the wire.
    expect(res.body.data.current.organizerSecretHash).toBeUndefined();
    expect(res.body.data.current.organizerSecretUpdatedAt).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('SUPER-SECRET-HASH');
  });

  it('matching version → 200 and version incremented in the body', async () => {
    sessionFindFirst
      .mockResolvedValueOnce({ id: 's1', shareCode: 'ABC', name: 'Old', version: 5 }) // read
      .mockResolvedValueOnce({ version: 6 }); // post-increment read

    const res = await request(app)
      .put('/mvp-sessions/ABC')
      .set('X-Entity-Version', '5')
      .send({ location: 'New Venue' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.session.version).toBe(6);
    expect(sessionUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('a GREATER client version is not a conflict (only "<" server triggers 409)', async () => {
    const res = await request(app).put('/mvp-sessions/ABC').set('X-Entity-Version', '9').send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('NO X-Entity-Version header → legacy behaviour unchanged (200, no conflict check)', async () => {
    const res = await request(app).put('/mvp-sessions/ABC').send({ location: 'Anything' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // No conflict was raised: the request proceeded straight to the route.
    expect(res.body.error).toBeUndefined();
    // The token still advances on success (additive, back-compatible) so it
    // stays monotonic for header-sending clients.
    expect(sessionUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('a non-numeric X-Entity-Version is ignored (treated as absent)', async () => {
    const res = await request(app)
      .put('/mvp-sessions/ABC')
      .set('X-Entity-Version', 'not-a-number')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('a non-existent entity lets the route proceed (no fabricated conflict)', async () => {
    sessionFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .put('/mvp-sessions/GHOST')
      .set('X-Entity-Version', '1')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('a DB lookup error defers to the route (never turns into a conflict)', async () => {
    sessionFindFirst.mockRejectedValue(new Error('db down'));

    const res = await request(app)
      .put('/mvp-sessions/ABC')
      .set('X-Entity-Version', '1')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('versioning middleware — player route', () => {
  it('stale version → 409 with the authoritative player and no write', async () => {
    const res = await request(app)
      .put('/mvp-sessions/ABC/players/p1/status')
      .set('X-Entity-Version', '2')
      .send({ status: 'LEFT' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
    expect(res.body.data.serverVersion).toBe(5);
    expect(res.body.data.current).toMatchObject({ id: 'p1', status: 'RESTING' });
    expect(playerUpdate).not.toHaveBeenCalled();
  });

  it('matching version → 200 with the incremented player version', async () => {
    const res = await request(app)
      .put('/mvp-sessions/ABC/players/p1/status')
      .set('X-Entity-Version', '5')
      .send({ status: 'LEFT' });

    expect(res.status).toBe(200);
    expect(res.body.data.player.version).toBe(6);
    expect(playerUpdate).toHaveBeenCalledTimes(1);
  });

  it('no header → legacy behaviour unchanged (200, route reached, no conflict)', async () => {
    const res = await request(app)
      .put('/mvp-sessions/ABC/players/p1/status')
      .send({ status: 'LEFT' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.error).toBeUndefined();
    // Token still advances (additive); no conflict check short-circuited it.
    expect(playerUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('parseEntityVersionHeader', () => {
  const fakeReq = (value?: string) =>
    ({ header: (name: string) => (name === 'X-Entity-Version' ? value : undefined) }) as any;

  it('parses integers, returns null for absent / empty / non-numeric', () => {
    expect(parseEntityVersionHeader(fakeReq('7'))).toBe(7);
    expect(parseEntityVersionHeader(fakeReq('0'))).toBe(0);
    expect(parseEntityVersionHeader(fakeReq('3.9'))).toBe(3);
    expect(parseEntityVersionHeader(fakeReq())).toBeNull();
    expect(parseEntityVersionHeader(fakeReq(''))).toBeNull();
    expect(parseEntityVersionHeader(fakeReq('abc'))).toBeNull();
  });
});

describe('sanitizeEntity', () => {
  it('drops every sensitive key and preserves the rest, without mutating input', () => {
    const row = {
      id: 'p1',
      name: 'David',
      version: 3,
      organizerSecretHash: 'H',
      organizerSecretUpdatedAt: 'T',
      passwordHash: 'P',
      accessToken: 'A',
      refreshToken: 'R',
      tokenHash: 'TH',
    };
    const safe = sanitizeEntity(row) as Record<string, unknown>;
    expect(safe).toEqual({ id: 'p1', name: 'David', version: 3 });
    // Input untouched.
    expect(row.organizerSecretHash).toBe('H');
  });

  it('passes non-objects through unchanged', () => {
    expect(sanitizeEntity(null as any)).toBeNull();
    expect(sanitizeEntity('x' as any)).toBe('x');
  });
});

