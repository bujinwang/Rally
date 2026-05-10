import { Router, Request, Response } from 'express';
import { statisticsService } from '../services/statisticsService';

const router = Router();

/**
 * GET /api/statistics/player/:playerId
 * Get comprehensive statistics for a specific player
 */
router.get('/player/:playerId', async (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
    const { sessionId, timeRange, minMatches } = req.query;

    const filters = {
      sessionId: sessionId as string,
      timeRange: timeRange as 'all' | 'week' | 'month' | 'session',
      minMatches: minMatches ? parseInt(minMatches as string) : undefined,
    };

    const stats = await statisticsService.getPlayerStatistics(playerId, filters);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAYER_NOT_FOUND',
          message: 'Player not found or has no matches'
        }
      });
    }

    res.json({
      success: true,
      data: stats,
      message: 'Player statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching player statistics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch player statistics'
      }
    });
  }
});

/**
 * GET /api/statistics/leaderboard
 * Get leaderboard rankings
 */
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const { sessionId, minMatches, limit } = req.query;

    const filters = {
      sessionId: sessionId as string,
      minMatches: minMatches ? parseInt(minMatches as string) : 1,
    };

    const leaderboard = await statisticsService.getLeaderboard(filters);

    // Apply limit if specified
    const limitedLeaderboard = limit
      ? leaderboard.slice(0, parseInt(limit as string))
      : leaderboard;

    res.json({
      success: true,
      data: limitedLeaderboard,
      message: 'Leaderboard retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch leaderboard'
      }
    });
  }
});

/**
 * GET /api/statistics/session/:sessionId
 * Get statistics for a specific session
 */
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const sessionStats = await statisticsService.getSessionStatistics(sessionId);

    if (!sessionStats) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        }
      });
    }

    res.json({
      success: true,
      data: sessionStats,
      message: 'Session statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching session statistics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch session statistics'
      }
    });
  }
});

/**
 * GET /api/statistics/compare
 * Compare multiple players' statistics
 */
router.get('/compare', async (req: Request, res: Response) => {
  try {
    const { playerIds, sessionId, timeRange } = req.query;

    if (!playerIds) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'playerIds parameter is required'
        }
      });
    }

    const playerIdsArray = Array.isArray(playerIds)
      ? playerIds as string[]
      : (playerIds as string).split(',');

    const filters = {
      sessionId: sessionId as string,
      timeRange: timeRange as 'all' | 'week' | 'month' | 'session',
    };

    const comparison = await statisticsService.getPlayerComparison(playerIdsArray, filters);

    res.json({
      success: true,
      data: comparison,
      message: 'Player comparison retrieved successfully'
    });
  } catch (error) {
    console.error('Error comparing players:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to compare players'
      }
    });
  }
});

/**
 * GET /api/statistics/trends/:playerId
 * Get performance trends for a player
 */
router.get('/trends/:playerId', async (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
    const { days } = req.query;

    const daysNum = days ? parseInt(days as string) : 30;

    const trends = await statisticsService.getPerformanceTrends(playerId, daysNum);

    res.json({
      success: true,
      data: trends,
      message: 'Performance trends retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching performance trends:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch performance trends'
      }
    });
  }
});

/**
 * GET /api/statistics/player/:playerId/streaks
 * Get win/loss streaks for a player
 */
router.get('/player/:playerId/streaks', async (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;

    const streaks = await statisticsService.getPlayerStreaks(playerId);

    res.json({
      success: true,
      data: streaks,
      message: 'Player streaks retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching streaks:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch streaks' }
    });
  }
});

/**
 * GET /api/statistics/player/:playerId/percentiles
 * Get percentile rankings for a player
 */
router.get('/player/:playerId/percentiles', async (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;

    const percentiles = await statisticsService.getPlayerPercentiles(playerId);

    res.json({
      success: true,
      data: percentiles,
      message: 'Player percentiles retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching percentiles:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch percentiles' }
    });
  }
});

/**
 * GET /api/statistics/session/:sessionId/heatmap
 * Get court usage heatmap data for a session
 */
router.get('/session/:sessionId/heatmap', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const heatmap = await statisticsService.getSessionHeatmap(sessionId);

    res.json({
      success: true,
      data: heatmap,
      message: 'Session heatmap retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching heatmap:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch heatmap' }
    });
  }
});

/**
 * GET /api/statistics/head-to-head
 * Compare two players head-to-head
 */
router.get('/head-to-head', async (req: Request, res: Response) => {
  try {
    const { player1Id, player2Id } = req.query;

    if (!player1Id || !player2Id) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'player1Id and player2Id required' }
      });
    }

    const h2h = await statisticsService.getHeadToHead(
      player1Id as string,
      player2Id as string
    );

    res.json({
      success: true,
      data: h2h,
      message: 'Head-to-head stats retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching head-to-head:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch head-to-head stats' }
    });
  }
});

export default router;