/**
 * Tournament API Routes
 *
 * Comprehensive tournament management endpoints including:
 * - Tournament CRUD operations
 * - Player registration and management
 * - Bracket generation and management
 * - Live scoring and match updates
 * - Tournament discovery and statistics
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { prisma } from '../config/database';
import { cacheService } from '../services/cacheService';
import { performanceService } from '../services/performanceService';

// Temporary enum definitions until Prisma client is regenerated
enum TournamentType {
  SINGLE_ELIMINATION = 'SINGLE_ELIMINATION',
  DOUBLE_ELIMINATION = 'DOUBLE_ELIMINATION',
  ROUND_ROBIN = 'ROUND_ROBIN',
  SWISS = 'SWISS',
  MIXED = 'MIXED'
}

enum TournamentStatus {
  DRAFT = 'DRAFT',
  REGISTRATION_OPEN = 'REGISTRATION_OPEN',
  REGISTRATION_CLOSED = 'REGISTRATION_CLOSED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

enum TournamentPlayerStatus {
  REGISTERED = 'REGISTERED',
  CONFIRMED = 'CONFIRMED',
  WITHDRAWN = 'WITHDRAWN',
  DISQUALIFIED = 'DISQUALIFIED',
  ADVANCED = 'ADVANCED',
  ELIMINATED = 'ELIMINATED'
}

enum TournamentMatchStatus {
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  WALKOVER = 'WALKOVER'
}

const router = Router();

// Middleware to handle validation errors
const handleValidationErrors = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: errors.array()
      },
      timestamp: new Date().toISOString()
    });
  }
  next();
};

// Cache keys for tournaments
const getTournamentCacheKey = (id: string) => `tournament:${id}`;
const getTournamentsCacheKey = (filters: any) => `tournaments:${JSON.stringify(filters)}`;

// ============================
// TOURNAMENT CRUD OPERATIONS
// ============================

/**
 * GET /api/v1/tournaments
 * Get tournaments with filtering and pagination
 */
