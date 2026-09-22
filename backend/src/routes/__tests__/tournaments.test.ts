import request from 'supertest';
import express from 'express';

jest.mock('../../services/tournamentService', () => ({
  createTournament: jest.fn(),
  getTournaments: jest.fn(),
  getTournamentById: jest.fn(),
  updateTournament: jest.fn(),
  deleteTournament: jest.fn(),
  registerPlayer: jest.fn(),
  unregisterPlayer: jest.fn(),
  startTournament: jest.fn(),
  getTournamentStats: jest.fn(),
}));

// Story 6.7 T04: `POST /:id/start` now also generates + persists the bracket.
// Mock the facade so these contract tests stay DB-free (the real generate path
// is exercised end-to-end in tournaments.bracket.test.ts).
jest.mock('../../services/tournamentBracketService', () => ({
  tournamentBracketService: {
    generateAndPersistForTournament: jest.fn().mockResolvedValue({ tournamentId: 't1' }),
    getBracketState: jest.fn(),
    updateMatchResult: jest.fn(),
    correctMatchResult: jest.fn(),
  },
  BracketError: class BracketError extends Error {
    readonly code = 'BRACKET_ERROR';
    readonly statusCode = 400;
  },
}));

// Story 6.9 Phase 2 — the organizer guard is now the REAL middleware (it is no
// longer stubbed to a pass-through here). `PUT /:id`, `DELETE /:id`,
// `DELETE /:tournamentId/players/:playerId` and `POST /:id/start` carry
// `optionalAuth, requireTournamentOrganizer()`. The DB is mocked so the suite
// stays DB-free while still exercising the real guard end to end:
//   - `prisma.user.findUnique`       backs `optionalAuth`'s JWT verification;
//   - `prisma.tournament.findUnique` backs `requireTournamentOrganizer()`.
// The real-Postgres guard proof (grant + deny + the `tournamentId` param trap)
// lives in tournaments.bracket.test.ts.
const ORGANIZER_USER_ID = 'route-test-organizer';
const INTRUDER_USER_ID = 'route-test-intruder';

jest.mock('../../config/database', () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
  prisma: {
    user: { findUnique: jest.fn() },
    tournament: { findUnique: jest.fn() },
  },
}));

import * as tournamentService from '../../services/tournamentService';
import { prisma } from '../../config/database';
import { JWTUtils } from '../../utils/jwt';
import tournamentsRouter from '../tournaments';

const userFindUnique = prisma.user.findUnique as unknown as jest.Mock;
const tournamentFindUnique = prisma.tournament.findUnique as unknown as jest.Mock;

const organizerToken = JWTUtils.generateTokens({
  userId: ORGANIZER_USER_ID,
  email: 'organizer@example.test',
  role: 'PLAYER',
}).accessToken;
const intruderToken = JWTUtils.generateTokens({
  userId: INTRUDER_USER_ID,
  email: 'intruder@example.test',
  role: 'PLAYER',
}).accessToken;

const app = express();
app.use(express.json());
app.use('/tournaments', tournamentsRouter);

const validTournament = {
  name: 'Spring Open', tournamentType: 'SINGLE_ELIMINATION', maxPlayers: 32, minPlayers: 8,
  startDate: '2026-06-01T09:00:00Z', registrationDeadline: '2026-05-25T23:59:59Z',
  matchFormat: 'SINGLES', scoringSystem: '21_POINT', bestOfGames: 3,
  entryFee: 20, prizePool: 500, currency: 'USD',
  organizerName: 'David', visibility: 'PUBLIC',
};

