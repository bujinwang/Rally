// @ts-nocheck
import request from 'supertest';
import express from 'express';

jest.mock('../../services/achievementService', () => ({
  achievementService: {
    getActiveAchievements: jest.fn(),
    getAchievementsByCategory: jest.fn(),
    getPlayerAchievements: jest.fn(),
    getPlayerBadges: jest.fn(),
    getPlayerRewards: jest.fn(),
    claimReward: jest.fn(),
    checkAndUpdateAchievements: jest.fn(),
    createAchievement: jest.fn(),
    createBadge: jest.fn(),
  },
}));

import { achievementService } from '../../services/achievementService';
import achievementsRouter from '../achievements';

const app = express();
app.use(express.json());
app.use('/achievements', achievementsRouter);

const SERVICE = achievementService as jest.Mocked<typeof achievementService>;

const validTriggerBody = {
  playerId: '11111111-1111-1111-1111-111111111111',
  trigger: { type: 'MATCH_WIN', source: 'test' },
};

const validAchievementBody = {
  name: 'First Win',
  description: 'Win your very first match',
  category: 'MATCH_PLAYING',
  triggerType: 'MATCH_WIN',
  triggerValue: { threshold: 1 },
};

const validBadgeBody = {
  name: 'Gold Badge',
  description: 'Awarded for exceptional play',
  icon: 'gold.svg',
};

