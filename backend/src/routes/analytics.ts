import { Router } from 'express';
import { AnalyticsService } from '../services/analyticsService';
import { DatabaseUtils } from '../utils/databaseUtils';
import { validate, analyticsExportSchema, analyticsQuerySchema } from '../utils/validation';
import { createRateLimiters } from '../middleware/rateLimit';

const router = Router();

// Initialize rate limiters for analytics endpoints
const { api: analyticsRateLimit, sensitive: exportRateLimit } = createRateLimiters();

// Apply rate limiting to all analytics routes
router.use(analyticsRateLimit);

/**
 * @route GET /api/analytics/player/:playerId
 * @desc Get player analytics
 * @access Public (for MVP)
 */
router.get('/player/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;

    // Get player analytics
    const analyticsQuery = `
      SELECT pa.*, p.name as player_name
      FROM player_analytics pa
      JOIN mvp_players p ON pa.player_id = p.id
      WHERE pa.player_id = $1
    `;
    const analyticsResult = await DatabaseUtils.executeRawQuery(analyticsQuery, [playerId]);

    if (analyticsResult.length === 0) {
      // Try to calculate analytics if not found
      await AnalyticsService.updatePlayerAnalytics(playerId);
      const updatedResult = await DatabaseUtils.executeRawQuery(analyticsQuery, [playerId]);

      if (updatedResult.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Player not found'
        });
      }

      return res.json({
        success: true,
        data: updatedResult[0]
      });
    }

    res.json({
      success: true,
      data: analyticsResult[0]
    });

  } catch (error) {
    console.error('Error fetching player analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch player analytics'
    });
  }
});

/**
 * @route GET /api/analytics/leaderboard
 * @desc Get player leaderboard
 * @access Public (for MVP)
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const leaderboard = await AnalyticsService.getPlayerLeaderboard(limit);

    res.json({
      success: true,
      data: leaderboard
    });

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard'
    });
  }
});

/**
 * @route GET /api/analytics/player/:playerId/trends
 * @desc Get player performance trends
 * @access Public (for MVP)
 */
router.get('/player/:playerId/trends', async (req, res) => {
  try {
    const { playerId } = req.params;
    const days = parseInt(req.query.days as string) || 30;

    const trends = await AnalyticsService.getPlayerPerformanceTrends(playerId, days);

    res.json({
      success: true,
      data: trends
    });

  } catch (error) {
    console.error('Error fetching player trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch player trends'
    });
  }
});

/**
 * @route GET /api/analytics/session/:sessionId
 * @desc Get session analytics
 * @access Public (for MVP)
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get session analytics
    const analyticsQuery = `
      SELECT sa.*, s.name as session_name, s.location, s.scheduled_at
      FROM session_analytics sa
      JOIN mvp_sessions s ON sa.session_id = s.id
      WHERE sa.session_id = $1
    `;
    const analyticsResult = await DatabaseUtils.executeRawQuery(analyticsQuery, [sessionId]);

    if (analyticsResult.length === 0) {
      // Try to calculate analytics if not found
      await AnalyticsService.updateSessionAnalytics(sessionId);
      const updatedResult = await DatabaseUtils.executeRawQuery(analyticsQuery, [sessionId]);

      if (updatedResult.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      return res.json({
        success: true,
        data: updatedResult[0]
      });
    }

    res.json({
      success: true,
      data: analyticsResult[0]
    });

  } catch (error) {
    console.error('Error fetching session analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session analytics'
    });
  }
});

/**
 * @route GET /api/analytics/tournament/:tournamentId
 * @desc Get tournament analytics
 * @access Public (for MVP)
 */
