import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticateToken, getCurrentUser } from '../middleware/auth';
import { body, param, query, validationResult } from 'express-validator';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string | null;
    role: string;
  };
}

const router = Router();

// Validation middleware
const getHistoryValidation = [
  query('deviceId').optional().isLength({ min: 1 }).withMessage('Device ID is required for filtering'),
  query('filter').optional().isIn(['all', 'organized', 'participated']).withMessage('Invalid filter type'),
  query('sortBy').optional().isIn(['date', 'games', 'duration', 'players']).withMessage('Invalid sort field'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
];

const createGameValidation = [
  param('sessionId').isLength({ min: 1 }).withMessage('Session ID is required'),
  body('courtName').optional().isLength({ max: 50 }).withMessage('Court name too long'),
  body('team1Player1').isLength({ min: 1, max: 100 }).withMessage('Team 1 Player 1 name required'),
  body('team1Player2').isLength({ min: 1, max: 100 }).withMessage('Team 1 Player 2 name required'),
  body('team2Player1').isLength({ min: 1, max: 100 }).withMessage('Team 2 Player 1 name required'),
  body('team2Player2').isLength({ min: 1, max: 100 }).withMessage('Team 2 Player 2 name required')
];

const updateGameValidation = [
  param('gameId').isLength({ min: 1 }).withMessage('Game ID is required'),
  body('team1FinalScore').optional().isInt({ min: 0 }).withMessage('Team 1 score must be non-negative'),
  body('team2FinalScore').optional().isInt({ min: 0 }).withMessage('Team 2 score must be non-negative'),
  body('winnerTeam').optional().isIn([1, 2]).withMessage('Winner team must be 1 or 2'),
  body('status').optional().isIn(['IN_PROGRESS', 'COMPLETED', 'PAUSED', 'CANCELLED']).withMessage('Invalid status')
];

// Optional authentication middleware for enhanced features
const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    // If auth header present, validate it
    return authenticateToken(req, res, next);
  } else {
    // Otherwise continue without user info
    return next();
  }
};

