import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import * as tournamentService from '../services/tournamentService';
import { optionalAuth } from '../middleware/auth';
import { resolveIdentity } from '../middleware/permissions';
import { requireTournamentOrganizer } from '../middleware/tournamentPermissions';
import {
  BracketError,
  tournamentBracketService,
} from '../services/tournamentBracketService';

const router = Router();

/**
 * Map a bracket failure onto the standard error envelope.
 *
 * `BracketError` carries a `statusCode`, so a structural failure (unsupported
 * format, a non-power-of-two double-elimination field, an unknown match, a
 * completed-downstream correction) becomes an actionable 4xx — never an
 * unhandled 500 (design §1 D5 / T04 handoff #5).
 */
function sendBracketError(res: Response, error: unknown, fallbackMessage: string): Response {
  if (error instanceof BracketError) {
    return res.status(error.statusCode).json({
      success: false,
      error: { code: error.code, message: error.message },
      timestamp: new Date().toISOString(),
    });
  }
  console.error(`${fallbackMessage}:`, error);
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : fallbackMessage,
    },
    timestamp: new Date().toISOString(),
  });
}

/** Standard 400 for an express-validator failure. */
function sendValidationError(res: Response, details: unknown[]): Response {
  return res.status(400).json({ success: false, error: 'Validation failed', details });
}

/**
 * @route POST /api/tournaments
 * @desc Create a new tournament
 * @access Public
 */
