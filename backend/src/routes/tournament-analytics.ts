import express, { Request } from 'express';
import Joi from 'joi';
import { authenticateToken, requireRole, optionalAuth } from '../middleware/auth';
import { resolveIdentity } from '../middleware/permissions';
import { TournamentAnalyticsService } from '../services/tournamentAnalyticsService';
import { prisma } from '../config/database';
import { validate } from '../utils/validation';

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

// Story 6.8 (D5): CSAT feedback validation, restored.
//
// `rating` is the **1–5 CSAT** scale (`TournamentFeedback.rating Int // 1-5`),
// NOT the 0–10 NPS scale (`NpsResponse.score`). The two instruments never mix.
// `deviceId` is accepted so a device-only participant can be resolved (see the
// route below); it is read by `resolveIdentity`, never trusted for ownership.
const feedbackSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  comments: Joi.string().max(2000).allow('').optional(),
  deviceId: Joi.string().max(200).optional(),
});

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

// POST /api/tournaments/:id/feedback - Submit tournament feedback (CSAT, 1-5)
//
// Story 6.8 (D5) repair. The previous implementation was **unimplementable**:
//   * it set `playerId = req.user.id` (a `User.id`) while
//     `TournamentFeedback.playerId` FK'd to `MvpPlayer.id` (`schema.prisma`), and
//     `MvpPlayer` is *session*-scoped (`sessionId` required) with **no**
//     `TournamentPlayer → MvpPlayer` bridge — so a tournament-scoped row could
//     never reference a valid `MvpPlayer`;
//   * its fallback `'temp-user-id'` guaranteed an FK violation on every write;
//   * its participation check compared a device id to a user id
//     (`deviceId: playerId`);
//   * validation was commented out and the response skipped the envelope.
//
// The FK is now repointed to `TournamentPlayer.id` (migration
// `20260916000000_story_6_8_community`) and the write path resolves the caller's
// **tournament-scoped** participant row. Identity is resolved with the only
// sanctioned resolver, `resolveIdentity`. `deviceId` is matched **first** because
// `TournamentPlayer.userId` is NULL-by-design (Story 6.7 §D8); `userId` is the
// fallback. No match → 403. Fully anonymous callers are rejected (no identity).
router.post(
  '/:id/feedback',
  optionalAuth,
  validate(feedbackSchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { rating, comments } = req.body as { rating: number; comments?: string };
      const tournamentId = id as string;

      const identity = resolveIdentity(req);
      if (identity.source === 'anonymous') {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'A user or device identity is required to submit feedback' },
          timestamp: new Date().toISOString(),
        });
      }

      // Resolve the caller's tournament-scoped participant row.
      //   * deviceId is the PRIMARY key — `TournamentPlayer.userId` is NULL-by-design.
      //   * userId is the secondary fallback.
      let participant: { id: string } | null = null;
      if (identity.deviceId) {
        participant = await prisma.tournamentPlayer.findFirst({
          where: { tournamentId, deviceId: identity.deviceId },
          select: { id: true },
        });
      }
      if (!participant && identity.userId) {
        participant = await prisma.tournamentPlayer.findFirst({
          where: { tournamentId, userId: identity.userId },
          select: { id: true },
        });
      }

      if (!participant) {
        return res.status(403).json({
          success: false,
          error: { code: 'NOT_PARTICIPANT', message: 'Must participate in tournament to provide feedback' },
          timestamp: new Date().toISOString(),
        });
      }

      // `playerId` is now a `TournamentPlayer.id` (never a `User.id`/`MvpPlayer.id`).
      const feedback = await prisma.tournamentFeedback.create({
        data: {
          tournamentId,
          playerId: participant.id,
          rating: Number(rating),
          comments: comments ?? null,
        },
        include: {
          tournament: true,
        },
      });

      // Optionally update analytics aggregate (triggers feedback aggregation).
      await TournamentAnalyticsService.calculateParticipationMetrics(tournamentId);

      res.status(201).json({
        success: true,
        data: feedback,
        message: 'Feedback submitted successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error submitting tournament feedback:', error);
      res.status(500).json({
        success: false,
        error: { code: 'FEEDBACK_FAILED', message: 'Failed to submit feedback' },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// Real-time updates are handled by Socket.io (Story 6.4).
// The tournament analytics emitter lives in `socket/events/tournamentAnalytics.ts`
// and emits events to `tournament:${tournamentId}` rooms when matches complete
// or standings change. Clients join tournament rooms via the `join-tournament`
// socket event in `config/socket.ts`.

export default router;