router.get('/tournament/:tournamentId', async (req, res) => {
  try {
    const { tournamentId } = req.params;

    // Get tournament analytics
    const analyticsQuery = `
      SELECT ta.*, t.name as tournament_name, t.status, t.start_date, t.end_date
      FROM tournament_analytics ta
      JOIN tournaments t ON ta.tournament_id = t.id
      WHERE ta.tournament_id = $1
    `;
    const analyticsResult = await DatabaseUtils.executeRawQuery(analyticsQuery, [tournamentId]);

    if (analyticsResult.length === 0) {
      // Try to calculate analytics if not found
      await AnalyticsService.updateTournamentAnalytics(tournamentId);
      const updatedResult = await DatabaseUtils.executeRawQuery(analyticsQuery, [tournamentId]);

      if (updatedResult.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Tournament not found'
        });
      }

      return res.json({
        success: true,
        data: updatedResult[0]
      });
    }

    res.json({
      success: true,
      data: analyticsResult[0]
    });

  } catch (error) {
    console.error('Error fetching tournament analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tournament analytics'
    });
  }
});

/**
 * @route GET /api/analytics/system
 * @desc Get system-wide analytics
 * @access Public (for MVP)
 */
router.get('/system', async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();

    // Get system analytics for the specified date
    const analyticsQuery = `
      SELECT * FROM system_analytics
      WHERE date = $1
      ORDER BY date DESC
      LIMIT 1
    `;
    const analyticsResult = await DatabaseUtils.executeRawQuery(analyticsQuery, [date]);

    if (analyticsResult.length === 0) {
      // Try to generate analytics if not found
      await AnalyticsService.generateSystemAnalytics(date);
      const updatedResult = await DatabaseUtils.executeRawQuery(analyticsQuery, [date]);

      if (updatedResult.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'System analytics not available for this date'
        });
      }

      return res.json({
        success: true,
        data: updatedResult[0]
      });
    }

    res.json({
      success: true,
      data: analyticsResult[0]
    });

  } catch (error) {
    console.error('Error fetching system analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system analytics'
    });
  }
});

/**
 * @route POST /api/analytics/refresh/player/:playerId
 * @desc Refresh player analytics
 * @access Public (for MVP)
 */
router.post('/refresh/player/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;

    await AnalyticsService.updatePlayerAnalytics(playerId);

    res.json({
      success: true,
      message: 'Player analytics refreshed successfully'
    });

  } catch (error) {
    console.error('Error refreshing player analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh player analytics'
    });
  }
});

/**
 * @route POST /api/analytics/refresh/session/:sessionId
 * @desc Refresh session analytics
 * @access Public (for MVP)
 */
router.post('/refresh/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    await AnalyticsService.updateSessionAnalytics(sessionId);

    res.json({
      success: true,
      message: 'Session analytics refreshed successfully'
    });

  } catch (error) {
    console.error('Error refreshing session analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh session analytics'
    });
  }
});

/**
 * @route POST /api/analytics/refresh/tournament/:tournamentId
 * @desc Refresh tournament analytics
 * @access Public (for MVP)
 */
router.post('/refresh/tournament/:tournamentId', async (req, res) => {
  try {
    const { tournamentId } = req.params;

    await AnalyticsService.updateTournamentAnalytics(tournamentId);

    res.json({
      success: true,
      message: 'Tournament analytics refreshed successfully'
    });

  } catch (error) {
    console.error('Error refreshing tournament analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh tournament analytics'
    });
  }
});

/**
 * @route POST /api/analytics/refresh/system
 * @desc Refresh system analytics
 * @access Public (for MVP)
 */
router.post('/refresh/system', async (req, res) => {
  try {
    const date = req.body.date ? new Date(req.body.date) : new Date();

    await AnalyticsService.generateSystemAnalytics(date);

    res.json({
      success: true,
      message: 'System analytics refreshed successfully'
    });

  } catch (error) {
    console.error('Error refreshing system analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh system analytics'
    });
  }
});

/**
 * @route GET /api/analytics/sessions
 * @desc Get session analytics dashboard data
 * @access Public (for MVP)
 */
router.get('/sessions', async (req, res) => {
  try {
    // Validate and parse query parameters
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    // Validate date ranges
    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date cannot be after end date'
      });
    }

    // Validate date is not in future (with 1 day buffer)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    if ((startDate && startDate > tomorrow) || (endDate && endDate > tomorrow)) {
      return res.status(400).json({
        success: false,
        error: 'Cannot request analytics for future dates'
      });
    }

    let filters;
    if (req.query.filters) {
      try {
        filters = JSON.parse(req.query.filters as string);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid filters JSON format'
        });
      }
    }

    const dashboardData = await AnalyticsService.getSessionAnalyticsDashboard(startDate, endDate, filters);

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Error fetching session analytics dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session analytics dashboard'
    });
  }
});