describe('Tournament Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // optionalAuth resolves a JWT to a user row; the guard then matches that
    // user against the tournament's recorded organizer.
    userFindUnique.mockImplementation(async (args: { where?: { id?: string } }) => {
      const id = args?.where?.id;
      if (id === ORGANIZER_USER_ID) {
        return { id, email: 'organizer@example.test', role: 'PLAYER' };
      }
      if (id === INTRUDER_USER_ID) {
        return { id, email: 'intruder@example.test', role: 'PLAYER' };
      }
      return null;
    });
    // Every tournament in this suite is owned by the organizer user.
    tournamentFindUnique.mockResolvedValue({
      organizerUserId: ORGANIZER_USER_ID,
      organizerDeviceId: null,
    });
  });

  describe('POST /tournaments', () => {
    it('creates tournament', async () => {
      (tournamentService.createTournament as jest.Mock).mockResolvedValue({ id: 't1', ...validTournament });
      const res = await request(app).post('/tournaments').send(validTournament).expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Spring Open');
    });

    it('returns 400 on validation error', async () => {
      const res = await request(app).post('/tournaments').send({}).expect(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /tournaments', () => {
    it('returns tournament list', async () => {
      (tournamentService.getTournaments as jest.Mock).mockResolvedValue({ tournaments: [], total: 0 });
      const res = await request(app).get('/tournaments').expect(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /tournaments/:id', () => {
    it('returns tournament by ID', async () => {
      (tournamentService.getTournamentById as jest.Mock).mockResolvedValue({ id: 't1', name: 'Spring Open' });
      const res = await request(app).get('/tournaments/t1').expect(200);
      expect(res.body.data.name).toBe('Spring Open');
    });

    it('returns 404 when not found', async () => {
      (tournamentService.getTournamentById as jest.Mock).mockRejectedValue(new Error('Tournament not found'));
      const res = await request(app).get('/tournaments/t1').expect(404);
      expect(res.body.error).toBe('Tournament not found');
    });
  });

  // Story 6.9 Phase 2 — this route was public; it is now organizer-guarded.
  describe('PUT /tournaments/:id', () => {
    it('updates tournament for the organizer', async () => {
      (tournamentService.updateTournament as jest.Mock).mockResolvedValue({ id: 't1', name: 'Updated' });
      const res = await request(app)
        .put('/tournaments/t1')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'Updated' })
        .expect(200);
      expect(res.body.data.name).toBe('Updated');
    });

    it('denies an anonymous caller (was public — Story 6.9 Phase 2)', async () => {
      const res = await request(app).put('/tournaments/t1').send({ name: 'Updated' }).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(tournamentService.updateTournament).not.toHaveBeenCalled();
    });

    it('denies a non-organizer', async () => {
      const res = await request(app)
        .put('/tournaments/t1')
        .set('Authorization', `Bearer ${intruderToken}`)
        .send({ name: 'Updated' })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(tournamentService.updateTournament).not.toHaveBeenCalled();
    });
  });

  // Story 6.9 Phase 2 — this route was public; it is now organizer-guarded.
  describe('DELETE /tournaments/:id', () => {
    it('deletes tournament for the organizer', async () => {
      (tournamentService.deleteTournament as jest.Mock).mockResolvedValue(undefined);
      const res = await request(app)
        .delete('/tournaments/t1')
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 404 when not found — for a PROVEN organizer (not a 403)', async () => {
      (tournamentService.deleteTournament as jest.Mock).mockRejectedValue(new Error('Tournament not found'));
      const res = await request(app)
        .delete('/tournaments/t1')
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(404);
      expect(res.body.error).toBe('Tournament not found');
    });

    it('denies an anonymous caller (was public — Story 6.9 Phase 2)', async () => {
      const res = await request(app).delete('/tournaments/t1').expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(tournamentService.deleteTournament).not.toHaveBeenCalled();
    });
  });

  describe('POST /tournaments/:id/register', () => {
    // Player self-registration is public BY DESIGN (no player accounts in the
    // MVP) and is declared in PUBLIC_ALLOWLIST — it is intentionally unguarded.
    it('registers player without authentication (public by design)', async () => {
      (tournamentService.registerPlayer as jest.Mock).mockResolvedValue({ id: 'p1', playerName: 'Kevin' });
      const res = await request(app).post('/tournaments/t1/register').send({ playerName: 'Kevin' }).expect(201);
      expect(res.body.data.playerName).toBe('Kevin');
    });
  });

  // Story 6.9 Phase 2 — this route was public; it is now organizer-guarded.
  // The tournament id param here is `tournamentId`, so the guard is passed
  // `{ param: 'tournamentId' }`; a wrong param would 400 for everyone.
  describe('DELETE /tournaments/:tournamentId/players/:playerId', () => {
    it('unregisters player for the organizer (param is tournamentId)', async () => {
      (tournamentService.unregisterPlayer as jest.Mock).mockResolvedValue(undefined);
      const res = await request(app)
        .delete('/tournaments/t1/players/p1')
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('denies an anonymous caller (was public — Story 6.9 Phase 2)', async () => {
      const res = await request(app).delete('/tournaments/t1/players/p1').expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(tournamentService.unregisterPlayer).not.toHaveBeenCalled();
    });

    it('denies a non-organizer', async () => {
      const res = await request(app)
        .delete('/tournaments/t1/players/p1')
        .set('Authorization', `Bearer ${intruderToken}`)
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(tournamentService.unregisterPlayer).not.toHaveBeenCalled();
    });
  });

  describe('POST /tournaments/:id/start', () => {
    // Story 6.7 T04: organizer-guarded (it mutates — generate + persist). This
    // asserts the handler contract (status flip + additive `data.bracket`) for a
    // PROVEN organizer; the real-Postgres guard proof is in the bracket suite.
    it('starts tournament for the organizer', async () => {
      (tournamentService.startTournament as jest.Mock).mockResolvedValue(undefined);
      const res = await request(app)
        .post('/tournaments/t1/start')
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bracket).toEqual({ tournamentId: 't1' });
    });
  });

  describe('GET /tournaments/:id/stats', () => {
    it('returns tournament statistics', async () => {
      (tournamentService.getTournamentStats as jest.Mock).mockResolvedValue({ totalPlayers: 16, totalMatches: 24 });
      const res = await request(app).get('/tournaments/t1/stats').expect(200);
      expect(res.body.data.totalPlayers).toBe(16);
    });

    it('returns 404 when not found', async () => {
      (tournamentService.getTournamentStats as jest.Mock).mockRejectedValue(new Error('Tournament not found'));
      const res = await request(app).get('/tournaments/t1/stats').expect(404);
      expect(res.body.error).toBe('Tournament not found');
    });
  });
});