router.post(
  '/',
  optionalAuth,
  [
    body('name').isString().isLength({ min: 1, max: 100 }),
    body('description').optional().isString().isLength({ max: 500 }),
    body('tournamentType').isIn(['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'SWISS', 'MIXED']),
    body('maxPlayers').isInt({ min: 2, max: 128 }),
    body('minPlayers').isInt({ min: 2 }),
    body('startDate').isISO8601(),
    body('endDate').optional().isISO8601(),
    body('registrationDeadline').isISO8601(),
    body('matchFormat').isIn(['SINGLES', 'DOUBLES', 'MIXED']),
    body('scoringSystem').isIn(['21_POINT', '15_POINT', '11_POINT']),
    body('bestOfGames').isInt({ min: 1, max: 5 }),
    body('entryFee').isFloat({ min: 0 }),
    body('prizePool').isFloat({ min: 0 }),
    body('currency').isString().isLength({ min: 3, max: 3 }),
    body('organizerName').isString().isLength({ min: 1, max: 100 }),
    body('organizerEmail').optional().isEmail(),
    body('organizerPhone').optional().isString(),
    body('visibility').isIn(['PUBLIC', 'PRIVATE', 'INVITATION_ONLY']),
    body('accessCode').optional().isString(),
    body('skillLevelMin').optional().isString(),
    body('skillLevelMax').optional().isString(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      // Story 6.7 (AC 15) — record the resolvable organizer identity so the
      // creator can later mutate the tournament. Without this the two columns
      // land `null` and `requireTournamentOrganizer` fails closed for *everyone*
      // (design §1 D6), making every API-created tournament unmanageable.
      const identity = resolveIdentity(req);
      const tournament = await tournamentService.createTournament({
        ...req.body,
        organizerUserId: identity.userId,
        organizerDeviceId: identity.deviceId,
      });

      res.status(201).json({
        success: true,
        data: tournament,
        message: 'Tournament created successfully',
      });
    } catch (error: any) {
      console.error('Error creating tournament:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create tournament',
      });
    }
  }
);

/**
 * @route GET /api/tournaments
 * @desc Get tournaments with filtering
 * @access Public
 */
router.get(
  '/',
  [
    query('status').optional().isIn(['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
    query('visibility').optional().isIn(['PUBLIC', 'PRIVATE', 'INVITATION_ONLY']),
    query('tournamentType').optional().isIn(['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'SWISS', 'MIXED']),
    query('skillLevel').optional().isString(),
    query('latitude').optional().isFloat(),
    query('longitude').optional().isFloat(),
    query('radius').optional().isFloat({ min: 1, max: 500 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const filters = {
        status: req.query.status as string,
        visibility: req.query.visibility as string,
        tournamentType: req.query.tournamentType as string,
        skillLevel: req.query.skillLevel as string,
        latitude: req.query.latitude ? parseFloat(req.query.latitude as string) : undefined,
        longitude: req.query.longitude ? parseFloat(req.query.longitude as string) : undefined,
        radius: req.query.radius ? parseFloat(req.query.radius as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };

      const result = await tournamentService.getTournaments(filters);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('Error fetching tournaments:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch tournaments',
      });
    }
  }
);

/**
 * @route GET /api/tournaments/:id
 * @desc Get tournament by ID
 * @access Public
 */
router.get(
  '/:id',
  [param('id').isString().isLength({ min: 1 })],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const tournament = await tournamentService.getTournamentById(req.params.id);

      res.json({
        success: true,
        data: tournament,
      });
    } catch (error: any) {
      console.error('Error fetching tournament:', error);

      if (error.message === 'Tournament not found') {
        return res.status(404).json({
          success: false,
          error: 'Tournament not found',
        });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch tournament',
      });
    }
  }
);

/**
 * @route PUT /api/tournaments/:id
 * @desc Update tournament
 * @access Public (should be restricted to organizers)
 */
router.put(
  '/:id',
  [
    param('id').isString().isLength({ min: 1 }),
    body('name').optional().isString().isLength({ min: 1, max: 100 }),
    body('description').optional().isString().isLength({ max: 500 }),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    body('registrationDeadline').optional().isISO8601(),
    body('venueName').optional().isString(),
    body('venueAddress').optional().isString(),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
    body('entryFee').optional().isFloat({ min: 0 }),
    body('prizePool').optional().isFloat({ min: 0 }),
    body('visibility').optional().isIn(['PUBLIC', 'PRIVATE', 'INVITATION_ONLY']),
    body('accessCode').optional().isString(),
    body('status').optional().isIn(['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const tournament = await tournamentService.updateTournament(req.params.id, req.body);

      res.json({
        success: true,
        data: tournament,
        message: 'Tournament updated successfully',
      });
    } catch (error: any) {
      console.error('Error updating tournament:', error);

      if (error.message === 'Tournament not found') {
        return res.status(404).json({
          success: false,
          error: 'Tournament not found',
        });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update tournament',
      });
    }
  }
);

/**
 * @route DELETE /api/tournaments/:id
 * @desc Delete tournament
 * @access Public (should be restricted to organizers)
 */
router.delete(
  '/:id',
  [param('id').isString().isLength({ min: 1 })],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      await tournamentService.deleteTournament(req.params.id);

      res.json({
        success: true,
        message: 'Tournament deleted successfully',
      });
    } catch (error: any) {
      console.error('Error deleting tournament:', error);

      if (error.message === 'Tournament not found') {
        return res.status(404).json({
          success: false,
          error: 'Tournament not found',
        });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete tournament',
      });
    }
  }
);

/**
 * @route POST /api/tournaments/:id/register
 * @desc Register player for tournament
 * @access Public
 */
router.post(
  '/:id/register',
  [
    param('id').isString().isLength({ min: 1 }),
    body('playerName').isString().isLength({ min: 1, max: 100 }),
    body('email').optional().isEmail(),
    body('phone').optional().isString(),
    body('deviceId').optional().isString(),
    body('skillLevel').optional().isString(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const { tournamentId, ...playerData } = {
        tournamentId: req.params.id,
        ...req.body,
      };

      const player = await tournamentService.registerPlayer(tournamentId, playerData);

      res.status(201).json({
        success: true,
        data: player,
        message: 'Player registered successfully',
      });
    } catch (error: any) {
      console.error('Error registering player:', error);

      if (error.message.includes('not found') || error.message.includes('not accepting') || error.message.includes('full') || error.message.includes('already registered')) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to register player',
      });
    }
  }
);

