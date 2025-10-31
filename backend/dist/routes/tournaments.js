"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const tournamentService_1 = __importDefault(require("../services/tournamentService"));
const router = (0, express_1.Router)();
/**
 * @route POST /api/tournaments
 * @desc Create a new tournament
 * @access Public
 */
router.post('/', [
    (0, express_validator_1.body)('name').isString().isLength({ min: 1, max: 100 }),
    (0, express_validator_1.body)('description').optional().isString().isLength({ max: 500 }),
    (0, express_validator_1.body)('tournamentType').isIn(['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'SWISS', 'MIXED']),
    (0, express_validator_1.body)('maxPlayers').isInt({ min: 2, max: 128 }),
    (0, express_validator_1.body)('minPlayers').isInt({ min: 2 }),
    (0, express_validator_1.body)('startDate').isISO8601(),
    (0, express_validator_1.body)('endDate').optional().isISO8601(),
    (0, express_validator_1.body)('registrationDeadline').isISO8601(),
    (0, express_validator_1.body)('matchFormat').isIn(['SINGLES', 'DOUBLES', 'MIXED']),
    (0, express_validator_1.body)('scoringSystem').isIn(['21_POINT', '15_POINT', '11_POINT']),
    (0, express_validator_1.body)('bestOfGames').isInt({ min: 1, max: 5 }),
    (0, express_validator_1.body)('entryFee').isFloat({ min: 0 }),
    (0, express_validator_1.body)('prizePool').isFloat({ min: 0 }),
    (0, express_validator_1.body)('currency').isString().isLength({ min: 3, max: 3 }),
    (0, express_validator_1.body)('organizerName').isString().isLength({ min: 1, max: 100 }),
    (0, express_validator_1.body)('organizerEmail').optional().isEmail(),
    (0, express_validator_1.body)('organizerPhone').optional().isString(),
    (0, express_validator_1.body)('visibility').isIn(['PUBLIC', 'PRIVATE', 'INVITATION_ONLY']),
    (0, express_validator_1.body)('accessCode').optional().isString(),
    (0, express_validator_1.body)('skillLevelMin').optional().isString(),
    (0, express_validator_1.body)('skillLevelMax').optional().isString(),
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
            });
        }
        const tournament = await tournamentService_1.default.createTournament(req.body);
        res.status(201).json({
            success: true,
            data: tournament,
            message: 'Tournament created successfully',
        });
    }
    catch (error) {
        console.error('Error creating tournament:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create tournament',
        });
    }
});
/**
 * @route GET /api/tournaments
 * @desc Get tournaments with filtering
 * @access Public
 */
router.get('/', [
    (0, express_validator_1.query)('status').optional().isIn(['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
    (0, express_validator_1.query)('visibility').optional().isIn(['PUBLIC', 'PRIVATE', 'INVITATION_ONLY']),
    (0, express_validator_1.query)('tournamentType').optional().isIn(['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'SWISS', 'MIXED']),
    (0, express_validator_1.query)('skillLevel').optional().isString(),
    (0, express_validator_1.query)('latitude').optional().isFloat(),
    (0, express_validator_1.query)('longitude').optional().isFloat(),
    (0, express_validator_1.query)('radius').optional().isFloat({ min: 1, max: 500 }),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }),
    (0, express_validator_1.query)('offset').optional().isInt({ min: 0 }),
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
            });
        }
        const filters = {
            status: req.query.status,
            visibility: req.query.visibility,
            tournamentType: req.query.tournamentType,
            skillLevel: req.query.skillLevel,
            latitude: req.query.latitude ? parseFloat(req.query.latitude) : undefined,
            longitude: req.query.longitude ? parseFloat(req.query.longitude) : undefined,
            radius: req.query.radius ? parseFloat(req.query.radius) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit) : 20,
            offset: req.query.offset ? parseInt(req.query.offset) : 0,
        };
        const result = await tournamentService_1.default.getTournaments(filters);
        res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('Error fetching tournaments:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch tournaments',
        });
    }
});
/**
 * @route GET /api/tournaments/:id
 * @desc Get tournament by ID
 * @access Public
 */
router.get('/:id', [(0, express_validator_1.param)('id').isString().isLength({ min: 1 })], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
            });
        }
        const tournament = await tournamentService_1.default.getTournamentById(req.params.id);
        res.json({
            success: true,
            data: tournament,
        });
    }
    catch (error) {
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
});
/**
 * @route PUT /api/tournaments/:id
 * @desc Update tournament
 * @access Public (should be restricted to organizers)
 */
