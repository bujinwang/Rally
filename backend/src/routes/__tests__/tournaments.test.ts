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

import * as tournamentService from '../../services/tournamentService';
import tournamentsRouter from '../tournaments';

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
  beforeEach(() => jest.clearAllMocks());

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

  describe('PUT /tournaments/:id', () => {
    it('updates tournament', async () => {
      (tournamentService.updateTournament as jest.Mock).mockResolvedValue({ id: 't1', name: 'Updated' });
      const res = await request(app).put('/tournaments/t1').send({ name: 'Updated' }).expect(200);
      expect(res.body.data.name).toBe('Updated');
    });
  });

  describe('DELETE /tournaments/:id', () => {
    it('deletes tournament', async () => {
      (tournamentService.deleteTournament as jest.Mock).mockResolvedValue(undefined);
      const res = await request(app).delete('/tournaments/t1').expect(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 404 when not found', async () => {
      (tournamentService.deleteTournament as jest.Mock).mockRejectedValue(new Error('Tournament not found'));
      const res = await request(app).delete('/tournaments/t1').expect(404);
      expect(res.body.error).toBe('Tournament not found');
    });
  });

  describe('POST /tournaments/:id/register', () => {
    it('registers player', async () => {
      (tournamentService.registerPlayer as jest.Mock).mockResolvedValue({ id: 'p1', playerName: 'Kevin' });
      const res = await request(app).post('/tournaments/t1/register').send({ playerName: 'Kevin' }).expect(201);
      expect(res.body.data.playerName).toBe('Kevin');
    });
  });

  describe('DELETE /tournaments/:id/players/:playerId', () => {
    it('unregisters player', async () => {
      (tournamentService.unregisterPlayer as jest.Mock).mockResolvedValue(undefined);
      const res = await request(app).delete('/tournaments/t1/players/p1').expect(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /tournaments/:id/start', () => {
    it('starts tournament', async () => {
      (tournamentService.startTournament as jest.Mock).mockResolvedValue(undefined);
      const res = await request(app).post('/tournaments/t1/start').expect(200);
      expect(res.body.success).toBe(true);
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