/**
 * @route DELETE /api/tournaments/:tournamentId/players/:playerId
 * @desc Unregister player from tournament
 * @access Public (should be restricted)
 */
router.delete(
  '/:tournamentId/players/:playerId',
  [
    param('tournamentId').isString().isLength({ min: 1 }),
    param('playerId').isString().isLength({ min: 1 }),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      await tournamentService.unregisterPlayer(req.params.tournamentId, req.params.playerId);

      res.json({
        success: true,
        message: 'Player unregistered successfully',
      });
    } catch (error: any) {
      console.error('Error unregistering player:', error);

      if (error.message.includes('not found') || error.message.includes('cannot unregister')) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to unregister player',
      });
    }
  }
);

/**
 * @route POST /api/tournaments/:id/start
 * @desc Start tournament and generate bracket
 * @access Organizer only
 *
 * DELIBERATE CONTRACT CHANGE (Story 6.7). This endpoint was previously public
 * and only flipped `status`. It now *mutates* — it generates and persists the
 * bracket — so leaving it open would let an unauthenticated caller start any
 * tournament. Because `generateAndPersistBracket` is idempotent (it skips when
 * rounds already exist), that bracket would then be **frozen**: the organizer
 * could no longer regenerate after late registrations, and the tournament would
 * already be `IN_PROGRESS` (dropping out of upcoming lists). The organizer guard
 * is therefore applied here, exactly as on the other mutation endpoints. The
 * `{ success, message }` response shape and the additive `data.bracket` are
 * unchanged; only the access rule tightened. AC 5 covers the read/register
 * contracts, not a now-mutating endpoint.
 */
router.post(
  '/:id/start',
  optionalAuth,
  requireTournamentOrganizer(),
  [param('id').isString().isLength({ min: 1 })],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      await tournamentService.startTournament(req.params.id);

      // Story 6.7 (design §1 D4) — `startTournament` only flips the status and
      // creates 0 rounds / 0 matches, which left `completionRate` permanently 0.
      // Generate + persist the bracket here (idempotent). `data` is additive, so
      // the existing `{ success, message }` contract is preserved (AC 5).
      let bracket = null;
      try {
        bracket = await tournamentBracketService.generateAndPersistForTournament(req.params.id);
      } catch (error) {
        if (error instanceof BracketError) {
          return sendBracketError(res, error, 'Failed to generate bracket');
        }
        throw error;
      }

      res.json({
        success: true,
        message: 'Tournament started successfully',
        data: { bracket },
      });
    } catch (error: any) {
      console.error('Error starting tournament:', error);

      if (error.message.includes('not found') || error.message.includes('must be') || error.message.includes('needs at least')) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to start tournament',
      });
    }
  }
);

/**
 * @route GET /api/tournaments/:id/stats
 * @desc Get tournament statistics
 * @access Public
 */
router.get(
  '/:id/stats',
  [param('id').isString().isLength({ min: 1 })],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const stats = await tournamentService.getTournamentStats(req.params.id);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error('Error fetching tournament stats:', error);

      if (error.message === 'Tournament not found') {
        return res.status(404).json({
          success: false,
          error: 'Tournament not found',
        });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch tournament statistics',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Story 6.7 — bracket endpoints (additive; AC 5 keeps the 9 above unchanged)
// ---------------------------------------------------------------------------

/**
 * @route POST /api/v1/tournaments/:id/bracket/generate
 * @desc Generate and persist the tournament bracket (idempotent)
 * @access Organizer only
 */
router.post(
  '/:id/bracket/generate',
  optionalAuth,
  requireTournamentOrganizer(),
  [param('id').isString().isLength({ min: 1 })],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      const bracket = await tournamentBracketService.generateAndPersistForTournament(
        req.params.id,
      );
      res.status(201).json({
        success: true,
        data: { bracket },
        message: 'Bracket generated successfully',
      });
    } catch (error) {
      return sendBracketError(res, error, 'Failed to generate bracket');
    }
  }
);

