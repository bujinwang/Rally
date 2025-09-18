import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { TournamentAnalyticsService } from '../services/tournamentAnalyticsService';
import { validationMiddleware } from '../middleware/validation';
import { z } from 'zod';

const router = express.Router();

// Schema for feedback validation
const feedbackSchema = z.object({
  rating: z.number().min(1).max(5),
  comments: z.string().optional(),
});

// GET /api/tournaments/:id/analytics - Get tournament analytics
router.get(
  '/:id/analytics',
  authenticateToken,
  requireRole(['ORGANIZER', 'ADMIN']),
  async (req, res) => {
    try {
      const { id } = req.params;
      const tournamentId = id as string;

      // Verify user has access to this tournament
      const tournament = await prisma.tournament.findFirst({
        where: {
          id: tournamentId,
          OR: [
            { organizerName: req.user?.name }, // Simple organizer check
            { visibility: 'PUBLIC' },
          ],
        },
      });

      if (!tournament) {
        return res.status(404).json({ error: 'Tournament not found or access denied' });
      }

      const metrics = await TournamentAnalyticsService.calculateParticipationMetrics(tournamentId);
      const efficiency = await TournamentAnalyticsService.calculateBracketEfficiency(tournamentId);
      const rankingChanges = await TournamentAnalyticsService.trackPlayerRankingChanges(tournamentId);

      const analytics = {
        ...metrics,
        ...efficiency,
        rankingChanges,
        timestamp: new Date().toISOString(),
      };

      res.json(analytics);
    } catch (error) {
      console.error('Error fetching tournament analytics:', error);
      res.status(500).json({ error: 'Failed to fetch tournament analytics' });
    }
  }
);

// GET /api/tournaments/analytics/trends - Get trends across tournaments
router.get(
  '/analytics/trends',
  authenticateToken,
  requireRole(['ORGANIZER', 'ADMIN']),
  async (req, res) => {
    try {
      const { format, limit = 10 } = req.query;
      const tournamentIds = []; // Query based on user access, placeholder

      const trends = await TournamentAnalyticsService.compareTournamentFormats(tournamentIds.slice(0, Number(limit)));

      res.json({
        trends,
        filters: { format: format as string, limit: Number(limit) },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error fetching tournament trends:', error);
      res.status(500).json({ error: 'Failed to fetch tournament trends' });
    }
  }
);

// POST /api/tournaments/:id/feedback - Submit tournament feedback
router.post(
  '/:id/feedback',
  authenticateToken,
  validationMiddleware(feedbackSchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { rating, comments } = req.body;
      const playerId = req.user?.id as string;
      const tournamentId = id as string;

      // Verify player participated in tournament
      const participation = await prisma.tournamentPlayer.findFirst({
        where: {
          tournamentId,
          playerId, // Assuming deviceId or similar maps to playerId
        },
      });

      if (!participation) {
        return res.status(403).json({ error: 'Must participate in tournament to provide feedback' });
      }

      const feedback = await prisma.tournamentFeedback.create({
        data: {
          tournamentId,
          playerId,
          rating,
          comments,
        },
        include: {
          tournament: true,
        },
      });

      // Optionally update analytics aggregate
      await TournamentAnalyticsService.calculateParticipationMetrics(tournamentId); // Triggers feedback aggregation

      res.status(201).json({
        message: 'Feedback submitted successfully',
        feedback,
      });
    } catch (error) {
      console.error('Error submitting tournament feedback:', error);
      res.status(500).json({ error: 'Failed to submit feedback' });
    }
  }
);

// Real-time updates via WebSocket or polling (placeholder for now)
// This would be handled by a separate WebSocket service or SSE endpoint

export default router;