describe('Achievements Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /achievements', () => {
    it('returns all active achievements', async () => {
      SERVICE.getActiveAchievements.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);

      const res = await request(app).get('/achievements').expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
      expect(SERVICE.getActiveAchievements).toHaveBeenCalled();
      expect(SERVICE.getAchievementsByCategory).not.toHaveBeenCalled();
    });

    it('filters by category when provided', async () => {
      SERVICE.getAchievementsByCategory.mockResolvedValue([{ id: 'a1' }]);

      const res = await request(app).get('/achievements?category=SOCIAL').expect(200);

      expect(res.body.count).toBe(1);
      expect(SERVICE.getAchievementsByCategory).toHaveBeenCalledWith('SOCIAL');
    });

    it('returns 500 when the service fails', async () => {
      SERVICE.getActiveAchievements.mockRejectedValue(new Error('boom'));
      const res = await request(app).get('/achievements').expect(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('boom');
    });
  });

  describe('GET /achievements/player/:playerId', () => {
    it('returns achievements and badges with totals', async () => {
      SERVICE.getPlayerAchievements.mockResolvedValue([{ id: 'a1' }]);
      SERVICE.getPlayerBadges.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);

      const res = await request(app).get('/achievements/player/p1').expect(200);

      expect(res.body.data.totalAchievements).toBe(1);
      expect(res.body.data.totalBadges).toBe(2);
    });

    it('returns 500 when the service fails', async () => {
      SERVICE.getPlayerAchievements.mockRejectedValue(new Error('boom'));
      await request(app).get('/achievements/player/p1').expect(500);
    });
  });

  describe('GET /achievements/player/:playerId/badges', () => {
    it('returns the player badges', async () => {
      SERVICE.getPlayerBadges.mockResolvedValue([{ id: 'b1' }]);
      const res = await request(app).get('/achievements/player/p1/badges').expect(200);
      expect(res.body.count).toBe(1);
    });

    it('returns 500 when the service fails', async () => {
      SERVICE.getPlayerBadges.mockRejectedValue(new Error('boom'));
      await request(app).get('/achievements/player/p1/badges').expect(500);
    });
  });

  describe('GET /achievements/player/:playerId/rewards', () => {
    it('returns the player rewards', async () => {
      SERVICE.getPlayerRewards.mockResolvedValue([{ id: 'r1' }]);
      const res = await request(app).get('/achievements/player/p1/rewards').expect(200);
      expect(res.body.count).toBe(1);
    });

    it('returns 500 when the service fails', async () => {
      SERVICE.getPlayerRewards.mockRejectedValue(new Error('boom'));
      await request(app).get('/achievements/player/p1/rewards').expect(500);
    });
  });

  describe('POST /achievements/player/:playerId/rewards/:rewardId/claim', () => {
    it('claims a reward successfully', async () => {
      SERVICE.claimReward.mockResolvedValue(true);

      const res = await request(app).post('/achievements/player/p1/rewards/r1/claim').expect(200);

      expect(res.body.success).toBe(true);
      expect(SERVICE.claimReward).toHaveBeenCalledWith('p1', 'r1');
    });

    it('returns 400 when the reward cannot be claimed', async () => {
      SERVICE.claimReward.mockResolvedValue(false);

      const res = await request(app).post('/achievements/player/p1/rewards/r1/claim').expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already claimed|not found/i);
    });

    it('returns 500 when the service fails', async () => {
      SERVICE.claimReward.mockRejectedValue(new Error('boom'));
      await request(app).post('/achievements/player/p1/rewards/r1/claim').expect(500);
    });
  });

  describe('POST /achievements/trigger', () => {
    it('processes the trigger and returns update count', async () => {
      SERVICE.checkAndUpdateAchievements.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);

      const res = await request(app).post('/achievements/trigger').send(validTriggerBody).expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.message).toMatch(/2 achievement/);
      expect(SERVICE.checkAndUpdateAchievements).toHaveBeenCalledWith(
        validTriggerBody.playerId,
        validTriggerBody.trigger
      );
    });

    it('returns 400 for an invalid trigger payload', async () => {
      const res = await request(app)
        .post('/achievements/trigger')
        .send({ playerId: 'not-a-uuid', trigger: { type: 'NOPE', source: 'x' } })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(SERVICE.checkAndUpdateAchievements).not.toHaveBeenCalled();
    });

    it('returns 500 when the service fails', async () => {
      SERVICE.checkAndUpdateAchievements.mockRejectedValue(new Error('boom'));
      await request(app).post('/achievements/trigger').send(validTriggerBody).expect(500);
    });
  });

  describe('POST /achievements', () => {
    it('creates an achievement with valid input', async () => {
      SERVICE.createAchievement.mockResolvedValue({ id: 'a1', ...validAchievementBody });

      const res = await request(app).post('/achievements').send(validAchievementBody).expect(201);

      expect(res.body.success).toBe(true);
      expect(SERVICE.createAchievement).toHaveBeenCalledWith(expect.objectContaining({ name: 'First Win' }));
    });

    it('returns 400 for invalid input', async () => {
      const res = await request(app)
        .post('/achievements')
        .send({ name: 'x', description: 'short', category: 'NOPE', triggerType: 'NOPE', triggerValue: {} })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(SERVICE.createAchievement).not.toHaveBeenCalled();
    });

    it('returns 500 when the service fails', async () => {
      SERVICE.createAchievement.mockRejectedValue(new Error('boom'));
      await request(app).post('/achievements').send(validAchievementBody).expect(500);
    });
  });

  describe('POST /achievements/badges', () => {
    it('creates a badge with valid input', async () => {
      SERVICE.createBadge.mockResolvedValue({ id: 'b1', ...validBadgeBody });

      const res = await request(app).post('/achievements/badges').send(validBadgeBody).expect(201);

      expect(res.body.success).toBe(true);
      expect(SERVICE.createBadge).toHaveBeenCalledWith(expect.objectContaining({ name: 'Gold Badge' }));
    });

    it('returns 400 for invalid input', async () => {
      const res = await request(app).post('/achievements/badges').send({ name: 'x' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(SERVICE.createBadge).not.toHaveBeenCalled();
    });

    it('returns 500 when the service fails', async () => {
      SERVICE.createBadge.mockRejectedValue(new Error('boom'));
      await request(app).post('/achievements/badges').send(validBadgeBody).expect(500);
    });
  });
});