/**
 * @route GET /api/v1/tournaments/:id/bracket
 * @desc Get the persisted (projected) bracket
 * @access Public
 */
router.get(
  '/:id/bracket',
  [param('id').isString().isLength({ min: 1 })],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      const bracket = await tournamentBracketService.getBracketState(req.params.id);
      if (!bracket) {
        return res.status(404).json({
          success: false,
          error: { code: 'BRACKET_NOT_FOUND', message: 'No bracket exists for this tournament' },
          timestamp: new Date().toISOString(),
        });
      }
      res.json({ success: true, data: { bracket } });
    } catch (error) {
      return sendBracketError(res, error, 'Failed to fetch bracket');
    }
  }
);

/**
 * @route POST /api/v1/tournaments/:id/matches/:matchId/result
 * @desc Record a match result and advance the bracket
 * @access Organizer only
 */
router.post(
  '/:id/matches/:matchId/result',
  optionalAuth,
  requireTournamentOrganizer(),
  [
    param('id').isString().isLength({ min: 1 }),
    param('matchId').isString().isLength({ min: 1 }),
    body('winnerId').isString().isLength({ min: 1 }),
    body('score').optional().isString(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      await tournamentBracketService.updateMatchResult(
        req.params.id,
        req.params.matchId,
        req.body.winnerId,
        req.body.score,
      );
      res.json({ success: true, message: 'Result recorded successfully' });
    } catch (error) {
      return sendBracketError(res, error, 'Failed to record result');
    }
  }
);

/**
 * @route POST /api/v1/tournaments/:id/matches/:matchId/correct
 * @desc Correct a recorded result (AC 12)
 * @access Organizer only
 */
router.post(
  '/:id/matches/:matchId/correct',
  optionalAuth,
  requireTournamentOrganizer(),
  [
    param('id').isString().isLength({ min: 1 }),
    param('matchId').isString().isLength({ min: 1 }),
    body('winnerId').isString().isLength({ min: 1 }),
    body('reason').isString().isLength({ min: 1, max: 500 }),
    body('cascade').optional().isBoolean(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      const result = await tournamentBracketService.correctMatchResult(
        req.params.id,
        req.params.matchId,
        req.body.winnerId,
        req.body.reason,
        req.body.cascade === true,
      );
      res.json({
        success: true,
        data: result,
        message: 'Result corrected successfully',
      });
    } catch (error) {
      return sendBracketError(res, error, 'Failed to correct result');
    }
  }
);

/**
 * @route GET /api/v1/tournaments/:id/standings
 * @desc Tournament standings (derived from persisted `TournamentPlayer` rows)
 * @access Public
 */
router.get(
  '/:id/standings',
  [param('id').isString().isLength({ min: 1 })],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      const tournament = await tournamentService.getTournamentById(req.params.id);
      const standings = [...tournament.players]
        .sort((a, b) => {
          if (a.finalRank != null && b.finalRank != null) return a.finalRank - b.finalRank;
          if (a.finalRank != null) return -1;
          if (b.finalRank != null) return 1;
          return b.winRate - a.winRate;
        })
        .map((player, index) => ({
          playerId: player.id,
          playerName: player.playerName,
          rank: player.finalRank ?? index + 1,
          seed: player.seed,
          winRate: player.winRate,
          totalMatches: player.totalMatches,
          isEliminated: player.isEliminated,
          status: player.status,
        }));

      res.json({ success: true, data: { standings } });
    } catch (error: any) {
      if (error?.message === 'Tournament not found') {
        return res.status(404).json({ success: false, error: 'Tournament not found' });
      }
      return sendBracketError(res, error, 'Failed to fetch standings');
    }
  }
);

export default router;