router.get('/', [
  query('status').optional().isIn(['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  query('tournamentType').optional().isIn(['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'SWISS', 'MIXED']),
  query('visibility').optional().isIn(['PUBLIC', 'PRIVATE', 'INVITATION_ONLY']),
  query('latitude').optional().isFloat({ min: -90, max: 90 }),
  query('longitude').optional().isFloat({ min: -180, max: 180 }),
  query('radius').optional().isFloat({ min: 0.1, max: 100 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  handleValidationErrors
], async (req, res) => {
  try {
    const startTime = Date.now();
    const {
      status,
      tournamentType,
      visibility,
      latitude,
      longitude,
      radius = 50, // Default 50km radius
      limit = 20,
      offset = 0
    } = req.query;

    // Check cache first
    const cacheKey = getTournamentsCacheKey(req.query);
    const cachedResult = await cacheService.get(cacheKey);

    if (cachedResult) {
      console.log('✅ Tournament list cache hit');
      performanceService.recordCacheHit();
      return res.json({
        success: true,
        data: cachedResult,
        cached: true,
        timestamp: new Date().toISOString()
      });
    }

    // Build where clause
    const where: any = {};

    if (status) where.status = status;
    if (tournamentType) where.tournamentType = tournamentType;
    if (visibility) where.visibility = visibility;

    // Location-based filtering
    if (latitude && longitude) {
      // This would require a more complex query with PostGIS or manual distance calculation
      // For now, we'll skip location filtering in the database query
      // and filter in application code if needed
    }

    const tournaments = await (prisma as any).tournament.findMany({
      where,
      include: {
        _count: {
          select: {
            players: true,
            matches: true
          }
        }
      },
      orderBy: { startDate: 'asc' },
      take: Number(limit),
      skip: Number(offset)
    });

    // Calculate distance for location-based results
    let filteredTournaments = tournaments;
    if (latitude && longitude) {
      filteredTournaments = tournaments.filter(tournament => {
        if (!tournament.latitude || !tournament.longitude) return false;

        // Haversine distance calculation
        const R = 6371; // Earth's radius in km
        const dLat = (tournament.latitude - Number(latitude)) * Math.PI / 180;
        const dLon = (tournament.longitude - Number(longitude)) * Math.PI / 180;
        const a =
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(Number(latitude) * Math.PI / 180) * Math.cos(tournament.latitude * Math.PI / 180) *
          Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;

        return distance <= Number(radius);
      });
    }

    const result = {
      tournaments: filteredTournaments,
      totalCount: filteredTournaments.length,
      limit: Number(limit),
      offset: Number(offset),
      hasMore: filteredTournaments.length === Number(limit)
    };

    // Cache the result
    await cacheService.set(cacheKey, result, 300); // 5 minutes

    const duration = Date.now() - startTime;
    performanceService.recordQueryTime(duration);

    res.json({
      success: true,
      data: result,
      cached: false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching tournaments:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch tournaments'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/tournaments/:id
 * Get detailed tournament information
 */
router.get('/:id', [
  param('id').isString().notEmpty(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = getTournamentCacheKey(id);

    // Check cache first
    const cachedResult = await cacheService.get(cacheKey);
    if (cachedResult) {
      console.log('✅ Tournament detail cache hit');
      performanceService.recordCacheHit();
      return res.json({
        success: true,
        data: cachedResult,
        cached: true,
        timestamp: new Date().toISOString()
      });
    }

    const tournament = await (prisma as any).tournament.findUnique({
      where: { id },
      include: {
        players: {
          select: {
            id: true,
            playerName: true,
            status: true,
            seed: true,
            currentRound: true,
            isEliminated: true
          }
        },
        rounds: {
          orderBy: { roundNumber: 'asc' },
          include: {
            matches: {
              include: {
                player1: { select: { playerName: true } },
                player2: { select: { playerName: true } }
              }
            }
          }
        },
        matches: {
          where: { status: { not: TournamentMatchStatus.CANCELLED } },
          include: {
            player1: { select: { playerName: true } },
            player2: { select: { playerName: true } },
            round: { select: { roundName: true } }
          },
          orderBy: { scheduledAt: 'asc' }
        },
        results: true,
        _count: {
          select: {
            players: true,
            matches: true,
            rounds: true
          }
        }
      }
    });

    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TOURNAMENT_NOT_FOUND',
          message: 'Tournament not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Cache the result
    await cacheService.set(cacheKey, tournament, 600); // 10 minutes

    res.json({
      success: true,
      data: { tournament },
      cached: false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching tournament:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch tournament'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/v1/tournaments
 * Create a new tournament
 */
router.post('/', [
  body('name').isString().isLength({ min: 3, max: 100 }),
  body('description').optional().isString().isLength({ max: 1000 }),
  body('tournamentType').optional().isIn(['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'SWISS', 'MIXED']),
  body('maxPlayers').optional().isInt({ min: 2, max: 128 }),
  body('startDate').isISO8601(),
  body('registrationDeadline').isISO8601(),
  body('venueName').optional().isString().isLength({ max: 200 }),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('entryFee').optional().isFloat({ min: 0 }),
  body('organizerName').isString().isLength({ min: 2, max: 100 }),
  body('organizerEmail').optional().isEmail(),
  body('visibility').optional().isIn(['PUBLIC', 'PRIVATE', 'INVITATION_ONLY']),
  handleValidationErrors
], async (req, res) => {
  try {
    const tournamentData = {
      ...req.body,
      status: TournamentStatus.DRAFT,
      tournamentType: req.body.tournamentType || TournamentType.SINGLE_ELIMINATION,
      maxPlayers: req.body.maxPlayers || 32,
      visibility: req.body.visibility || 'PUBLIC',
      entryFee: req.body.entryFee || 0
    };

    const tournament = await (prisma as any).tournament.create({
      data: tournamentData,
      include: {
        _count: {
          select: { players: true }
        }
      }
    });

    // Invalidate tournaments cache
    await cacheService.clear();

    res.status(201).json({
      success: true,
      data: { tournament },
      message: 'Tournament created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error creating tournament:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create tournament'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * PUT /api/v1/tournaments/:id
 * Update tournament details
 */
router.put('/:id', [
  param('id').isString().notEmpty(),
  body('name').optional().isString().isLength({ min: 3, max: 100 }),
  body('description').optional().isString().isLength({ max: 1000 }),
  body('status').optional().isIn(['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  body('venueName').optional().isString().isLength({ max: 200 }),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;

    const tournament = await (prisma as any).tournament.update({
      where: { id },
      data: req.body,
      include: {
        _count: {
          select: { players: true }
        }
      }
    });

    // Invalidate caches
    await cacheService.delete(getTournamentCacheKey(id));
    await cacheService.clear(); // Clear tournaments list cache

    res.json({
      success: true,
      data: { tournament },
      message: 'Tournament updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error updating tournament:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TOURNAMENT_NOT_FOUND',
          message: 'Tournament not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update tournament'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * DELETE /api/v1/tournaments/:id
 * Delete a tournament (only if no players registered)
 */
router.delete('/:id', [
  param('id').isString().notEmpty(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;

    // Check if tournament has registered players
    const playerCount = await (prisma as any).tournamentPlayer.count({
      where: { tournamentId: id }
    });

    if (playerCount > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOURNAMENT_HAS_PLAYERS',
          message: 'Cannot delete tournament with registered players'
        },
        timestamp: new Date().toISOString()
      });
    }

    await (prisma as any).tournament.delete({
      where: { id }
    });

    // Clear caches
    await cacheService.delete(getTournamentCacheKey(id));
    await cacheService.clear();

    res.json({
      success: true,
      message: 'Tournament deleted successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error deleting tournament:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TOURNAMENT_NOT_FOUND',
          message: 'Tournament not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete tournament'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// ============================
// PLAYER REGISTRATION
// ============================

/**
 * POST /api/v1/tournaments/:id/register
 * Register a player for a tournament
 */
router.post('/:id/register', [
  param('id').isString().notEmpty(),
  body('playerName').isString().isLength({ min: 2, max: 100 }),
  body('email').optional().isEmail(),
  body('phone').optional().isString().isLength({ max: 20 }),
  body('deviceId').optional().isString(),
  body('skillLevel').optional().isIn(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { playerName, email, phone, deviceId, skillLevel } = req.body;

    // Check if tournament exists and is accepting registrations
    const tournament = await (prisma as any).tournament.findUnique({
      where: { id },
      include: { _count: { select: { players: true } } }
    });

    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TOURNAMENT_NOT_FOUND',
          message: 'Tournament not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (tournament.status !== TournamentStatus.REGISTRATION_OPEN) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'REGISTRATION_CLOSED',
          message: 'Tournament registration is not open'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (tournament._count.players >= tournament.maxPlayers) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOURNAMENT_FULL',
          message: 'Tournament is full'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check for duplicate registration
    if (deviceId) {
      const existingPlayer = await (prisma as any).tournamentPlayer.findUnique({
        where: {
          tournamentId_deviceId: {
            tournamentId: id,
            deviceId
          }
        }
      });

      if (existingPlayer) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'ALREADY_REGISTERED',
            message: 'Device already registered for this tournament'
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    // Check for duplicate player name
    const existingName = await (prisma as any).tournamentPlayer.findUnique({
      where: {
        tournamentId_playerName: {
          tournamentId: id,
          playerName
        }
      }
    });

    if (existingName) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'NAME_EXISTS',
          message: 'Player name already exists in this tournament'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Register the player
    const player = await (prisma as any).tournamentPlayer.create({
      data: {
        tournamentId: id,
        playerName,
        email,
        phone,
        deviceId,
        skillLevel,
        status: TournamentPlayerStatus.REGISTERED
      }
    });

    // Invalidate tournament cache
    await cacheService.delete(getTournamentCacheKey(id));

    res.status(201).json({
      success: true,
      data: { player },
      message: 'Player registered successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error registering player:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to register player'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/tournaments/:id/players
 * Get tournament players
 */
router.get('/:id/players', [
  param('id').isString().notEmpty(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;

    const players = await (prisma as any).tournamentPlayer.findMany({
      where: { tournamentId: id },
      orderBy: [
        { seed: 'asc' },
        { registeredAt: 'asc' }
      ]
    });

    res.json({
      success: true,
      data: { players },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching tournament players:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch tournament players'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// ============================
// BRACKET MANAGEMENT
// ============================

/**
 * POST /api/v1/tournaments/:id/bracket
 * Generate tournament bracket
 */
router.post('/:id/bracket', [
  param('id').isString().notEmpty(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;

    // Check tournament status
    const tournament = await (prisma as any).tournament.findUnique({
      where: { id },
      include: {
        players: {
          where: { status: TournamentPlayerStatus.CONFIRMED },
          orderBy: { seed: 'asc' }
        }
      }
    });

    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TOURNAMENT_NOT_FOUND',
          message: 'Tournament not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (tournament.status !== TournamentStatus.REGISTRATION_CLOSED) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: 'Tournament must be in REGISTRATION_CLOSED status to generate bracket'
        },
        timestamp: new Date().toISOString()
      });
    }

    const playerCount = tournament.players.length;
    if (playerCount < tournament.minPlayers) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PLAYERS',
          message: `Need at least ${tournament.minPlayers} players, currently have ${playerCount}`
        },
        timestamp: new Date().toISOString()
      });
    }

    // Bracket generation logic would go here
    // For now, return a placeholder response
    res.json({
      success: true,
      data: {
        bracketGenerated: true,
        rounds: [],
        matches: []
      },
      message: 'Bracket generation initiated',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating bracket:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to generate bracket'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/tournaments/:id/bracket
 * Get tournament bracket
 */
router.get('/:id/bracket', [
  param('id').isString().notEmpty(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;

    const rounds = await (prisma as any).tournamentRound.findMany({
      where: { tournamentId: id },
      include: {
        matches: {
          include: {
            player1: { select: { playerName: true, seed: true } },
            player2: { select: { playerName: true, seed: true } }
          },
          orderBy: { matchNumber: 'asc' }
        }
      },
      orderBy: { roundNumber: 'asc' }
    });

    res.json({
      success: true,
      data: { rounds },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching bracket:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch bracket'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// ============================
// LIVE SCORING
// ============================

/**
 * PUT /api/v1/tournaments/matches/:matchId/score
 * Update match score
 */
router.put('/matches/:matchId/score', [
  param('matchId').isString().notEmpty(),
  body('player1GamesWon').isInt({ min: 0 }),
  body('player2GamesWon').isInt({ min: 0 }),
  body('gameScores').optional().isArray(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { matchId } = req.params;
    const { player1GamesWon, player2GamesWon, gameScores } = req.body;

    const match = await (prisma as any).tournamentMatch.update({
      where: { id: matchId },
      data: {
        player1GamesWon,
        player2GamesWon,
        gameScores: gameScores ? JSON.stringify(gameScores) : undefined,
        status: (player1GamesWon >= 2 || player2GamesWon >= 2) ?
          TournamentMatchStatus.COMPLETED : TournamentMatchStatus.IN_PROGRESS
      },
      include: {
        player1: { select: { playerName: true } },
        player2: { select: { playerName: true } }
      }
    });

    // Determine winner if match is complete
    let winnerId = null;
    if (match.status === TournamentMatchStatus.COMPLETED) {
      winnerId = player1GamesWon > player2GamesWon ? match.player1Id : match.player2Id;
      await (prisma as any).tournamentMatch.update({
        where: { id: matchId },
        data: { winnerId }
      });
    }

    // Invalidate tournament cache
    const tournament = await (prisma as any).tournamentMatch.findUnique({
      where: { id: matchId },
      select: { tournamentId: true }
    });

    if (tournament) {
      await cacheService.delete(getTournamentCacheKey(tournament.tournamentId));
    }

    res.json({
      success: true,
      data: { match: { ...match, winnerId } },
      message: 'Match score updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error updating match score:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'MATCH_NOT_FOUND',
          message: 'Match not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update match score'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/tournaments/:id/live
 * Get live tournament status
 */
router.get('/:id/live', [
  param('id').isString().notEmpty(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;

    const tournament = await (prisma as any).tournament.findUnique({
      where: { id },
      include: {
        matches: {
          where: {
            status: {
              in: [TournamentMatchStatus.IN_PROGRESS, TournamentMatchStatus.SCHEDULED]
            }
          },
          include: {
            player1: { select: { playerName: true } },
            player2: { select: { playerName: true } },
            round: { select: { roundName: true } }
          },
          orderBy: { scheduledAt: 'asc' }
        },
        _count: {
          select: {
            players: true
          }
        }
      }
    });

    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TOURNAMENT_NOT_FOUND',
          message: 'Tournament not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const liveData = {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        currentRound: tournament.rounds?.length || 0
      },
      activeMatches: tournament.matches.filter(m => m.status === TournamentMatchStatus.IN_PROGRESS),
      upcomingMatches: tournament.matches.filter(m => m.status === TournamentMatchStatus.SCHEDULED),
      playerCount: tournament._count.players
    };

    res.json({
      success: true,
      data: liveData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching live tournament data:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch live tournament data'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;