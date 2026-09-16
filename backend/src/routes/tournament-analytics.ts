import express, { Request } from 'express';
import { authenticateToken, requireRole, optionalAuth } from '../middleware/auth';
import { resolveIdentity } from '../middleware/permissions';
import { TournamentAnalyticsService } from '../services/tournamentAnalyticsService';
import { prisma } from '../config/database';
// import { validationMiddleware } from '../middleware/validation'; // Not implemented
// import { z } from 'zod'; // Not installed

// Story 6.11: this mirrors the shape `authenticateToken`/`optionalAuth` actually
// set (`{ id, email, role }`). It previously declared an optional `name`, which
// no middleware ever populates — that lie is what let a `req.user.name`-based
// ownership check type-check while being unreachable at runtime.
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string | null;
    role: string;
  };
}

const router = express.Router();

// Schema for feedback validation (zod not installed)
// const feedbackSchema = z.object({
//   rating: z.number().min(1).max(5),
//   comments: z.string().optional(),
// });

// GET /api/tournaments/:id/analytics - Get tournament analytics
//
// Story 6.11. Access model, device-first (Story 6.1 `optionalAuth`):
//   - PUBLIC tournament        → readable by anyone, including anonymous;
//   - non-public tournament    → readable only by its organizer;
//   - anonymous + non-public   → 404 (not 403, so existence is not disclosed);
//   - present-but-invalid JWT  → 401, raised by `optionalAuth` (never a silent downgrade).
//
// Ownership is decided from the resolvable identity columns
// (`organizerUserId` / `organizerDeviceId`), NOT the free-text `organizer`
// field — `schema.prisma` is explicit that the free-text field "MUST NOT be used
// for authorization". The previous implementation matched on `req.user.name`,
// which `authenticateToken`/`optionalAuth` never populate (they select only
// `{ id, email, role }`), so its organizer branch was unreachable and the route
// could only ever serve PUBLIC tournaments.
router.get(
  '/:id/analytics',
  optionalAuth,
  async (req, res) => {
    try {
      const tournamentId = req.params.id;

      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { visibility: true, organizerUserId: true, organizerDeviceId: true },
      });

      if (!tournament) {
        return res.status(404).json({
          success: false,
          error: { code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament not found or access denied' },
          timestamp: new Date().toISOString(),
        });
      }

      const isPublic = tournament.visibility === 'PUBLIC';

      if (!isPublic) {
        const identity = resolveIdentity(req);
        const isOrganizer =
          identity.source === 'jwt'
            ? !!tournament.organizerUserId && identity.userId === tournament.organizerUserId
            : identity.source === 'device'
              ? !!tournament.organizerDeviceId && identity.deviceId === tournament.organizerDeviceId
              : false;

        if (!isOrganizer) {
          return res.status(404).json({
            success: false,
            error: { code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament not found or access denied' },
            timestamp: new Date().toISOString(),
          });
        }
      }

      const metrics = await TournamentAnalyticsService.calculateParticipationMetrics(tournamentId);
      const efficiency = await TournamentAnalyticsService.calculateBracketEfficiency(tournamentId);
      const rankingChanges = await TournamentAnalyticsService.trackPlayerRankingChanges(tournamentId);

      res.json({
        success: true,
        data: {
          ...metrics,
          ...efficiency,
          rankingChanges,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error fetching tournament analytics:', error);
      res.status(500).json({
        success: false,
        error: { code: 'ANALYTICS_FAILED', message: 'Failed to fetch tournament analytics' },
        timestamp: new Date().toISOString(),
      });
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

      // Query tournaments accessible to the user.
      //
      // Story 6.11: this matched on `req.user.name`, which no auth middleware
      // ever populates — the clause evaluated to `organizer: ''` and matched
      // nothing. Ownership now comes from the resolvable identity column, and
      // the clause is omitted entirely when there is no user (rather than
      // falling back to a sentinel that could match real data).
      const user = (req as AuthRequest).user;
      const tournaments = await prisma.tournament.findMany({
        where: {
          OR: [
            { visibility: 'PUBLIC' },
            ...(user?.id ? [{ organizerUserId: user.id }] : []),
          ],
        },
        select: { id: true },
        orderBy: { startDate: 'desc' },
        take: Number(limit),
      });
      const tournamentIds = tournaments.map(t => t.id);

      const trends = await TournamentAnalyticsService.compareTournamentFormats(tournamentIds);

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
  // validationMiddleware(feedbackSchema), // Validation middleware not available
  async (req, res) => {
    try {
      const { id } = req.params;
      const { rating, comments } = req.body;
      const playerId = (req as AuthRequest).user?.id || 'temp-user-id'; // Get from req.user when auth is properly set up
      const tournamentId = id as string;

      // Verify player participated in tournament
      const participation = await prisma.tournamentPlayer.findFirst({
        where: {
          tournamentId,
          // playerId field not in TournamentPlayer schema
          deviceId: playerId, // Using deviceId instead
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

// Real-time updates are handled by Socket.io (Story 6.4).
// The tournament analytics emitter lives in `socket/events/tournamentAnalytics.ts`
// and emits events to `tournament:${tournamentId}` rooms when matches complete
// or standings change. Clients join tournament rooms via the `join-tournament`
// socket event in `config/socket.ts`.

export default router;