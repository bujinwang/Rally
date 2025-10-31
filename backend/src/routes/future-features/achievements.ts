import { Router } from 'express';
import { achievementService } from '../services/achievementService';
import { validate } from '../utils/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const achievementTriggerSchema = Joi.object({
  playerId: Joi.string().uuid().required(),
  trigger: Joi.object({
    type: Joi.string().valid(
      'MATCH_WIN', 'MATCH_PLAY', 'TOURNAMENT_WIN', 'TOURNAMENT_PARTICIPATE',
      'STREAK', 'PERFECT_GAME', 'SOCIAL_FRIEND', 'SESSION_HOST',
      'SKILL_LEVEL', 'TIME_PLAYED', 'CUSTOM'
    ).required(),
    source: Joi.string().required(),
    data: Joi.object().optional()
  }).required()
});

const createAchievementSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  description: Joi.string().min(10).max(500).required(),
  category: Joi.string().valid('MATCH_PLAYING', 'TOURNAMENT', 'SOCIAL', 'PROGRESSION', 'SPECIAL').required(),
  triggerType: Joi.string().valid(
    'MATCH_WIN', 'MATCH_PLAY', 'TOURNAMENT_WIN', 'TOURNAMENT_PARTICIPATE',
    'STREAK', 'PERFECT_GAME', 'SOCIAL_FRIEND', 'SESSION_HOST',
    'SKILL_LEVEL', 'TIME_PLAYED', 'CUSTOM'
  ).required(),
  triggerValue: Joi.object().required(),
  points: Joi.number().integer().min(0).max(1000).optional(),
  badgeId: Joi.string().uuid().optional(),
  rarity: Joi.string().valid('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY').optional(),
  maxProgress: Joi.number().integer().min(1).max(10000).optional()
});

const createBadgeSchema = Joi.object({
  name: Joi.string().min(3).max(50).required(),
  description: Joi.string().min(10).max(200).required(),
  icon: Joi.string().required(),
  color: Joi.string().optional(),
  rarity: Joi.string().valid('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY').optional()
});

/**
 * @route GET /api/achievements
 * @desc Get all active achievements
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;

    let achievements;
    if (category && typeof category === 'string') {
      achievements = await achievementService.getAchievementsByCategory(category as any);
    } else {
      achievements = await achievementService.getActiveAchievements();
    }

    res.json({
      success: true,
      data: achievements,
      count: achievements.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch achievements',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route GET /api/achievements/player/:playerId
 * @desc Get player achievements
 * @access Private (requires player authentication)
 */
router.get('/player/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;

    const achievements = await achievementService.getPlayerAchievements(playerId);
    const badges = await achievementService.getPlayerBadges(playerId);

    res.json({
      success: true,
      data: {
        achievements,
        badges,
        totalAchievements: achievements.length,
        totalBadges: badges.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch player achievements',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route GET /api/achievements/player/:playerId/badges
 * @desc Get player badges
 * @access Private (requires player authentication)
 */
router.get('/player/:playerId/badges', async (req, res) => {
  try {
    const { playerId } = req.params;

    const badges = await achievementService.getPlayerBadges(playerId);

    res.json({
      success: true,
      data: badges,
      count: badges.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch player badges',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route GET /api/achievements/player/:playerId/rewards
 * @desc Get player rewards
 * @access Private (requires player authentication)
 */
router.get('/player/:playerId/rewards', async (req, res) => {
  try {
    const { playerId } = req.params;

    const rewards = await achievementService.getPlayerRewards(playerId);

    res.json({
      success: true,
      data: rewards,
      count: rewards.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch player rewards',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route POST /api/achievements/player/:playerId/rewards/:rewardId/claim
 * @desc Claim a reward
 * @access Private (requires player authentication)
 */
router.post('/player/:playerId/rewards/:rewardId/claim', async (req, res) => {
  try {
    const { playerId, rewardId } = req.params;

    const success = await achievementService.claimReward(playerId, rewardId);

    if (!success) {
      return res.status(400).json({
        success: false,
        message: 'Reward not found or already claimed',
      });
    }

    res.json({
      success: true,
      message: 'Reward claimed successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to claim reward',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route POST /api/achievements/trigger
 * @desc Check and update achievements based on trigger
 * @access Private (requires player authentication)
 */
router.post('/trigger', validate(achievementTriggerSchema), async (req, res) => {
  try {
    const { playerId, trigger } = req.body;

    const progressUpdates = await achievementService.checkAndUpdateAchievements(playerId, trigger);

    res.json({
      success: true,
      data: progressUpdates,
      message: `Processed ${progressUpdates.length} achievement updates`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to process achievement trigger',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route POST /api/achievements
 * @desc Create a new achievement (admin only)
 * @access Private (admin only)
 */
router.post('/', validate(createAchievementSchema), async (req, res) => {
  try {
    const achievement = await achievementService.createAchievement(req.body);

    res.status(201).json({
      success: true,
      data: achievement,
      message: 'Achievement created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create achievement',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route POST /api/achievements/badges
 * @desc Create a new badge (admin only)
 * @access Private (admin only)
 */
router.post('/badges', validate(createBadgeSchema), async (req, res) => {
  try {
    const badge = await achievementService.createBadge(req.body);

    res.status(201).json({
      success: true,
      data: badge,
      message: 'Badge created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create badge',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;