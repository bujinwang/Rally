// @ts-nocheck
import request from 'supertest';
import express from 'express';

jest.mock('../../config/database', () => ({
  prisma: {
    mvpSession: { findMany: jest.fn() },
    mvpPlayer: { findMany: jest.fn() },
  },
}));

import { prisma } from '../../config/database';
import searchRouter from '../search';

const app = express();
app.use(express.json());
app.use('/search', searchRouter);

const sampleSession = {
  id: 's1',
  name: 'Monday Badminton',
  location: 'Community Center',
  scheduledAt: new Date('2026-05-11T19:00:00Z'),
  ownerName: 'David',
  maxPlayers: 8,
  status: 'ACTIVE',
  shareCode: 'ABC123',
  skillLevel: 'INTERMEDIATE',
  cost: 10,
  description: 'Weekly game',
  players: [{ name: 'Alice', gamesPlayed: 3, wins: 1, status: 'ACTIVE' }],
  games: [{ id: 'g1', status: 'IN_PROGRESS' }, { id: 'g2', status: 'COMPLETED' }],
};

const samplePlayer = {
  name: 'Alice',
  gamesPlayed: 10,
  wins: 6,
  losses: 4,
  session: {
    id: 's1',
    name: 'Monday Badminton',
    scheduledAt: new Date('2026-05-11T19:00:00Z'),
    status: 'ACTIVE',
    shareCode: 'ABC123',
  },
};

describe('Search Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /search', () => {
    it('returns 400 when the query is missing', async () => {
      const res = await request(app).get('/search').expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(prisma.mvpSession.findMany).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid type', async () => {
      await request(app).get('/search?q=badminton&type=weird').expect(400);
    });

    it('returns 400 when limit is out of range', async () => {
      await request(app).get('/search?q=badminton&limit=0').expect(400);
      await request(app).get('/search?q=badminton&limit=51').expect(400);
    });

    it('returns 400 when includeCompleted is not boolean', async () => {
      await request(app).get('/search?q=badminton&includeCompleted=nope').expect(400);
    });

    it('searches sessions and aggregated players by default', async () => {
      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue([sampleSession]);
      (prisma.mvpPlayer.findMany as jest.Mock).mockResolvedValue([
        samplePlayer,
        { ...samplePlayer, gamesPlayed: 5, wins: 3, losses: 2, session: { ...samplePlayer.session, id: 's2' } },
        { name: 'Bob', gamesPlayed: 4, wins: 1, losses: 3, session: { ...samplePlayer.session, id: 's3' } },
      ]);

      const res = await request(app).get('/search?q=badminton').expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.query).toBe('badminton');
      const session = res.body.data.results.sessions[0];
      expect(session.id).toBe('s1');
      expect(session.playerCount).toBe(1);
      expect(session.gamesCount).toBe(2);
      expect(session.activeGames).toBe(1);

      const alice = res.body.data.results.players.find(p => p.name === 'Alice');
      expect(alice.totalGames).toBe(15);
      expect(alice.totalWins).toBe(9);
      expect(alice.sessionCount).toBe(2);
      expect(alice.winRate).toBe(60);
      expect(res.body.data.results.totalResults).toBe(3);
    });

    it('searches only sessions when type=sessions', async () => {
      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue([sampleSession]);

      const res = await request(app).get('/search?q=badminton&type=sessions').expect(200);

      expect(res.body.data.results.sessions).toHaveLength(1);
      expect(res.body.data.results.players).toEqual([]);
      expect(prisma.mvpPlayer.findMany).not.toHaveBeenCalled();
      expect((prisma.mvpSession.findMany as jest.Mock).mock.calls[0][0].take).toBe(20);
    });

    it('searches only players when type=players', async () => {
      (prisma.mvpPlayer.findMany as jest.Mock).mockResolvedValue([samplePlayer]);

      const res = await request(app).get('/search?q=alice&type=players').expect(200);

      expect(res.body.data.results.players).toHaveLength(1);
      expect(res.body.data.results.sessions).toEqual([]);
      expect(prisma.mvpSession.findMany).not.toHaveBeenCalled();
    });

    it('restricts to ACTIVE sessions by default', async () => {
      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue([sampleSession]);
      (prisma.mvpPlayer.findMany as jest.Mock).mockResolvedValue([samplePlayer]);

      await request(app).get('/search?q=badminton').expect(200);

      expect((prisma.mvpSession.findMany as jest.Mock).mock.calls[0][0].where.status).toBe('ACTIVE');
      expect((prisma.mvpPlayer.findMany as jest.Mock).mock.calls[0][0].where.session).toEqual({ status: 'ACTIVE' });
    });

    it('includes completed sessions and players when requested', async () => {
      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue([sampleSession]);
      (prisma.mvpPlayer.findMany as jest.Mock).mockResolvedValue([samplePlayer]);

      await request(app).get('/search?q=badminton&includeCompleted=true').expect(200);

      expect((prisma.mvpSession.findMany as jest.Mock).mock.calls[0][0].where.status).toBeUndefined();
      expect((prisma.mvpPlayer.findMany as jest.Mock).mock.calls[0][0].where.session).toBeUndefined();
    });

    it('suggests recent sessions when there are no results', async () => {
      (prisma.mvpSession.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { name: 'Recent One', location: 'Court A' },
          { name: 'Recent Two', location: null },
          { name: 'Recent Three', location: 'Court C' },
        ]);
      (prisma.mvpPlayer.findMany as jest.Mock).mockResolvedValue([]);

      const res = await request(app).get('/search?q=nothing').expect(200);

      expect(res.body.data.results.totalResults).toBe(0);
      expect(res.body.data.suggestions).toContain('Recent One');
      expect(res.body.data.suggestions.length).toBeLessThanOrEqual(5);
      expect(prisma.mvpSession.findMany).toHaveBeenCalledTimes(2);
    });

    it('returns 500 when the search fails', async () => {
      (prisma.mvpSession.findMany as jest.Mock).mockRejectedValue(new Error('boom'));
      const res = await request(app).get('/search?q=badminton').expect(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('GET /search/suggestions', () => {
    it('returns an empty list when q is missing', async () => {
      const res = await request(app).get('/search/suggestions').expect(200);
      expect(res.body.data.suggestions).toEqual([]);
      expect(prisma.mvpSession.findMany).not.toHaveBeenCalled();
    });

    it('returns an empty list when q is too short', async () => {
      const res = await request(app).get('/search/suggestions?q=a').expect(200);
      expect(res.body.data.suggestions).toEqual([]);
      expect(prisma.mvpSession.findMany).not.toHaveBeenCalled();
    });

    it('returns session, location and player suggestions', async () => {
      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue([{ name: 'Alpha', location: 'Arena' }]);
      (prisma.mvpPlayer.findMany as jest.Mock).mockResolvedValue([{ name: 'Al' }]);

      const res = await request(app).get('/search/suggestions?q=al').expect(200);

      expect(res.body.data.suggestions).toEqual([
        { text: 'Alpha', type: 'session' },
        { text: 'Arena', type: 'location' },
        { text: 'Al', type: 'player' },
      ]);
    });

    it('returns 500 when the lookup fails', async () => {
      (prisma.mvpSession.findMany as jest.Mock).mockRejectedValue(new Error('boom'));
      const res = await request(app).get('/search/suggestions?q=alpha').expect(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
