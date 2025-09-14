import { Router } from 'express';
import { challengesService } from '../services/challengesService';
import { validate } from '../utils/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createChallengeSchema = Joi.object({
  challengedId: Joi.string().uuid().required(),
  challengeType: Joi.string().valid('MATCH', 'TOURNAMENT', 'PRACTICE', 'FRIENDLY').optional(),
  message: Joi.string().max(500).optional(),
  sessionId: Joi.string().uuid().optional(),
  matchFormat: Joi.string().valid('SINGLES', 'DOUBLES').optional(),
  scoringSystem: Joi.string().valid('21_POINT', '15_POINT', '11_POINT').optional(),
  bestOfGames: Joi.number().integer().min(1).max(5).optional(),
  scheduledAt: Joi.date().iso().optional()
});

const respondToChallengeSchema = Joi.object({
  challengeId: Joi.string().uuid().required(),
  accept: Joi.boolean().required()
});

/**
 * @route POST /api/challenges
 * @desc Create a new challenge
 * @access Private
 */
router.post('/', validate(createChallengeSchema), async (req, res) => {
  try {
    const challengeData = req.body;
    const challengerId = 'player-123'; // Mock user ID for MVP

    const challenge = await challengesService.createChallenge({
      challengerId,
      ...challengeData
    });

    res.status(201).json({
      success: true,
      data: challenge,
      message: 'Challenge sent successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create challenge'
    });
  }
});

/**
 * @route POST /api/challenges/respond
 * @desc Respond to a challenge
 * @access Private
 */
router.post('/respond', validate(respondToChallengeSchema), async (req, res) => {
  try {
    const { challengeId, accept } = req.body;
    const userId = 'player-123'; // Mock user ID for MVP

    const response = await challengesService.respondToChallenge(challengeId, userId, accept);

    res.json({
      success: true,
      data: response,
      message: accept ? 'Challenge accepted' : 'Challenge declined'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to respond to challenge'
    });
  }
});

/**
 * @route GET /api/challenges
 * @desc Get user's challenges
 * @access Private
 */
router.get('/', async (req, res) => {
  try {
    const userId = 'player-123'; // Mock user ID for MVP
    const type = (req.query.type as 'sent' | 'received' | 'all') || 'all';

    const challenges = await challengesService.getUserChallenges(userId, type);

    res.json({
      success: true,
      data: challenges,
      count: challenges.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch challenges'
    });
  }
});

/**
 * @route GET /api/challenges/active
 * @desc Get active challenges (pending or accepted)
 * @access Private
 */
router.get('/active', async (req, res) => {
  try {
    const userId = 'player-123'; // Mock user ID for MVP

    const challenges = await challengesService.getActiveChallenges(userId);

    res.json({
      success: true,
      data: challenges,
      count: challenges.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active challenges'
    });
  }
});

/**
 * @route DELETE /api/challenges/:challengeId
 * @desc Cancel a challenge
 * @access Private
 */
router.delete('/:challengeId', async (req, res) => {
  try {
    const { challengeId } = req.params;
    const userId = 'player-123'; // Mock user ID for MVP

    const result = await challengesService.cancelChallenge(challengeId, userId);

    res.json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to cancel challenge'
    });
  }
});

/**
 * @route POST /api/challenges/:challengeId/complete
 * @desc Mark challenge as completed
 * @access Private
 */
router.post('/:challengeId/complete', async (req, res) => {
  try {
    const { challengeId } = req.params;

    const result = await challengesService.completeChallenge(challengeId);

    res.json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to complete challenge'
    });
  }
});

/**
 * @route GET /api/challenges/stats
 * @desc Get challenge statistics
 * @access Private
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = 'player-123'; // Mock user ID for MVP

    const stats = await challengesService.getChallengeStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch challenge statistics'
    });
  }
});

/**
 * @route GET /api/challenges/pending/count
 * @desc Get pending challenges count
 * @access Private
 */
router.get('/pending/count', async (req, res) => {
  try {
    const userId = 'player-123'; // Mock user ID for MVP

    const count = await challengesService.getPendingChallengesCount(userId);

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending challenges count'
    });
  }
});

export default router;