// Get session history for a device/user
router.get('/', optionalAuth, getHistoryValidation, async (req: AuthRequest, res: Response) => {
  try {
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

    const {
      deviceId,
      filter = 'all',
      sortBy = 'date',
      limit = 20,
      offset = 0
    } = req.query;

    // Build query conditions
    let whereConditions: any = {
      status: {
        in: ['COMPLETED', 'CANCELLED'] // Only show finished sessions
      }
    };

    // Apply filtering based on authentication status and filter type
    const currentUser = getCurrentUser(req);
    
    if (currentUser && filter !== 'all') {
      // Authenticated user - filter by user account
      if (filter === 'organized') {
        // Find sessions owned by the authenticated user
        const userSessions = await prisma.session.findMany({
          where: { ownerId: currentUser.id },
          select: { id: true }
        });
        const sessionIds = userSessions.map(s => s.id);
        whereConditions.id = { in: sessionIds };
      } else if (filter === 'participated') {
        // Find sessions where user participated
        const participatedSessions = await prisma.sessionPlayer.findMany({
          where: { userId: currentUser.id },
          select: { sessionId: true }
        });
        const sessionIds = participatedSessions.map(s => s.sessionId);
        whereConditions.id = { in: sessionIds };
      }
    } else if (deviceId && filter !== 'all') {
      // Anonymous user - filter by device ID
      if (filter === 'organized') {
        whereConditions.ownerDeviceId = deviceId as string;
      } else if (filter === 'participated') {
        whereConditions.players = {
          some: {
            deviceId: deviceId as string
          }
        };
      }
    }

    // Build order clause
    let orderBy: any = {};
    switch (sortBy) {
      case 'date':
        orderBy = { scheduledAt: 'desc' };
        break;
      case 'games':
        orderBy = { games: { _count: 'desc' } };
        break;
      case 'duration':
        // Calculate duration based on earliest and latest game times
        orderBy = { scheduledAt: 'desc' }; // Fallback to date for now
        break;
      case 'players':
        orderBy = { players: { _count: 'desc' } };
        break;
      default:
        orderBy = { scheduledAt: 'desc' };
    }

    // Fetch sessions with related data
    const sessions = await prisma.mvpSession.findMany({
      where: whereConditions,
      include: {
        players: {
          orderBy: { wins: 'desc' } // Order players by performance
        },
        games: {
          include: {
            sets: {
              orderBy: { setNumber: 'asc' }
            }
          },
          orderBy: { gameNumber: 'asc' }
        }
      },
      orderBy,
      take: parseInt(limit as string),
      skip: parseInt(offset as string)
    });

    // Calculate additional statistics for each session
    const enrichedSessions = sessions.map(session => {
      // Calculate session duration
      let sessionDuration = 'Unknown';
      if (session.games.length > 0) {
        const firstGame = session.games.find(g => g.startTime);
        const lastGame = session.games.slice().reverse().find(g => g.endTime);
        
        if (firstGame?.startTime && lastGame?.endTime) {
          const durationMs = new Date(lastGame.endTime).getTime() - new Date(firstGame.startTime).getTime();
          const hours = Math.floor(durationMs / (1000 * 60 * 60));
          const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
          sessionDuration = hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
        }
      }

      // Calculate player statistics with win rates
      const playersWithStats = session.players.map(player => ({
        id: player.id,
        name: player.name,
        gamesPlayed: player.gamesPlayed,
        wins: player.wins,
        losses: player.losses,
        winRate: player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0,
        status: player.status
      }));

      // Format game results
      const gameResults = session.games.map(game => ({
        id: game.id,
        gameNumber: game.gameNumber,
        courtName: game.courtName,
        team1Players: [game.team1Player1, game.team1Player2],
        team2Players: [game.team2Player1, game.team2Player2],
        team1Score: game.team1FinalScore,
        team2Score: game.team2FinalScore,
        winnerTeam: game.winnerTeam,
        duration: game.duration ? `${game.duration} min` : 'Unknown',
        startTime: game.startTime,
        endTime: game.endTime,
        sets: game.sets.map(set => ({
          setNumber: set.setNumber,
          team1Score: set.team1Score,
          team2Score: set.team2Score,
          winnerTeam: set.winnerTeam,
          isCompleted: set.isCompleted
        }))
      }));

      return {
        id: session.id,
        name: session.name,
        date: session.scheduledAt,
        location: session.location || 'Location TBD',
        duration: sessionDuration,
        playerCount: session.players.length,
        totalGames: session.games.length,
        organizer: session.ownerName,
        status: session.status,
        shareCode: session.shareCode,
        players: playersWithStats,
        games: gameResults
      };
    });

    // Get total count for pagination
    const totalCount = await prisma.mvpSession.count({
      where: whereConditions
    });

    res.json({
      success: true,
      data: {
        sessions: enrichedSessions,
        pagination: {
          total: totalCount,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          hasMore: parseInt(offset as string) + parseInt(limit as string) < totalCount
        },
        userInfo: currentUser ? {
          id: currentUser.id,
          email: currentUser.email,
          role: currentUser.role
        } : null,
        isAuthenticated: !!currentUser
      },
      message: 'Session history retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get session history error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve session history'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Get detailed history for a specific session
router.get('/:sessionId', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.mvpSession.findUnique({
      where: { id: sessionId },
      include: {
        players: {
          orderBy: { wins: 'desc' }
        },
        games: {
          include: {
            sets: {
              orderBy: { setNumber: 'asc' }
            }
          },
          orderBy: { gameNumber: 'asc' }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Calculate session duration
    let sessionDuration = 'Unknown';
    if (session.games.length > 0) {
      const firstGame = session.games.find(g => g.startTime);
      const lastGame = session.games.slice().reverse().find(g => g.endTime);
      
      if (firstGame?.startTime && lastGame?.endTime) {
        const durationMs = new Date(lastGame.endTime).getTime() - new Date(firstGame.startTime).getTime();
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        sessionDuration = hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
      }
    }

    // Enhanced player statistics
    const playersWithStats = session.players.map(player => {
      // Calculate additional metrics
      const winRate = player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0;
      
      // Find games this player participated in
      const playerGames = session.games.filter(game => 
        game.team1Player1 === player.name || 
        game.team1Player2 === player.name || 
        game.team2Player1 === player.name || 
        game.team2Player2 === player.name
      );

      return {
        id: player.id,
        name: player.name,
        gamesPlayed: player.gamesPlayed,
        wins: player.wins,
        losses: player.losses,
        winRate,
        status: player.status,
        joinedAt: player.joinedAt,
        participatedGames: playerGames.length
      };
    });

    // Detailed game results with set information
    const gameResults = session.games.map(game => ({
      id: game.id,
      gameNumber: game.gameNumber,
      courtName: game.courtName || `Court ${game.gameNumber}`,
      team1Players: [game.team1Player1, game.team1Player2],
      team2Players: [game.team2Player1, game.team2Player2],
      team1Score: game.team1FinalScore,
      team2Score: game.team2FinalScore,
      winnerTeam: game.winnerTeam,
      duration: game.duration ? `${game.duration} min` : 'Unknown',
      startTime: game.startTime,
      endTime: game.endTime,
      status: game.status,
      sets: game.sets.map(set => ({
        setNumber: set.setNumber,
        team1Score: set.team1Score,
        team2Score: set.team2Score,
        winnerTeam: set.winnerTeam,
        isCompleted: set.isCompleted
      }))
    }));

    const sessionHistory = {
      id: session.id,
      name: session.name,
      date: session.scheduledAt,
      location: session.location || 'Location TBD',
      duration: sessionDuration,
      playerCount: session.players.length,
      totalGames: session.games.length,
      organizer: session.ownerName,
      status: session.status,
      shareCode: session.shareCode,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      players: playersWithStats,
      games: gameResults,
      // Summary statistics
      summary: {
        totalSets: session.games.reduce((acc, game) => acc + game.sets.length, 0),
        averageGameDuration: session.games.length > 0 ? 
          Math.round(session.games.reduce((acc, game) => acc + (game.duration || 0), 0) / session.games.length) : 0,
        topPerformer: playersWithStats.length > 0 ? playersWithStats[0].name : null,
        mostActivePlayer: playersWithStats.reduce((prev, current) => 
          (prev.gamesPlayed > current.gamesPlayed) ? prev : current, playersWithStats[0]
        )?.name || null
      }
    };

    res.json({
      success: true,
      data: { session: sessionHistory },
      message: 'Session details retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get session detail error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve session details'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Create a new game within a session
router.post('/sessions/:sessionId/games', createGameValidation, async (req: Request, res: Response) => {
  try {
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

    const { sessionId } = req.params;
    const {
      courtName,
      team1Player1,
      team1Player2,
      team2Player1,
      team2Player2
    } = req.body;

    // Verify session exists and is active
    const session = await prisma.mvpSession.findUnique({
      where: { id: sessionId },
      include: { games: true }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (session.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SESSION_NOT_ACTIVE',
          message: 'Cannot create games in inactive session'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Calculate next game number
    const gameNumber = (session.games.length || 0) + 1;

    // Create the game
    const game = await prisma.mvpGame.create({
      data: {
        sessionId,
        courtName: courtName || `Court ${gameNumber}`,
        gameNumber,
        team1Player1,
        team1Player2,
        team2Player1,
        team2Player2,
        startTime: new Date(),
        status: 'IN_PROGRESS'
      }
    });

    // Create initial set
    await prisma.mvpGameSet.create({
      data: {
        gameId: game.id,
        setNumber: 1,
        team1Score: 0,
        team2Score: 0,
        isCompleted: false
      }
    });

    res.status(201).json({
      success: true,
      data: { game },
      message: 'Game created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Create game error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create game'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Update game results
router.put('/games/:gameId', updateGameValidation, async (req: Request, res: Response) => {
  try {
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

    const { gameId } = req.params;
    const updateData: any = req.body;

    // If completing the game, set end time and duration
    if (updateData.status === 'COMPLETED' && !updateData.endTime) {
      updateData.endTime = new Date();
    }

    const game = await prisma.mvpGame.update({
      where: { id: gameId },
      data: updateData,
      include: {
        sets: true,
        session: {
          include: {
            players: true
          }
        }
      }
    });

    // If game is completed, update player statistics
    if (updateData.status === 'COMPLETED' && updateData.winnerTeam) {
      const session = game.session;
      const winnerTeam = updateData.winnerTeam;
      
      // Get player names for each team
      const team1Players = [game.team1Player1, game.team1Player2];
      const team2Players = [game.team2Player1, game.team2Player2];
      
      // Update statistics for all players
      const allGamePlayers = [...team1Players, ...team2Players];
      
      for (const playerName of allGamePlayers) {
        const player = session.players.find(p => p.name === playerName);
        if (player) {
          const isWinner = (winnerTeam === 1 && team1Players.includes(playerName)) ||
                          (winnerTeam === 2 && team2Players.includes(playerName));
          
          await prisma.mvpPlayer.update({
            where: { id: player.id },
            data: {
              gamesPlayed: { increment: 1 },
              wins: isWinner ? { increment: 1 } : player.wins,
              losses: !isWinner ? { increment: 1 } : player.losses
            }
          });
        }
      }

      // Calculate and update duration if not provided
      if (game.startTime && game.endTime) {
        const durationMs = new Date(game.endTime).getTime() - new Date(game.startTime).getTime();
        const durationMinutes = Math.round(durationMs / (1000 * 60));
        
        await prisma.mvpGame.update({
          where: { id: gameId },
          data: { duration: durationMinutes }
        });
      }
    }

    res.json({
      success: true,
      data: { game },
      message: 'Game updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Update game error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update game'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Get player statistics across all sessions
router.get('/players/:deviceId/stats', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;

    // Get all sessions where this device participated
    const sessions = await prisma.mvpSession.findMany({
      where: {
        players: {
          some: {
            deviceId: deviceId
          }
        }
      },
      include: {
        players: {
          where: {
            deviceId: deviceId
          }
        },
        games: {
          where: {
            status: 'COMPLETED'
          }
        }
      }
    });

    // Calculate aggregate statistics
    const totalSessions = sessions.length;
    const totalGamesPlayed = sessions.reduce((acc, session) => 
      acc + (session.players[0]?.gamesPlayed || 0), 0
    );
    const totalWins = sessions.reduce((acc, session) => 
      acc + (session.players[0]?.wins || 0), 0
    );
    const totalLosses = sessions.reduce((acc, session) => 
      acc + (session.players[0]?.losses || 0), 0
    );

    const overallWinRate = totalGamesPlayed > 0 ? Math.round((totalWins / totalGamesPlayed) * 100) : 0;

    // Recent performance (last 5 sessions)
    const recentSessions = sessions.slice(-5);
    const recentWins = recentSessions.reduce((acc, session) => 
      acc + (session.players[0]?.wins || 0), 0
    );
    const recentGames = recentSessions.reduce((acc, session) => 
      acc + (session.players[0]?.gamesPlayed || 0), 0
    );
    const recentWinRate = recentGames > 0 ? Math.round((recentWins / recentGames) * 100) : 0;

    // Find favorite playing partners (players they've played with most)
    const partnerStats = new Map();
    sessions.forEach(session => {
      session.games.forEach(game => {
        const playerName = session.players[0]?.name;
        if (!playerName) return;

        // Check which team the player was on and identify partners
        if (game.team1Player1 === playerName || game.team1Player2 === playerName) {
          const partner = game.team1Player1 === playerName ? game.team1Player2 : game.team1Player1;
          partnerStats.set(partner, (partnerStats.get(partner) || 0) + 1);
        } else if (game.team2Player1 === playerName || game.team2Player2 === playerName) {
          const partner = game.team2Player1 === playerName ? game.team2Player2 : game.team2Player1;
          partnerStats.set(partner, (partnerStats.get(partner) || 0) + 1);
        }
      });
    });

    const favoritePartners = Array.from(partnerStats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    res.json({
      success: true,
      data: {
        playerStats: {
          totalSessions,
          totalGamesPlayed,
          totalWins,
          totalLosses,
          overallWinRate,
          recentWinRate,
          favoritePartners,
          sessionsHistory: sessions.map(session => ({
            sessionId: session.id,
            sessionName: session.name,
            date: session.scheduledAt,
            gamesPlayed: session.players[0]?.gamesPlayed || 0,
            wins: session.players[0]?.wins || 0,
            losses: session.players[0]?.losses || 0,
            winRate: session.players[0]?.gamesPlayed > 0 ? 
              Math.round(((session.players[0]?.wins || 0) / session.players[0]?.gamesPlayed) * 100) : 0
          }))
        }
      },
      message: 'Player statistics retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get player stats error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve player statistics'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;