/**
 * @route GET /api/analytics/trends
 * @desc Get session attendance trends
 * @access Public (for MVP)
 */
router.get('/trends', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const filters = req.query.filters ? JSON.parse(req.query.filters as string) : undefined;

    const trends = await AnalyticsService.getSessionTrends(startDate, endDate, filters);

    res.json({
      success: true,
      data: trends
    });

  } catch (error) {
    console.error('Error fetching session trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session trends'
    });
  }
});

/**
 * @route GET /api/analytics/geography
 * @desc Get geographic distribution of sessions
 * @access Public (for MVP)
 */
router.get('/geography', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const filters = req.query.filters ? JSON.parse(req.query.filters as string) : undefined;

    const geography = await AnalyticsService.getGeographicDistribution(startDate, endDate, filters);

    res.json({
      success: true,
      data: geography
    });

  } catch (error) {
    console.error('Error fetching geographic distribution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch geographic distribution'
    });
  }
});

/**
 * @route GET /api/analytics/participation
 * @desc Get participation analysis
 * @access Public (for MVP)
 */
router.get('/participation', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const filters = req.query.filters ? JSON.parse(req.query.filters as string) : undefined;

    const participation = await AnalyticsService.getParticipationAnalysis(startDate, endDate, filters);

    res.json({
      success: true,
      data: participation
    });

  } catch (error) {
    console.error('Error fetching participation analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch participation analysis'
    });
  }
});

/**
 * @route GET /api/analytics/session-types
 * @desc Get session type popularity analytics
 * @access Public (for MVP)
 */
router.get('/session-types', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const filters = req.query.filters ? JSON.parse(req.query.filters as string) : undefined;

    const sessionTypes = await AnalyticsService.getSessionTypeAnalytics(startDate, endDate, filters);

    res.json({
      success: true,
      data: sessionTypes
    });

  } catch (error) {
    console.error('Error fetching session type analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session type analytics'
    });
  }
});

/**
 * @route GET /api/analytics/peak-usage
 * @desc Get peak usage patterns
 * @access Public (for MVP)
 */
router.get('/peak-usage', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const filters = req.query.filters ? JSON.parse(req.query.filters as string) : undefined;

    const peakUsage = await AnalyticsService.getPeakUsagePatterns(startDate, endDate, filters);

    res.json({
      success: true,
      data: peakUsage
    });

  } catch (error) {
    console.error('Error fetching peak usage patterns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch peak usage patterns'
    });
  }
});

/**
 * @route POST /api/analytics/export
 * @desc Export analytics data
 * @access Public (for MVP)
 */
router.post('/export',
  exportRateLimit, // Stricter rate limiting for export operations
  validate(analyticsExportSchema),
  async (req, res) => {
  try {
    const { startDate, endDate, format = 'json' } = req.body;
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const exportData = await AnalyticsService.exportAnalyticsData(start, end, format as 'json' | 'csv');

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="session-analytics.csv"');
      res.setHeader('X-Content-Type-Options', 'nosniff'); // Additional security header
      res.send(exportData);
    } else {
      res.json({
        success: true,
        data: exportData
      });
    }

  } catch (error) {
    console.error('Error exporting analytics data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export analytics data'
    });
  }
});

/**
 * @route POST /api/analytics/track-event
 * @desc Track analytics event
 * @access Public (for MVP)
 */
router.post('/track-event', async (req, res) => {
  try {
    const { type, entityId, userId, data } = req.body;

    if (!type || !entityId) {
      return res.status(400).json({
        success: false,
        error: 'Type and entityId are required'
      });
    }

    await AnalyticsService.trackAnalyticsEvent(type, entityId, userId, data);

    res.json({
      success: true,
      message: 'Event tracked successfully'
    });

  } catch (error) {
    console.error('Error tracking analytics event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track analytics event'
    });
  }
});

export default router;