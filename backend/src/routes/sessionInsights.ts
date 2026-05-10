import { Router, Request, Response } from 'express';
import {
  getSessionSmartInsights,
  getSessionPlayerRatings,
  findMostBalancedTeams,
  generatePlayerInsights,
} from '../services/smartInsightsService';
import { prisma } from '../config/database';

const router = Router();

/**
 * GET /session-insights/:sessionId
 * Returns AI-powered insights for a session:
 * - ELO ratings for all players
 * - Most balanced next teams
 * - Court optimization
 * - Session-level suggestions
 */
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const insights = await getSessionSmartInsights(sessionId);
    const ratings = await getSessionPlayerRatings(sessionId);

    res.json({
      success: true,
      data: { insights, ratings },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Session insights error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get insights' },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /session-insights/player/:sessionId/:playerName
 * Returns personalized player insights.
 */
router.get('/player/:sessionId/:playerName', async (req: Request, res: Response) => {
  try {
    const { sessionId, playerName } = req.params;

    const player = await prisma.mvpPlayer.findFirst({
      where: { sessionId, name: playerName },
    });

    if (!player) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Player not found' },
      });
    }

    const ratings = await getSessionPlayerRatings(sessionId);
    const partnershipStats = (player.partnershipStats as Record<string, any>) || {};
    const insights = generatePlayerInsights(playerName, ratings, partnershipStats);

    res.json({
      success: true,
      data: { playerName, insights },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Player insights error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get player insights' },
    });
  }
});

/**
 * GET /session-insights/balanced-teams/:sessionId
 * Quick endpoint: returns the best balanced team arrangement right now.
 */
router.get('/balanced-teams/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const ratings = await getSessionPlayerRatings(sessionId);

    const activePlayers = ratings.filter(r => r.gamesPlayed >= 0);
    const balanced = findMostBalancedTeams(activePlayers, []);

    res.json({
      success: true,
      data: { balanced, playerCount: activePlayers.length },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Balanced teams error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to balance teams' },
    });
  }
});

export default router;
