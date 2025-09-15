import { Router, Request, Response } from 'express';
import { SimpleMatchScheduler, CreateSimpleMatchData } from '../services/simpleMatchScheduler';
import { authenticateToken, requireRole } from '../middleware/auth';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string | null;
    role: string;
  };
}

const router = Router();

// POST /api/match-scheduling - Create a scheduled match
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const {
      sessionId,
      title,
      description,
      scheduledAt,
      duration,
      location,
      courtName,
      player1Id,
      player2Id,
      matchType,
      createdBy
    }: CreateSimpleMatchData = req.body;

    // Validate required fields
    if (!sessionId || !title || !scheduledAt || !player1Id || !matchType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields: sessionId, title, scheduledAt, player1Id, matchType'
        }
      });
    }

    // Validate scheduled time is in the future
    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Scheduled time must be in the future'
        }
      });
    }

    // Validate match type
    if (!['SINGLES', 'DOUBLES'].includes(matchType)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid match type. Must be SINGLES or DOUBLES'
        }
      });
    }

    // Check for basic conflicts
    const playerIds = [player1Id, player2Id].filter((id): id is string => id !== undefined);
    const hasConflict = await SimpleMatchScheduler.checkBasicConflicts(
      sessionId,
      scheduledDate,
      courtName,
      playerIds
    );

    if (hasConflict) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'SCHEDULE_CONFLICT',
          message: 'Schedule conflict detected. Please choose a different time or court.'
        }
      });
    }

    const matchData: CreateSimpleMatchData = {
      sessionId,
      title,
      description,
      scheduledAt: scheduledDate,
      duration,
      location,
      courtName,
      player1Id,
      player2Id,
      matchType,
      createdBy: createdBy || req.user?.id || 'system'
    };

    const scheduledMatch = await SimpleMatchScheduler.createScheduledMatch(matchData);

    res.status(201).json({
      success: true,
      data: scheduledMatch,
      message: 'Match scheduled successfully'
    });

  } catch (error) {
    console.error('Error scheduling match:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to schedule match'
      }
    });
  }
});

// GET /api/match-scheduling/session/:sessionId - Get scheduled matches for a session
router.get('/session/:sessionId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.params;

    const matches = await SimpleMatchScheduler.getScheduledMatchesForSession(sessionId);

    res.json({
      success: true,
      data: {
        matches,
        total: matches.length
      }
    });

  } catch (error) {
    console.error('Error fetching scheduled matches:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch scheduled matches'
      }
    });
  }
});

// GET /api/match-scheduling/player/:playerId - Get scheduled matches for a player
router.get('/player/:playerId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    const matches = await SimpleMatchScheduler.getScheduledMatchesForPlayer(playerId);

    res.json({
      success: true,
      data: {
        matches,
        total: matches.length
      }
    });

  } catch (error) {
    console.error('Error fetching player matches:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch player matches'
      }
    });
  }
});

// PUT /api/match-scheduling/:matchId/cancel - Cancel a scheduled match
router.put('/:matchId/cancel', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { matchId } = req.params;
    const { cancelledBy } = req.body;

    const cancelledMatch = await SimpleMatchScheduler.cancelScheduledMatch(
      matchId,
      cancelledBy || req.user?.id || 'system'
    );

    res.json({
      success: true,
      data: cancelledMatch,
      message: 'Match cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling match:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to cancel match'
      }
    });
  }
});

// GET /api/match-scheduling/upcoming - Get upcoming matches for the current user
router.get('/upcoming', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'User authentication required'
        }
      });
    }

    // For now, return empty array since we're using MVP models
    // In a real implementation, this would fetch upcoming matches
    const upcomingMatches: any[] = [];

    res.json({
      success: true,
      data: {
        matches: upcomingMatches,
        total: upcomingMatches.length
      }
    });

  } catch (error) {
    console.error('Error fetching upcoming matches:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch upcoming matches'
      }
    });
  }
});

export default router;