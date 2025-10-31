import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import tournamentService from '../services/tournamentService';

const router = Router();

/**
 * @route POST /api/tournaments
 * @desc Create a new tournament
 * @access Public
 */
router.post(
  '/',
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

      const tournament = await tournamentService.createTournament(req.body);

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

      const registrationData = {
        tournamentId: req.params.id,
        ...req.body,
      };

      const player = await tournamentService.registerPlayer(registrationData);

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
 * @access Public (should be restricted to organizers)
 */
router.post(
  '/:id/start',
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

      res.json({
        success: true,
        message: 'Tournament started successfully',
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

export default router;