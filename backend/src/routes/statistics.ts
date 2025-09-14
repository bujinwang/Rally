import { Router, Request, Response } from 'express';
import { statisticsService } from '../services/statisticsService';

const router = Router();

// GET /api/statistics/player/:playerId - Get player statistics
router.get('/player/:playerId', async (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
    const { sessionId, timeRange, minMatches } = req.query;

    const filters = {
      sessionId: sessionId as string,
      timeRange: timeRange as 'all' | 'week' | 'month' | 'session',
      minMatches: minMatches ? parseInt(minMatches as string) : undefined
    };

    const statistics = await statisticsService.getPlayerStatistics(playerId, filters);

    if (!statistics) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAYER_NOT_FOUND',
          message: 'Player not found'
        }
      });
    }

    res.json({
      success: true,
      data: statistics
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

// GET /api/statistics/leaderboard - Get leaderboard
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const { sessionId, timeRange, minMatches, limit } = req.query;

    const filters = {
      sessionId: sessionId as string,
      timeRange: timeRange as 'all' | 'week' | 'month' | 'session',
      minMatches: minMatches ? parseInt(minMatches as string) : undefined
    };

    const leaderboard = await statisticsService.getLeaderboard(filters);
    const limitNum = limit ? parseInt(limit as string) : 10;
    const limitedLeaderboard = leaderboard.slice(0, limitNum);

    res.json({
      success: true,
      data: {
        leaderboard: limitedLeaderboard,
        total: leaderboard.length
      }
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

// GET /api/statistics/session/:sessionId - Get session statistics
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const statistics = await statisticsService.getSessionStatistics(sessionId);

    if (!statistics) {
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
      data: statistics
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

// GET /api/statistics/compare - Compare multiple players
router.get('/compare', async (req: Request, res: Response) => {
  try {
    const { playerIds, sessionId, timeRange } = req.query;

    if (!playerIds || typeof playerIds !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'playerIds parameter is required'
        }
      });
    }

    const playerIdArray = playerIds.split(',');

    if (playerIdArray.length < 2 || playerIdArray.length > 5) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Must compare between 2 and 5 players'
        }
      });
    }

    const filters = {
      sessionId: sessionId as string,
      timeRange: timeRange as 'all' | 'week' | 'month' | 'session'
    };

    const comparison = await statisticsService.getPlayerComparison(playerIdArray, filters);

    res.json({
      success: true,
      data: {
        players: comparison,
        comparison: {
          totalPlayers: comparison.length,
          averageWinRate: comparison.reduce((sum, p) => sum + p.winRate, 0) / comparison.length,
          highestWinRate: Math.max(...comparison.map(p => p.winRate)),
          lowestWinRate: Math.min(...comparison.map(p => p.winRate))
        }
      }
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

// GET /api/statistics/trends/:playerId - Get performance trends
router.get('/trends/:playerId', async (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
    const { days } = req.query;

    const daysNum = days ? parseInt(days as string) : 30;

    if (daysNum < 1 || daysNum > 365) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Days must be between 1 and 365'
        }
      });
    }

    const trends = await statisticsService.getPerformanceTrends(playerId, daysNum);

    res.json({
      success: true,
      data: {
        playerId,
        period: `${daysNum} days`,
        trends
      }
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

export default router;