router.put('/:id', [
    (0, express_validator_1.param)('id').isString().isLength({ min: 1 }),
    (0, express_validator_1.body)('name').optional().isString().isLength({ min: 1, max: 100 }),
    (0, express_validator_1.body)('description').optional().isString().isLength({ max: 500 }),
    (0, express_validator_1.body)('startDate').optional().isISO8601(),
    (0, express_validator_1.body)('endDate').optional().isISO8601(),
    (0, express_validator_1.body)('registrationDeadline').optional().isISO8601(),
    (0, express_validator_1.body)('venueName').optional().isString(),
    (0, express_validator_1.body)('venueAddress').optional().isString(),
    (0, express_validator_1.body)('latitude').optional().isFloat({ min: -90, max: 90 }),
    (0, express_validator_1.body)('longitude').optional().isFloat({ min: -180, max: 180 }),
    (0, express_validator_1.body)('entryFee').optional().isFloat({ min: 0 }),
    (0, express_validator_1.body)('prizePool').optional().isFloat({ min: 0 }),
    (0, express_validator_1.body)('visibility').optional().isIn(['PUBLIC', 'PRIVATE', 'INVITATION_ONLY']),
    (0, express_validator_1.body)('accessCode').optional().isString(),
    (0, express_validator_1.body)('status').optional().isIn(['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
            });
        }
        const tournament = await tournamentService_1.default.updateTournament(req.params.id, req.body);
        res.json({
            success: true,
            data: tournament,
            message: 'Tournament updated successfully',
        });
    }
    catch (error) {
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
});
/**
 * @route DELETE /api/tournaments/:id
 * @desc Delete tournament
 * @access Public (should be restricted to organizers)
 */
router.delete('/:id', [(0, express_validator_1.param)('id').isString().isLength({ min: 1 })], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
            });
        }
        await tournamentService_1.default.deleteTournament(req.params.id);
        res.json({
            success: true,
            message: 'Tournament deleted successfully',
        });
    }
    catch (error) {
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
});
/**
 * @route POST /api/tournaments/:id/register
 * @desc Register player for tournament
 * @access Public
 */
router.post('/:id/register', [
    (0, express_validator_1.param)('id').isString().isLength({ min: 1 }),
    (0, express_validator_1.body)('playerName').isString().isLength({ min: 1, max: 100 }),
    (0, express_validator_1.body)('email').optional().isEmail(),
    (0, express_validator_1.body)('phone').optional().isString(),
    (0, express_validator_1.body)('deviceId').optional().isString(),
    (0, express_validator_1.body)('skillLevel').optional().isString(),
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
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
        const player = await tournamentService_1.default.registerPlayer(registrationData);
        res.status(201).json({
            success: true,
            data: player,
            message: 'Player registered successfully',
        });
    }
    catch (error) {
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
});
/**
 * @route DELETE /api/tournaments/:tournamentId/players/:playerId
 * @desc Unregister player from tournament
 * @access Public (should be restricted)
 */
router.delete('/:tournamentId/players/:playerId', [
    (0, express_validator_1.param)('tournamentId').isString().isLength({ min: 1 }),
    (0, express_validator_1.param)('playerId').isString().isLength({ min: 1 }),
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
            });
        }
        await tournamentService_1.default.unregisterPlayer(req.params.tournamentId, req.params.playerId);
        res.json({
            success: true,
            message: 'Player unregistered successfully',
        });
    }
    catch (error) {
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
});
/**
 * @route POST /api/tournaments/:id/start
 * @desc Start tournament and generate bracket
 * @access Public (should be restricted to organizers)
 */
router.post('/:id/start', [(0, express_validator_1.param)('id').isString().isLength({ min: 1 })], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
            });
        }
        await tournamentService_1.default.startTournament(req.params.id);
        res.json({
            success: true,
            message: 'Tournament started successfully',
        });
    }
    catch (error) {
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
});
/**
 * @route GET /api/tournaments/:id/stats
 * @desc Get tournament statistics
 * @access Public
 */
router.get('/:id/stats', [(0, express_validator_1.param)('id').isString().isLength({ min: 1 })], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
            });
        }
        const stats = await tournamentService_1.default.getTournamentStats(req.params.id);
        res.json({
            success: true,
            data: stats,
        });
    }
    catch (error) {
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
});
exports.default = router;
//# sourceMappingURL=tournaments.js.map