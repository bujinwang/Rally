import { Router } from 'express';
import { rankingService } from '../services/rankingService';

const router = Router();

/**
 * @route GET /api/rankings/player/:playerId/history
 * @desc Get ranking history for a specific player
 * @access Public
 */
router.get('/player/:playerId/history', async (req, res) => {
  try {
    const { playerId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const history = await rankingService.getPlayerRankingHistory(playerId, limit);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error fetching ranking history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ranking history'
    });
  }
});

/**
 * @route GET /api/rankings/session/:sessionId
 * @desc Get current rankings for a session
 * @access Public
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const minMatches = parseInt(req.query.minMatches as string) || 0;

    // Get players ordered by ranking points
    const players = await rankingService.getSessionRankings(sessionId, minMatches);

    res.json({
      success: true,
      data: players
    });
  } catch (error) {
    console.error('Error fetching session rankings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session rankings'
    });
  }
});

/**
 * @route GET /api/rankings/global
 * @desc Get global rankings across all sessions
 * @access Public
 */
router.get('/global', async (req, res) => {
  try {
    const minMatches = parseInt(req.query.minMatches as string) || 5;
    const limit = parseInt(req.query.limit as string) || 100;

    const rankings = await rankingService.getGlobalRankings(minMatches, limit);

    res.json({
      success: true,
      data: rankings
    });
  } catch (error) {
    console.error('Error fetching global rankings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch global rankings'
    });
  }
});

/**
 * @route POST /api/rankings/update/:matchId
 * @desc Update rankings after a match (internal use)
 * @access Private
 */
router.post('/update/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;

    const updates = await rankingService.updateRankingsAfterDetailedMatch(matchId);

    res.json({
      success: true,
      data: updates,
      message: `Updated rankings for ${updates.length} players`
    });
  } catch (error) {
    console.error('Error updating rankings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update rankings'
    });
  }
});

/**
 * @route POST /api/rankings/decay
 * @desc Apply weekly decay to inactive players (admin/cron job)
 * @access Private
 */
router.post('/decay', async (req, res) => {
  try {
    await rankingService.applyWeeklyDecay();

    res.json({
      success: true,
      message: 'Weekly decay applied successfully'
    });
  } catch (error) {
    console.error('Error applying weekly decay:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to apply weekly decay'
    });
  }
});

/**
 * @route POST /api/rankings/initialize/:playerId
 * @desc Initialize ranking for a new player
 * @access Private
 */
router.post('/initialize/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;

    await rankingService.initializePlayerRanking(playerId);

    res.json({
      success: true,
      message: 'Player ranking initialized successfully'
    });
  } catch (error) {
    console.error('Error initializing player ranking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize player ranking'
    });
  }
});

export default router;