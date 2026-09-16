import { Router, Request, Response } from 'express';
import { CommunityService } from '../services/communityService';
import { authenticateToken, requireRole, optionalAuth } from '../middleware/auth';
import { resolveIdentity } from '../middleware/permissions';
import { validate } from '../utils/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const leaderboardQuerySchema = Joi.object({
  sortBy: Joi.string().valid('winRate', 'matchWinRate', 'wins', 'gamesPlayed').default('winRate'),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0)
});

const venueQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0)
});

// Story 6.8 (D4) — NPS body schema. `score` is the 0-10 NPS scale, deliberately
// distinct from CSAT's 1-5 `TournamentFeedback.rating`.
const npsSchema = Joi.object({
  score: Joi.number().integer().min(0).max(10).required(),
  comment: Joi.string().max(2000).allow('').optional(),
  deviceId: Joi.string().max(200).optional()
});

/**
 * GET /api/v1/community/leaderboard
 * Global community leaderboard across all sessions
 */
router.get('/leaderboard', validate(leaderboardQuerySchema), async (req: Request, res: Response) => {
  try {
    const { sortBy, limit, offset } = req.query;
    const validSortBy = ['winRate', 'matchWinRate', 'wins', 'gamesPlayed'].includes(sortBy as string) 
      ? sortBy as 'winRate' | 'matchWinRate' | 'wins' | 'gamesPlayed' 
      : 'winRate';

    const [leaderboard, totalCount] = await Promise.all([
      CommunityService.getCommunityLeaderboard(
        validSortBy,
        Number(limit),
        Number(offset)
      ),
      CommunityService.getCommunityLeaderboardCount()
    ]);

    res.json({
      success: true,
      data: { leaderboard, totalCount },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Community leaderboard error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch leaderboard' },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/community/trending
 * Trending sessions (upcoming, most popular)
 */
router.get('/trending', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    const trending = await CommunityService.getTrendingSessions(limit);

    res.json({
      success: true,
      data: { sessions: trending },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Trending sessions error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch trending sessions' },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/community/nearby
 * Nearby active players
 */
router.get('/nearby', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 50);

    const players = await CommunityService.getNearbyPlayers(limit);

    res.json({
      success: true,
      data: { players },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Nearby players error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch nearby players' },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/community/venues
 * Venue directory
 */
router.get('/venues', validate(venueQuerySchema), async (req: Request, res: Response) => {
  try {
    const { limit, offset } = req.query;

    const result = await CommunityService.getVenueDirectory(
      Number(limit),
      Number(offset)
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Venue directory error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch venue directory' },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/v1/community/nps
 * Submit a platform-level NPS response (0-10). Device or account identity.
 * Story 6.8 (D4) — this is NOT CSAT; see `TournamentFeedback` for the 1-5 scale.
 */
router.post('/nps', optionalAuth, validate(npsSchema), async (req: Request, res: Response) => {
  try {
    const { score, comment } = req.body as { score: number; comment?: string };
    const identity = resolveIdentity(req);

    if (identity.source === 'anonymous') {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'A user or device identity is required to submit NPS' },
        timestamp: new Date().toISOString()
      });
    }

    const created = await CommunityService.createNpsResponse(
      { score: Number(score), comment },
      { userId: identity.userId, deviceId: identity.deviceId }
    );

    res.status(201).json({
      success: true,
      data: created,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('NPS submit error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to submit NPS response' },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/community/nps/summary
 * Aggregated NPS (admin only): promoters / passives / detractors + score.
 * Story 6.8 (D4).
 */
router.get('/nps/summary', authenticateToken, requireRole(['ADMIN']), async (_req: Request, res: Response) => {
  try {
    const summary = await CommunityService.getNpsSummary();

    res.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('NPS summary error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch NPS summary' },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
