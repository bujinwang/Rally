import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  calculateSessionCost,
  updateSessionCostSettings,
  recordGameBirdies,
  CostModel,
  BirdieProvider,
} from '../services/costSharingService';

const router = Router();

/**
 * GET /session-costs/:sessionId
 * Full cost breakdown for a session.
 */
router.get('/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const breakdown = await calculateSessionCost(sessionId);

    res.json({
      success: true,
      data: breakdown,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cost breakdown error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to calculate costs' },
    });
  }
});

/**
 * PUT /session-costs/:sessionId
 * Update cost settings for a session.
 */
const updateCostValidation = [
  param('sessionId').isString(),
  body('costModel').optional().isIn(['SPLIT_EVENLY', 'PER_PLAYER', 'BYOB', 'ORGANIZER_COVERS', 'PER_COURT']),
  body('cost').optional().isFloat({ min: 0 }),
  body('birdieCostPerTube').optional().isFloat({ min: 0 }),
  body('birdieTubesOpened').optional().isInt({ min: 0 }),
  body('birdieProvidedBy').optional().isIn(['ORGANIZER', 'PLAYERS_BRING_OWN', 'INCLUDED_IN_COST']),
];

router.put('/:sessionId', updateCostValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: errors.array() },
      });
    }

    const { sessionId } = req.params;
    const settings: any = {};

    if (req.body.costModel !== undefined) settings.costModel = req.body.costModel as CostModel;
    if (req.body.cost !== undefined) settings.cost = req.body.cost;
    if (req.body.birdieCostPerTube !== undefined) settings.birdieCostPerTube = req.body.birdieCostPerTube;
    if (req.body.birdieTubesOpened !== undefined) settings.birdieTubesOpened = req.body.birdieTubesOpened;
    if (req.body.birdieProvidedBy !== undefined) settings.birdieProvidedBy = req.body.birdieProvidedBy as BirdieProvider;

    const breakdown = await updateSessionCostSettings(sessionId, settings);

    res.json({
      success: true,
      data: breakdown,
      message: 'Cost settings updated',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Update cost error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update costs' },
    });
  }
});

/**
 * POST /session-costs/game/:gameId/birdies
 * Record birdies used in a specific game.
 */
const recordBirdiesValidation = [
  param('gameId').isString(),
  body('birdiesUsed').isInt({ min: 0, max: 24 }).withMessage('Birdies used must be 0-24'),
];

router.post('/game/:gameId/birdies', recordBirdiesValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: errors.array() },
      });
    }

    const { gameId } = req.params;
    const { birdiesUsed } = req.body;

    await recordGameBirdies(gameId, birdiesUsed);

    res.json({
      success: true,
      data: { gameId, birdiesUsed },
      message: `${birdiesUsed} birdies recorded for game`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Record birdies error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to record birdies' },
    });
  }
});

export default router;
