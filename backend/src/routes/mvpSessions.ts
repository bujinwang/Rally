import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { body, param, validationResult } from 'express-validator';
import { generateOptimalRotation, getRotationExplanation } from '../utils/rotationAlgorithm';
import { updatePlayerGameStatistics, updatePlayerMatchStatistics, getPlayerStatistics, getSessionStatistics, getSessionLeaderboard } from '../utils/statisticsService';
import { io } from '../server';

const router = Router();

// Get all active sessions (for discovery)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status = 'ACTIVE', limit = 50, offset = 0 } = req.query;

    const sessions = await prisma.mvpSession.findMany({
      where: {
        status: (status as 'ACTIVE' | 'COMPLETED' | 'CANCELLED') || 'ACTIVE'
      },
      include: {
        players: {
          select: {
            id: true,
            name: true,
            status: true,
            joinedAt: true
          },
          orderBy: {
            joinedAt: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: parseInt(limit as string),
      skip: parseInt(offset as string)
    });

    const formattedSessions = sessions.map(session => ({
      id: session.id,
      name: session.name,
      shareCode: session.shareCode,
      scheduledAt: session.scheduledAt,
      location: session.location,
      maxPlayers: session.maxPlayers,
      skillLevel: session.skillLevel,
      cost: session.cost,
      description: session.description,
      ownerName: session.ownerName,
      status: session.status,
      playerCount: session.players?.length || 0,
      players: session.players || [],
      createdAt: session.createdAt
    }));

    res.json({
      success: true,
      data: {
        sessions: formattedSessions
      },
      message: `Retrieved ${formattedSessions.length} session(s)`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve sessions'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Get session by share code
router.get('/:shareCode', async (req, res) => {
  try {
    const { shareCode } = req.params;

    const session = await prisma.mvpSession.findFirst({
      where: {
        shareCode: shareCode,
        // Don't filter by status to allow access to all sessions
      },
      include: {
        players: {
          select: {
            id: true,
            name: true,
            deviceId: true,
            status: true,
            joinedAt: true,
            gamesPlayed: true,
            wins: true,
            losses: true,
            matchesPlayed: true,
            matchWins: true,
            matchLosses: true,
            totalSetsWon: true,
            totalSetsLost: true,
            totalPlayTime: true,
            winRate: true,
            matchWinRate: true,
            averageGameDuration: true,
            restGamesRemaining: true,
            restRequestedAt: true,
            restRequestedBy: true,
            partnershipStats: true
          },
          orderBy: {
            joinedAt: 'asc'
          }
        },
        games: {
          orderBy: {
            gameNumber: 'desc'
          }
        },
        matches: {
          include: {
            games: {
              orderBy: { gameInMatch: 'asc' }
            }
          },
          orderBy: { matchNumber: 'desc' }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found with the provided share code'
        },
        timestamp: new Date().toISOString()
      });
    }

    const formattedSession = {
      id: session.id,
      name: session.name,
      shareCode: session.shareCode,
      scheduledAt: session.scheduledAt,
      location: session.location,
      maxPlayers: session.maxPlayers,
      courtCount: session.courtCount, // Include courtCount to prevent stale data
      skillLevel: session.skillLevel,
      cost: session.cost,
      description: session.description,
      ownerName: session.ownerName,
      ownerDeviceId: session.ownerDeviceId,
      status: session.status,
      playerCount: session.players?.length || 0,
      players: session.players || [],
      games: session.games || [],
      matches: session.matches || [],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };

    res.json({
      success: true,
      data: {
        session: formattedSession
      },
      message: 'Session retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve session'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Validation middleware
const createSessionValidation = [
  body('name').optional().isLength({ min: 1, max: 200 }).withMessage('Session name must be valid if provided'),
  body('scheduledAt').isISO8601().withMessage('Valid date/time required'),
  body('location').optional().isLength({ max: 255 }),
  body('maxPlayers').optional().isInt({ min: 2, max: 50 }).withMessage('Max players must be between 2 and 50'),
  body('ownerName').isLength({ min: 1, max: 100 }).withMessage('Owner name is required'),
  body('ownerDeviceId').optional().isLength({ max: 255 })
];

const joinSessionValidation = [
  param('shareCode').isLength({ min: 1 }).withMessage('Share code is required'),
  body('name').isLength({ min: 1, max: 100 }).withMessage('Player name is required'),
  body('deviceId').optional().isLength({ max: 255 })
];

// Generate short share code
function generateShareCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Create new MVP session (no auth required)
router.post('/', createSessionValidation, async (req: Request, res: Response) => {
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

    const sessionData = req.body;
    let shareCode = generateShareCode();

    // Ensure unique share code
    while (await prisma.mvpSession.findUnique({ where: { shareCode } })) {
      shareCode = generateShareCode();
    }

    const session = await prisma.mvpSession.create({
      data: {
        name: sessionData.name,
        scheduledAt: new Date(sessionData.scheduledAt),
        location: sessionData.location,
        maxPlayers: sessionData.maxPlayers || 20, // Use the value from frontend, default to 20
        ownerName: sessionData.ownerName,
        ownerDeviceId: sessionData.ownerDeviceId,
        shareCode,
        status: 'ACTIVE'
      }
    });

    // Auto-join the owner as first player
    await prisma.mvpPlayer.create({
      data: {
        sessionId: session.id,
        name: sessionData.ownerName,
        deviceId: sessionData.ownerDeviceId,
        status: 'ACTIVE'
      }
    });

    // Fetch the session with players to return complete data
    const sessionWithPlayers = await prisma.mvpSession.findUnique({
      where: { id: session.id },
      include: {
        players: {
          orderBy: { joinedAt: 'asc' }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: {
        session: {
          id: session.id,
          name: session.name,
          shareCode: session.shareCode,
          scheduledAt: session.scheduledAt,
          location: session.location,
          maxPlayers: session.maxPlayers,
          status: session.status,
          ownerName: session.ownerName,
          playerCount: sessionWithPlayers?.players.length || 1,
          players: sessionWithPlayers?.players.map(player => ({
            id: player.id,
            name: player.name,
            status: player.status,
            gamesPlayed: player.gamesPlayed,
            wins: player.wins,
            losses: player.losses,
            joinedAt: player.joinedAt
          })) || [],
          shareUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/join.html?code=${session.shareCode}`,
          createdAt: session.createdAt
        }
      },
      message: 'Session created successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Create MVP session error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create session'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Get session by share code (public access)
router.get('/join/:shareCode', async (req, res) => {
  try {
    const { shareCode } = req.params;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: {
        players: {
          orderBy: { joinedAt: 'asc' }
        },
        games: {
          orderBy: { gameNumber: 'desc' }
        },
        matches: {
          include: {
            games: {
              orderBy: { gameInMatch: 'asc' }
            }
          },
          orderBy: { matchNumber: 'desc' }
        }
      }
    });

    // Add debugging to see what's actually in the database
    console.log('🔍 DEBUG: Session data from database:', {
      shareCode,
      sessionId: session?.id,
      ownerName: session?.ownerName,
      ownerDeviceId: session?.ownerDeviceId,
      ownerDeviceIdType: typeof session?.ownerDeviceId,
      ownerDeviceIdIsNull: session?.ownerDeviceId === null,
      ownerDeviceIdIsUndefined: session?.ownerDeviceId === undefined
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
      return res.status(403).json({
        success: false,
        error: {
          code: 'SESSION_INACTIVE',
          message: 'Session is not active'
        },
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          name: session.name,
          shareCode: session.shareCode,
          scheduledAt: session.scheduledAt,
          location: session.location,
          maxPlayers: session.maxPlayers,
          courtCount: session.courtCount, // Include courtCount
          status: session.status,
          ownerName: session.ownerName,
          ownerDeviceId: session.ownerDeviceId,
          playerCount: session.players.length,
          players: session.players.map(player => ({
            id: player.id,
            name: player.name,
            deviceId: player.deviceId,
            status: player.status,
            gamesPlayed: player.gamesPlayed,
            wins: player.wins,
            losses: player.losses,
            matchesPlayed: player.matchesPlayed,
            matchWins: player.matchWins,
            matchLosses: player.matchLosses,
            totalSetsWon: player.totalSetsWon,
            totalSetsLost: player.totalSetsLost,
            totalPlayTime: player.totalPlayTime,
            winRate: player.winRate,
            matchWinRate: player.matchWinRate,
            averageGameDuration: player.averageGameDuration,
            restGamesRemaining: player.restGamesRemaining,
            restRequestedAt: player.restRequestedAt,
            restRequestedBy: player.restRequestedBy,
            partnershipStats: player.partnershipStats,
            joinedAt: player.joinedAt
          })),
          games: session.games || [],
          matches: session.matches || [],
          createdAt: session.createdAt
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get MVP session error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch session'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Join session
router.post('/join/:shareCode', joinSessionValidation, async (req: Request, res: Response) => {
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

    const { shareCode } = req.params;
    const { name, deviceId } = req.body;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: { players: true }
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
      return res.status(403).json({
        success: false,
        error: {
          code: 'SESSION_INACTIVE',
          message: 'Session is not active'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check if session is full
    if (session.players.length >= session.maxPlayers) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SESSION_FULL',
          message: 'Session is full'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check if player name already exists
    const existingPlayer = session.players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existingPlayer) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'NAME_EXISTS',
          message: 'A player with this name already exists in the session'
        },
        timestamp: new Date().toISOString()
      });
    }

    const player = await prisma.mvpPlayer.create({
      data: {
        sessionId: session.id,
        name,
        deviceId,
        status: 'ACTIVE'
      }
    });

    res.status(201).json({
      success: true,
      data: {
        player: {
          id: player.id,
          name: player.name,
          status: player.status,
          joinedAt: player.joinedAt
        }
      },
      message: 'Successfully joined session',
      timestamp: new Date().toISOString()
    });

    // Emit Socket.IO event to notify all connected clients about the session update
    try {
      // Get the updated session data with all players
      const updatedSession = await prisma.mvpSession.findUnique({
        where: { shareCode },
        include: { players: { orderBy: { joinedAt: 'asc' } } }
      });

      if (updatedSession) {
        // Import io from server dynamically to avoid circular dependency
        const { io } = await import('../server');
        io.to(`session-${shareCode}`).emit('mvp-session-updated', {
          session: updatedSession,
          timestamp: new Date().toISOString()
        });
        console.log(`📡 Socket.IO: Emitted session update for ${shareCode} - player "${name}" joined`);
      }
    } catch (error) {
      console.error('Failed to emit Socket.IO session update:', error);
      // Don't fail the request if Socket.IO fails
    }
  } catch (error) {
    console.error('Join MVP session error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to join session'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Update player status
router.put('/players/:playerId/status', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'RESTING', 'LEFT'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: 'Invalid player status'
        },
        timestamp: new Date().toISOString()
      });
    }

    const player = await prisma.mvpPlayer.update({
      where: { id: playerId },
      data: { status }
    });

    res.json({
      success: true,
      data: {
        player: {
          id: player.id,
          name: player.name,
          status: player.status,
          updatedAt: new Date().toISOString()
        }
      },
      message: 'Player status updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update player status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update player status'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Get sessions by owner device ID
router.get('/my-sessions/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    console.log('🔍 Get my sessions request:', { deviceId });

    const sessions = await prisma.mvpSession.findMany({
      where: {
        ownerDeviceId: deviceId,
        status: 'ACTIVE'
      },
      include: {
        players: {
          orderBy: { joinedAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log('📊 Found sessions for device:', { deviceId, sessionCount: sessions.length, sessions: sessions.map(s => ({ id: s.id, name: s.name, ownerDeviceId: s.ownerDeviceId })) });

    const formattedSessions = sessions.map(session => ({
      id: session.id,
      name: session.name,
      shareCode: session.shareCode,
      scheduledAt: session.scheduledAt,
      location: session.location,
      maxPlayers: session.maxPlayers,
      status: session.status,
      ownerName: session.ownerName,
      playerCount: session.players.length,
      players: session.players.map(player => ({
        id: player.id,
        name: player.name,
        status: player.status,
        gamesPlayed: player.gamesPlayed,
        wins: player.wins,
        losses: player.losses,
        joinedAt: player.joinedAt
      })),
      createdAt: session.createdAt,
      shareUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/join.html?code=${session.shareCode}`
    }));

    res.json({
      success: true,
      data: {
        sessions: formattedSessions
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get my sessions error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch sessions'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Update session settings (owner only)
router.put('/:shareCode', async (req, res) => {
  try {
    const { shareCode } = req.params;
    const { ownerDeviceId, courtCount, maxPlayers, location, description, skillLevel, cost } = req.body;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode }
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

    // Special case: Allow setting ownerDeviceId if it's currently null/undefined
    const canSetOwnerDeviceId = !session.ownerDeviceId && ownerDeviceId;
    
    // Check if the requester is the owner (if ownerDeviceId is provided and session already has one)
    if (ownerDeviceId && session.ownerDeviceId && session.ownerDeviceId !== ownerDeviceId) {
      console.log('🚫 Session update denied:', {
        providedDeviceId: ownerDeviceId,
        sessionOwnerDeviceId: session.ownerDeviceId,
        shareCode
      });
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the session owner can update the session'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // If no ownerDeviceId provided, allow update (for testing purposes)
    if (!ownerDeviceId) {
      console.log('⚠️ Session update without ownership check:', { shareCode });
    }

    // Build update data object with only provided fields
    const updateData: any = {};
    if (courtCount !== undefined) updateData.courtCount = courtCount;
    if (maxPlayers !== undefined) updateData.maxPlayers = maxPlayers;
    if (location !== undefined) updateData.location = location;
    if (description !== undefined) updateData.description = description;
    if (skillLevel !== undefined) updateData.skillLevel = skillLevel;
    if (cost !== undefined) updateData.cost = cost;
    
    // Allow setting ownerDeviceId if it's currently null/undefined
    if (canSetOwnerDeviceId) {
      updateData.ownerDeviceId = ownerDeviceId;
      console.log('✅ Setting ownerDeviceId for session:', { shareCode, ownerDeviceId });
      
      // Also update the owner player's deviceId if they don't have one
      const ownerPlayer = await prisma.mvpPlayer.findFirst({
        where: {
          sessionId: session.id,
          name: session.ownerName
        }
      });
      
      if (ownerPlayer && !ownerPlayer.deviceId) {
        await prisma.mvpPlayer.update({
          where: { id: ownerPlayer.id },
          data: { deviceId: ownerDeviceId }
        });
        console.log('✅ Also updated owner player deviceId:', { 
          playerId: ownerPlayer.id, 
          playerName: ownerPlayer.name, 
          deviceId: ownerDeviceId 
        });
      }
    }

    const updatedSession = await prisma.mvpSession.update({
      where: { shareCode },
      data: updateData,
      include: {
        players: {
          orderBy: { joinedAt: 'asc' }
        },
        games: {
          orderBy: { gameNumber: 'desc' }
        },
        matches: {
          include: {
            games: {
              orderBy: { gameInMatch: 'asc' }
            }
          },
          orderBy: { matchNumber: 'desc' }
        }
      }
    });

    // Emit real-time update to all clients in this session - ENSURE FRESH DATA
    try {
      const io = req.app.get('io');
      if (io) {
        // Force a fresh fetch to prevent stale data emission
        const freshSession = await prisma.mvpSession.findUnique({
          where: { shareCode },
          include: {
            players: {
              select: {
                id: true,
                name: true,
                deviceId: true,
                status: true,
                gamesPlayed: true,
                wins: true,
                losses: true,
                joinedAt: true
              },
              orderBy: { joinedAt: 'asc' }
            },
            games: {
              orderBy: { gameNumber: 'desc' }
            },
            matches: {
              include: {
                games: {
                  orderBy: { gameInMatch: 'asc' }
                }
              },
              orderBy: { matchNumber: 'desc' }
            }
          }
        });
        
        if (freshSession) {
          io.to(`session-${shareCode}`).emit('mvp-session-updated', {
            session: {
              id: freshSession.id,
              name: freshSession.name,
              scheduledAt: freshSession.scheduledAt,
              location: freshSession.location,
              maxPlayers: freshSession.maxPlayers,
              courtCount: freshSession.courtCount, // Fresh court count from database
              status: freshSession.status,
              ownerName: freshSession.ownerName,
              ownerDeviceId: freshSession.ownerDeviceId,
              shareCode: freshSession.shareCode,
              playerCount: freshSession.players.length,
              players: updatedSession.players.map(player => ({
                id: player.id,
                name: player.name,
                deviceId: player.deviceId,
                status: player.status,
                gamesPlayed: player.gamesPlayed,
                wins: player.wins,
                losses: player.losses,
                joinedAt: player.joinedAt
              })),
              games: freshSession.games || [],
              matches: freshSession.matches || [],
              createdAt: freshSession.createdAt
            },
            timestamp: new Date().toISOString()
          });
          console.log(`📡 Socket.IO: Emitted fresh session update for ${shareCode} with courtCount=${freshSession.courtCount}`);
        }
      }
    } catch (socketError) {
      console.error('Failed to emit fresh socket update:', socketError);
      // Don't fail the request if socket emission fails
    }

    res.json({
      success: true,
      data: {
        session: {
          id: updatedSession.id,
          name: updatedSession.name,
          scheduledAt: updatedSession.scheduledAt,
          location: updatedSession.location,
          maxPlayers: updatedSession.maxPlayers,
          courtCount: updatedSession.courtCount, // Include fresh courtCount in response
          status: updatedSession.status,
          ownerName: updatedSession.ownerName,
          ownerDeviceId: updatedSession.ownerDeviceId,
          shareCode: updatedSession.shareCode,
          playerCount: updatedSession.players.length,
          players: updatedSession.players.map(player => ({
            id: player.id,
            name: player.name,
            status: player.status,
            gamesPlayed: player.gamesPlayed,
            wins: player.wins,
            losses: player.losses,
            joinedAt: player.joinedAt
          })),
          games: updatedSession.games || [],
          matches: updatedSession.matches || [],
          createdAt: updatedSession.createdAt
        }
      },
      message: 'Session updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update session'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Terminate session (owner only)
router.put('/terminate/:shareCode', async (req, res) => {
  try {
    const { shareCode } = req.params;
    const { ownerDeviceId } = req.body;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode }
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

    // Check if the requester is the owner
    if (session.ownerDeviceId !== ownerDeviceId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the session owner can terminate the session'
        },
        timestamp: new Date().toISOString()
      });
    }

    const updatedSession = await prisma.mvpSession.update({
      where: { shareCode },
      data: { status: 'CANCELLED' }
    });

    res.json({
      success: true,
      data: {
        session: {
          id: updatedSession.id,
          status: updatedSession.status,
          updatedAt: updatedSession.updatedAt
        }
      },
      message: 'Session terminated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Terminate session error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to terminate session'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Reactivate session (owner only) - only if not past due and currently terminated
router.put('/reactivate/:shareCode', async (req, res) => {
  try {
    const { shareCode } = req.params;
    const { ownerDeviceId } = req.body;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode }
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

    // Check if the requester is the owner
    if (session.ownerDeviceId !== ownerDeviceId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the session owner can reactivate the session'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check if session is terminated
    if (session.status !== 'CANCELLED') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: 'Only terminated sessions can be reactivated'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check if session is not past due
    const now = new Date();
    const sessionTime = new Date(session.scheduledAt);
    if (sessionTime < now) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SESSION_PAST_DUE',
          message: 'Cannot reactivate a session that is past its scheduled time'
        },
        timestamp: new Date().toISOString()
      });
    }

    const updatedSession = await prisma.mvpSession.update({
      where: { shareCode },
      data: { status: 'ACTIVE' }
    });

    res.json({
      success: true,
      data: {
        session: {
          id: updatedSession.id,
          status: updatedSession.status,
          updatedAt: updatedSession.updatedAt
        }
      },
      message: 'Session reactivated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Reactivate session error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to reactivate session'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Remove player from session (owner only)
router.delete('/:shareCode/players/:playerId', async (req, res) => {
  try {
    const { shareCode, playerId } = req.params;
    const { deviceId: ownerDeviceId } = req.body;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode }
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

    // Check if the requester is the owner
    console.log('🔍 Remove player ownership check:', {
      sessionOwnerDeviceId: session.ownerDeviceId,
      requestOwnerDeviceId: ownerDeviceId,
      match: session.ownerDeviceId === ownerDeviceId,
      sessionOwnerDeviceIdType: typeof session.ownerDeviceId,
      requestOwnerDeviceIdType: typeof ownerDeviceId
    });
    
    if (session.ownerDeviceId !== ownerDeviceId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the session owner can remove players'
        },
        timestamp: new Date().toISOString()
      });
    }

    const player = await prisma.mvpPlayer.findUnique({
      where: { id: playerId }
    });

    if (!player) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Player not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Don't allow owner to remove themselves
    if (player.name === session.ownerName) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Cannot remove the session organizer'
        },
        timestamp: new Date().toISOString()
      });
    }

    await prisma.mvpPlayer.delete({
      where: { id: playerId }
    });

    res.json({
      success: true,
      message: 'Player removed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Remove player error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to remove player'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Add player to session (owner only)
router.post('/:shareCode/add-player', async (req, res) => {
  try {
    const { shareCode } = req.params;
    const { playerName, deviceId: ownerDeviceId } = req.body;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: { players: true }
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

    // Check if the requester is the owner
    console.log('🔍 Add player ownership check:', {
      sessionOwnerDeviceId: session.ownerDeviceId,
      requestOwnerDeviceId: ownerDeviceId,
      match: session.ownerDeviceId === ownerDeviceId,
      sessionOwnerDeviceIdType: typeof session.ownerDeviceId,
      requestOwnerDeviceIdType: typeof ownerDeviceId
    });
    
    if (session.ownerDeviceId !== ownerDeviceId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the session owner can add players'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (session.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SESSION_INACTIVE',
          message: 'Cannot add players to inactive session'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check if session is full
    if (session.players.length >= session.maxPlayers) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SESSION_FULL',
          message: 'Session is full'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check if player name already exists
    const existingPlayer = session.players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
    if (existingPlayer) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'NAME_EXISTS',
          message: 'A player with this name already exists in the session'
        },
        timestamp: new Date().toISOString()
      });
    }

    const player = await prisma.mvpPlayer.create({
      data: {
        sessionId: session.id,
        name: playerName.trim(),
        deviceId: 'manual_' + Math.random().toString(36).substr(2, 9),
        status: 'ACTIVE'
      }
    });

    res.status(201).json({
      success: true,
      data: {
        player: {
          id: player.id,
          name: player.name,
          status: player.status,
          joinedAt: player.joinedAt
        }
      },
      message: 'Player added successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Add player error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to add player'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Game Management Routes

// Create a new game
router.post('/:shareCode/games', async (req, res) => {
  try {
    const { shareCode } = req.params;
    const { team1Player1, team1Player2, team2Player1, team2Player2, courtName } = req.body;

    // Validate required fields
    if (!team1Player1 || !team1Player2 || !team2Player1 || !team2Player2) {
      return res.status(400).json({
        success: false,
        message: 'All four players are required',
        timestamp: new Date().toISOString()
      });
    }

    // Find session
    const session = await prisma.mvpSession.findFirst({
      where: { shareCode },
      include: { games: true }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }

    // Calculate next game number
    const gameNumber = (session.games.length || 0) + 1;

    // Create game
    const game = await prisma.mvpGame.create({
      data: {
        sessionId: session.id,
        gameNumber,
        team1Player1,
        team1Player2,
        team2Player1,
        team2Player2,
        courtName,
        startTime: new Date(),
        status: 'IN_PROGRESS'
      }
    });

    res.status(201).json({
      success: true,
      data: { game },
      message: 'Game created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Update game score (finish game)
router.put('/:shareCode/games/:gameId/score', async (req, res) => {
  try {
    const { shareCode, gameId } = req.params;
    const { team1FinalScore, team2FinalScore } = req.body;

    // Validate scores
    if (typeof team1FinalScore !== 'number' || typeof team2FinalScore !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Valid scores are required (0-2)',
        timestamp: new Date().toISOString()
      });
    }

    if (team1FinalScore < 0 || team1FinalScore > 2 || team2FinalScore < 0 || team2FinalScore > 2) {
      return res.status(400).json({
        success: false,
        message: 'Scores must be between 0 and 2',
        timestamp: new Date().toISOString()
      });
    }

    if (team1FinalScore === team2FinalScore) {
      return res.status(400).json({
        success: false,
        message: 'Game cannot end in a tie',
        timestamp: new Date().toISOString()
      });
    }

    // Find session and game
    const session = await prisma.mvpSession.findFirst({
      where: { shareCode }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }

    const game = await prisma.mvpGame.findFirst({
      where: { id: gameId, sessionId: session.id }
    });

    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found',
        timestamp: new Date().toISOString()
      });
    }

    // Determine winner
    const winnerTeam = team1FinalScore > team2FinalScore ? 1 : 2;

    // Update game
    const updatedGame = await prisma.mvpGame.update({
      where: { id: gameId },
      data: {
        team1FinalScore,
        team2FinalScore,
        winnerTeam,
        status: 'COMPLETED',
        endTime: new Date(),
        duration: game.startTime ? Math.round((new Date().getTime() - game.startTime.getTime()) / (1000 * 60)) : null
      }
    });

    // Update comprehensive player statistics
    await updatePlayerGameStatistics(session.id, {
      team1Player1: game.team1Player1,
      team1Player2: game.team1Player2,
      team2Player1: game.team2Player1,
      team2Player2: game.team2Player2,
      winnerTeam,
      duration: updatedGame.duration || undefined,
      team1FinalScore,
      team2FinalScore
    });

    // Emit Socket.IO update
    try {
      const { io } = await import('../server');
      const updatedSession = await prisma.mvpSession.findFirst({
        where: { shareCode },
        include: {
          players: {
            select: {
              id: true,
              name: true,
              status: true,
              joinedAt: true,
              gamesPlayed: true,
              wins: true,
              losses: true
            }
          },
          games: {
            orderBy: { gameNumber: 'desc' }
          }
        }
      });

      if (updatedSession) {
        io.to(`session-${shareCode}`).emit('mvp-session-updated', {
          session: updatedSession,
          timestamp: new Date().toISOString()
        });
        const winners = winnerTeam === 1 
          ? `${game.team1Player1} & ${game.team1Player2}` 
          : `${game.team2Player1} & ${game.team2Player2}`;
        console.log(`📡 Socket.IO: Game completed for ${shareCode} - ${winners} beat opponents ${team1FinalScore}-${team2FinalScore}`);
      }
    } catch (error) {
      console.warn('Failed to emit socket update:', error instanceof Error ? error.message : 'Unknown error');
    }

    res.json({
      success: true,
      data: { game: updatedGame },
      message: 'Game score updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error updating game score:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Update teams during live game (team switching)
router.put('/:shareCode/games/:gameId/teams', async (req, res) => {
  try {
    const { shareCode, gameId } = req.params;
    const { team1Player1, team1Player2, team2Player1, team2Player2 } = req.body;

    // Validate required fields
    if (!team1Player1 || !team1Player2 || !team2Player1 || !team2Player2) {
      return res.status(400).json({
        success: false,
        message: 'All four players are required',
        timestamp: new Date().toISOString()
      });
    }

    // Find session and game
    const session = await prisma.mvpSession.findFirst({
      where: { shareCode }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }

    const game = await prisma.mvpGame.findFirst({
      where: { 
        id: gameId, 
        sessionId: session.id,
        status: 'IN_PROGRESS' // Only allow team changes for active games
      }
    });

    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Active game not found',
        timestamp: new Date().toISOString()
      });
    }

    // Validate that all players exist in the session
    const sessionPlayers = await prisma.mvpPlayer.findMany({
      where: { 
        sessionId: session.id,
        name: { in: [team1Player1, team1Player2, team2Player1, team2Player2] }
      }
    });

    if (sessionPlayers.length !== 4) {
      return res.status(400).json({
        success: false,
        message: 'All players must be part of this session',
        timestamp: new Date().toISOString()
      });
    }

    // Update game with new teams
    const updatedGame = await prisma.mvpGame.update({
      where: { id: gameId },
      data: {
        team1Player1,
        team1Player2,
        team2Player1,
        team2Player2,
        lastTeamChange: new Date() // Track when teams were last changed
      }
    });

    // Emit Socket.IO update for real-time team switching
    try {
      const { io } = await import('../server');
      const updatedSession = await prisma.mvpSession.findFirst({
        where: { shareCode },
        include: {
          players: {
            select: {
              id: true,
              name: true,
              status: true,
              joinedAt: true,
              gamesPlayed: true,
              wins: true,
              losses: true
            }
          },
          games: {
            orderBy: { gameNumber: 'desc' }
          }
        }
      });

      if (updatedSession) {
        io.to(`session-${shareCode}`).emit('mvp-session-updated', {
          session: updatedSession,
          gameUpdate: {
            type: 'team_switch',
            gameId: gameId,
            newTeams: {
              team1: [team1Player1, team1Player2],
              team2: [team2Player1, team2Player2]
            }
          },
          timestamp: new Date().toISOString()
        });
        console.log(`📡 Socket.IO: Team switch for game ${gameId} in session ${shareCode}`);
      }
    } catch (error) {
      console.warn('Failed to emit socket update for team switch:', error instanceof Error ? error.message : 'Unknown error');
    }

    res.json({
      success: true,
      data: { 
        game: updatedGame,
        newTeams: {
          team1: [team1Player1, team1Player2],
          team2: [team2Player1, team2Player2]
        }
      },
      message: 'Teams updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error updating game teams:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Get optimal rotation suggestions for a session
router.get('/:shareCode/rotation', async (req, res) => {
  try {
    const { shareCode } = req.params;

    // Find session with players and games
    const session = await prisma.mvpSession.findFirst({
      where: { shareCode },
      include: {
        players: {
          select: {
            id: true,
            name: true,
            deviceId: true,
            status: true,
            gamesPlayed: true,
            wins: true,
            losses: true,
            matchesPlayed: true,
            matchWins: true,
            matchLosses: true,
            totalSetsWon: true,
            totalSetsLost: true,
            totalPlayTime: true,
            winRate: true,
            matchWinRate: true,
            averageGameDuration: true,
            restGamesRemaining: true,
            restRequestedAt: true,
            restRequestedBy: true,
            partnershipStats: true,
            joinedAt: true
          },
          orderBy: { joinedAt: 'asc' }
        },
        games: {
          where: { status: { in: ['IN_PROGRESS', 'COMPLETED'] } },
          orderBy: { gameNumber: 'asc' }
        },
        matches: {
          include: {
            games: {
              orderBy: { gameInMatch: 'asc' }
            }
          }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }

    // Convert database data to algorithm format
    const players = session.players.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status as 'ACTIVE' | 'RESTING' | 'LEFT',
      gamesPlayed: p.gamesPlayed,
      wins: p.wins,
      losses: p.losses,
      joinedAt: p.joinedAt
    }));

    const gameHistory = session.games.map(g => ({
      id: g.id,
      gameNumber: g.gameNumber,
      team1Player1: g.team1Player1,
      team1Player2: g.team1Player2,
      team2Player1: g.team2Player1,
      team2Player2: g.team2Player2,
      winnerTeam: g.winnerTeam || undefined,
      status: g.status as 'IN_PROGRESS' | 'COMPLETED',
      matchId: g.matchId || undefined,
      gameInMatch: g.gameInMatch || undefined
    }));

    const matchHistory = session.matches.map((m: any) => ({
      id: m.id,
      matchNumber: m.matchNumber,
      team1Player1: m.team1Player1,
      team1Player2: m.team1Player2,
      team2Player1: m.team2Player1,
      team2Player2: m.team2Player2,
      team1GamesWon: m.team1GamesWon,
      team2GamesWon: m.team2GamesWon,
      winnerTeam: m.winnerTeam || undefined,
      status: m.status as 'IN_PROGRESS' | 'COMPLETED',
      bestOf: m.bestOf,
      games: m.games.map((g: any) => ({
        id: g.id,
        gameNumber: g.gameNumber,
        team1Player1: g.team1Player1,
        team1Player2: g.team1Player2,
        team2Player1: g.team2Player1,
        team2Player2: g.team2Player2,
        winnerTeam: g.winnerTeam || undefined,
        status: g.status as 'IN_PROGRESS' | 'COMPLETED',
        matchId: g.matchId || undefined,
        gameInMatch: g.gameInMatch || undefined
      }))
    }));

    // Create courts based on session court count
    const courts = Array.from({ length: session.courtCount }, (_, index) => ({
      id: `court-${index + 1}`,
      name: `Court ${index + 1}`,
      isAvailable: true
    }));

    // Generate rotation suggestions
    const rotationResult = generateOptimalRotation(players, gameHistory, courts, matchHistory);
    const explanation = getRotationExplanation(rotationResult.suggestedGames, rotationResult.fairnessMetrics);

    res.json({
      success: true,
      data: {
        rotation: rotationResult,
        explanation,
        sessionStats: {
          totalPlayers: players.length,
          activePlayers: players.filter(p => p.status === 'ACTIVE').length,
          totalGames: gameHistory.filter(g => g.status === 'COMPLETED').length,
          averageGamesPlayed: rotationResult.fairnessMetrics.averageGamesPlayed,
          gameVariance: rotationResult.fairnessMetrics.gameVariance
        }
      },
      message: 'Rotation calculated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error calculating rotation:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Match Management Routes

// Create a new match (best of 3 or 5 games)
router.post('/:shareCode/matches', async (req, res) => {
  try {
    const { shareCode } = req.params;
    const { team1Player1, team1Player2, team2Player1, team2Player2, courtName, bestOf = 3 } = req.body;

    // Validate required fields
    if (!team1Player1 || !team1Player2 || !team2Player1 || !team2Player2) {
      return res.status(400).json({
        success: false,
        message: 'All four players are required',
        timestamp: new Date().toISOString()
      });
    }

    // Find session
    const session = await prisma.mvpSession.findFirst({
      where: { shareCode },
      include: { matches: true }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }

    // Calculate next match number
    const matchNumber = (session.matches.length || 0) + 1;

    // Create match
    const match = await prisma.mvpMatch.create({
      data: {
        sessionId: session.id,
        matchNumber,
        team1Player1,
        team1Player2,
        team2Player1,
        team2Player2,
        courtName,
        bestOf: bestOf,
        startTime: new Date(),
        status: 'IN_PROGRESS'
      }
    });

    res.status(201).json({
      success: true,
      data: { match },
      message: 'Match created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error creating match:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Create a new game within a match
router.post('/:shareCode/matches/:matchId/games', async (req, res) => {
  try {
    const { shareCode, matchId } = req.params;

    // Find session and match
    const session = await prisma.mvpSession.findFirst({
      where: { shareCode }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }

    const match = await prisma.mvpMatch.findFirst({
      where: { 
        id: matchId, 
        sessionId: session.id,
        status: 'IN_PROGRESS'
      },
      include: { games: true }
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Active match not found',
        timestamp: new Date().toISOString()
      });
    }

    // Check if match is complete
    const requiredWins = Math.ceil(match.bestOf / 2);
    if (match.team1GamesWon >= requiredWins || match.team2GamesWon >= requiredWins) {
      return res.status(400).json({
        success: false,
        message: 'Match is already complete',
        timestamp: new Date().toISOString()
      });
    }

    // Calculate next game numbers
    const gameInMatch = (match.games.length || 0) + 1;
    const totalGames = await prisma.mvpGame.count({
      where: { sessionId: session.id }
    });
    const gameNumber = totalGames + 1;

    // Create game within the match
    const game = await prisma.mvpGame.create({
      data: {
        sessionId: session.id,
        matchId: match.id,
        gameNumber,
        gameInMatch,
        team1Player1: match.team1Player1,
        team1Player2: match.team1Player2,
        team2Player1: match.team2Player1,
        team2Player2: match.team2Player2,
        courtName: match.courtName,
        startTime: new Date(),
        status: 'IN_PROGRESS'
      }
    });

    res.status(201).json({
      success: true,
      data: { 
        game,
        match: {
          id: match.id,
          matchNumber: match.matchNumber,
          gameInMatch,
          team1GamesWon: match.team1GamesWon,
          team2GamesWon: match.team2GamesWon,
          bestOf: match.bestOf
        }
      },
      message: 'Game created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error creating game in match:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Update game score and check for match completion
router.put('/:shareCode/matches/:matchId/games/:gameId/score', async (req, res) => {
  try {
    const { shareCode, matchId, gameId } = req.params;
    const { team1FinalScore, team2FinalScore } = req.body;

    // Validate scores
    if (typeof team1FinalScore !== 'number' || typeof team2FinalScore !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Valid scores are required (0-2)',
        timestamp: new Date().toISOString()
      });
    }

    if (team1FinalScore < 0 || team1FinalScore > 2 || team2FinalScore < 0 || team2FinalScore > 2) {
      return res.status(400).json({
        success: false,
        message: 'Scores must be between 0 and 2',
        timestamp: new Date().toISOString()
      });
    }

    if (team1FinalScore === team2FinalScore) {
      return res.status(400).json({
        success: false,
        message: 'Game cannot end in a tie',
        timestamp: new Date().toISOString()
      });
    }

    // Find session, match, and game
    const session = await prisma.mvpSession.findFirst({
      where: { shareCode }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }

    const match = await prisma.mvpMatch.findFirst({
      where: { id: matchId, sessionId: session.id }
    });

    const game = await prisma.mvpGame.findFirst({
      where: { id: gameId, matchId: matchId, sessionId: session.id }
    });

    if (!match || !game) {
      return res.status(404).json({
        success: false,
        message: 'Match or game not found',
        timestamp: new Date().toISOString()
      });
    }

    // Determine winner
    const winnerTeam = team1FinalScore > team2FinalScore ? 1 : 2;

    // Update game
    const updatedGame = await prisma.mvpGame.update({
      where: { id: gameId },
      data: {
        team1FinalScore,
        team2FinalScore,
        winnerTeam,
        status: 'COMPLETED',
        endTime: new Date(),
        duration: game.startTime ? Math.round((new Date().getTime() - game.startTime.getTime()) / (1000 * 60)) : null
      }
    });

    // Update match game count
    const newTeam1GamesWon = match.team1GamesWon + (winnerTeam === 1 ? 1 : 0);
    const newTeam2GamesWon = match.team2GamesWon + (winnerTeam === 2 ? 1 : 0);
    const requiredWins = Math.ceil(match.bestOf / 2);
    
    // Check if match is complete
    const isMatchComplete = newTeam1GamesWon >= requiredWins || newTeam2GamesWon >= requiredWins;
    const matchWinner = isMatchComplete 
      ? (newTeam1GamesWon > newTeam2GamesWon ? 1 : 2)
      : undefined;

    // Update match
    const updatedMatch = await prisma.mvpMatch.update({
      where: { id: matchId },
      data: {
        team1GamesWon: newTeam1GamesWon,
        team2GamesWon: newTeam2GamesWon,
        winnerTeam: matchWinner,
        status: isMatchComplete ? 'COMPLETED' : 'IN_PROGRESS',
        endTime: isMatchComplete ? new Date() : undefined,
        duration: isMatchComplete && match.startTime 
          ? Math.round((new Date().getTime() - match.startTime.getTime()) / (1000 * 60)) 
          : undefined
      }
    });

    // Update comprehensive player statistics for the game
    await updatePlayerGameStatistics(session.id, {
      team1Player1: match.team1Player1,
      team1Player2: match.team1Player2,
      team2Player1: match.team2Player1,
      team2Player2: match.team2Player2,
      winnerTeam,
      duration: updatedGame.duration || undefined,
      team1FinalScore,
      team2FinalScore
    });

    // If match is complete, update match statistics
    if (isMatchComplete) {
      await updatePlayerMatchStatistics(session.id, {
        team1Player1: match.team1Player1,
        team1Player2: match.team1Player2,
        team2Player1: match.team2Player1,
        team2Player2: match.team2Player2,
        winnerTeam: matchWinner!,
        duration: updatedMatch.duration || undefined
      });
    }

    // Emit Socket.IO update
    try {
      const { io } = await import('../server');
      const updatedSession = await prisma.mvpSession.findFirst({
        where: { shareCode },
        include: {
          players: {
            select: {
              id: true,
              name: true,
              status: true,
              joinedAt: true,
              gamesPlayed: true,
              wins: true,
              losses: true
            }
          },
          games: {
            orderBy: { gameNumber: 'desc' }
          },
          matches: {
            include: {
              games: {
                orderBy: { gameInMatch: 'asc' }
              }
            },
            orderBy: { matchNumber: 'desc' }
          }
        }
      });

      if (updatedSession) {
        io.to(`session-${shareCode}`).emit('mvp-session-updated', {
          session: updatedSession,
          matchUpdate: {
            type: isMatchComplete ? 'match_complete' : 'game_complete',
            matchId: matchId,
            gameId: gameId,
            gameScore: `${team1FinalScore}-${team2FinalScore}`,
            matchScore: `${newTeam1GamesWon}-${newTeam2GamesWon}`,
            isMatchComplete,
            matchWinner
          },
          timestamp: new Date().toISOString()
        });

        const winnerNames = winnerTeam === 1 
          ? [game.team1Player1, game.team1Player2]
          : [game.team2Player1, game.team2Player2];
        const gameWinners = winnerNames.join(' & ');
        const matchStatus = isMatchComplete 
          ? `🏆 Match Complete! ${gameWinners} won ${newTeam1GamesWon}-${newTeam2GamesWon}`
          : `Game ${game.gameInMatch} complete: ${gameWinners} won ${team1FinalScore}-${team2FinalScore}`;
        
        console.log(`📡 Socket.IO: ${matchStatus}`);
      }
    } catch (error) {
      console.warn('Failed to emit socket update:', error instanceof Error ? error.message : 'Unknown error');
    }

    res.json({
      success: true,
      data: { 
        game: updatedGame, 
        match: updatedMatch,
        isMatchComplete,
        matchWinner
      },
      message: isMatchComplete ? 'Match completed!' : 'Game score updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error updating match game score:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Get match details with games
router.get('/:shareCode/matches/:matchId', async (req, res) => {
  try {
    const { shareCode, matchId } = req.params;

    const session = await prisma.mvpSession.findFirst({
      where: { shareCode }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }

    const match = await prisma.mvpMatch.findFirst({
      where: { id: matchId, sessionId: session.id },
      include: {
        games: {
          orderBy: { gameInMatch: 'asc' }
        }
      }
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: { match },
      message: 'Match retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting match:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Statistics Routes

// Get comprehensive player statistics
router.get('/:shareCode/players/:playerName/stats', async (req, res) => {
  try {
    const { shareCode, playerName } = req.params;

    const session = await prisma.mvpSession.findFirst({
      where: { shareCode }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }

    const playerStats = await getPlayerStatistics(session.id, playerName);

    if (!playerStats) {
      return res.status(404).json({
        success: false,
        message: 'Player not found in session',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: {
        playerName,
        stats: playerStats
      },
      message: 'Player statistics retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting player statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Get session-wide statistics
router.get('/:shareCode/statistics', async (req, res) => {
  try {
    const { shareCode } = req.params;

    const session = await prisma.mvpSession.findFirst({
      where: { shareCode }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }

    const sessionStats = await getSessionStatistics(session.id);

    res.json({
      success: true,
      data: {
        sessionStats
      },
      message: 'Session statistics retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting session statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Get session leaderboard
router.get('/:shareCode/leaderboard', async (req, res) => {
  try {
    const { shareCode } = req.params;

    const session = await prisma.mvpSession.findFirst({
      where: { shareCode }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }

    const leaderboard = await getSessionLeaderboard(session.id);

    res.json({
      success: true,
      data: {
        leaderboard
      },
      message: 'Session leaderboard retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting session leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Player Management Endpoints

// Update player status (for self-dropout or organizer management)
router.put('/:shareCode/players/:playerId/status', async (req, res) => {
  try {
    const { shareCode, playerId } = req.params;
    const { status, reason } = req.body;

    // Validate status
    if (!['ACTIVE', 'RESTING', 'LEFT'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be ACTIVE, RESTING, or LEFT'
      });
    }

    // Find the session
    const session = await prisma.mvpSession.findFirst({
      where: { shareCode },
      include: { 
        players: true,
        games: { 
          where: { status: 'IN_PROGRESS' }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Find the player
    const player = await prisma.mvpPlayer.findFirst({
      where: { id: playerId, sessionId: session.id }
    });

    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found'
      });
    }

    // Check if player is currently in an active game
    const activeGames = session.games.filter(game => 
      game.team1Player1 === player.name ||
      game.team1Player2 === player.name ||
      game.team2Player1 === player.name ||
      game.team2Player2 === player.name
    );

    if (status === 'LEFT' && activeGames.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot leave session while playing in an active game. Please finish the game first.',
        activeGames: activeGames.map(game => ({
          id: game.id,
          gameNumber: game.gameNumber,
          courtName: game.courtName
        }))
      });
    }

    // Update player status
    const updatedPlayer = await prisma.mvpPlayer.update({
      where: { id: playerId },
      data: { 
        status: status as any,
        // If leaving, we might want to track when they left
        ...(status === 'LEFT' && { /* could add leftAt timestamp if needed */ })
      }
    });

    // Get updated session data
    const updatedSession = await prisma.mvpSession.findFirst({
      where: { shareCode },
      include: { 
        players: {
          orderBy: { joinedAt: 'asc' }
        }
      }
    });

    // Emit real-time update
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`session-${shareCode}`).emit('mvp-session-updated', {
          session: updatedSession,
          playerStatusChanged: {
            playerId: playerId,
            playerName: player.name,
            oldStatus: player.status,
            newStatus: status,
            reason: reason || null
          },
          timestamp: new Date().toISOString()
        });

        console.log(`📡 Socket.IO: Player ${player.name} changed status from ${player.status} to ${status} in session ${shareCode}`);
      }
    } catch (error) {
      console.warn('Failed to emit socket update:', error instanceof Error ? error.message : 'Unknown error');
    }

    res.json({
      success: true,
      message: `Player status updated to ${status}`,
      data: {
        player: updatedPlayer,
        session: updatedSession
      }
    });

  } catch (error) {
    console.error('Update player status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update player status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Remove player from session (organizer only)
router.delete('/:shareCode/players/:playerId', async (req, res) => {
  try {
    const { shareCode, playerId } = req.params;
    const { organizerDeviceId, reason } = req.body;

    // Find the session
    const session = await prisma.mvpSession.findFirst({
      where: { shareCode },
      include: { 
        players: true,
        games: { 
          where: { status: 'IN_PROGRESS' }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Check if requester is the organizer
    if (session.ownerDeviceId !== organizerDeviceId) {
      return res.status(403).json({
        success: false,
        message: 'Only the session organizer can remove players'
      });
    }

    // Find the player
    const player = await prisma.mvpPlayer.findFirst({
      where: { id: playerId, sessionId: session.id }
    });

    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found'
      });
    }

    // Check if player is currently in an active game
    const activeGames = session.games.filter(game => 
      game.team1Player1 === player.name ||
      game.team1Player2 === player.name ||
      game.team2Player1 === player.name ||
      game.team2Player2 === player.name
    );

    if (activeGames.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove player while they are playing in an active game. Please finish the game first.',
        activeGames: activeGames.map(game => ({
          id: game.id,
          gameNumber: game.gameNumber,
          courtName: game.courtName
        }))
      });
    }

    // Instead of deleting, mark as LEFT to preserve statistics
    const updatedPlayer = await prisma.mvpPlayer.update({
      where: { id: playerId },
      data: { 
        status: 'LEFT'
      }
    });

    // Get updated session data
    const updatedSession = await prisma.mvpSession.findFirst({
      where: { shareCode },
      include: { 
        players: {
          orderBy: { joinedAt: 'asc' }
        }
      }
    });

    // Emit real-time update
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`session-${shareCode}`).emit('mvp-session-updated', {
          session: updatedSession,
          playerRemoved: {
            playerId: playerId,
            playerName: player.name,
            removedBy: 'organizer',
            reason: reason || null
          },
          timestamp: new Date().toISOString()
        });

        console.log(`📡 Socket.IO: Player ${player.name} was removed from session ${shareCode} by organizer`);
      }
    } catch (error) {
      console.warn('Failed to emit socket update:', error instanceof Error ? error.message : 'Unknown error');
    }

    res.json({
      success: true,
      message: 'Player removed from session',
      data: {
        removedPlayer: {
          id: player.id,
          name: player.name
        },
        session: updatedSession
      }
    });

  } catch (error) {
    console.error('Remove player error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove player',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get player's own status and session participation
router.get('/:shareCode/players/me/:deviceId', async (req, res) => {
  try {
    const { shareCode, deviceId } = req.params;

    // Find the session and player
    const session = await prisma.mvpSession.findFirst({
      where: { shareCode },
      include: { 
        players: {
          where: { deviceId },
          orderBy: { joinedAt: 'desc' },
          take: 1
        },
        games: { 
          where: { status: 'IN_PROGRESS' },
          orderBy: { gameNumber: 'desc' }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    const player = session.players[0];
    
    if (!player) {
      return res.json({
        success: true,
        data: {
          isParticipating: false,
          session: {
            id: session.id,
            name: session.name,
            shareCode: session.shareCode
          }
        }
      });
    }

    // Check if player is in any active games
    const activeGame = session.games.find(game => 
      game.team1Player1 === player.name ||
      game.team1Player2 === player.name ||
      game.team2Player1 === player.name ||
      game.team2Player2 === player.name
    );

    res.json({
      success: true,
      data: {
        isParticipating: true,
        player: {
          id: player.id,
          name: player.name,
          status: player.status,
          joinedAt: player.joinedAt,
          gamesPlayed: player.gamesPlayed,
          wins: player.wins,
          losses: player.losses
        },
        activeGame: activeGame ? {
          id: activeGame.id,
          gameNumber: activeGame.gameNumber,
          courtName: activeGame.courtName
        } : null,
        canLeave: !activeGame, // Can only leave if not in active game
        session: {
          id: session.id,
          name: session.name,
          shareCode: session.shareCode,
          ownerName: session.ownerName
        }
      }
    });

  } catch (error) {
    console.error('Get player status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get player status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update player status (self-dropout or organizer management)
router.put('/:shareCode/players/:playerId/status', async (req, res) => {
  try {
    const { shareCode, playerId } = req.params;
    const { status, deviceId, ownerDeviceId } = req.body;

    // Validate status
    if (!['ACTIVE', 'RESTING', 'LEFT'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: 'Invalid player status. Must be ACTIVE, RESTING, or LEFT'
        },
        timestamp: new Date().toISOString()
      });
    }

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: {
        players: true,
        games: {
          where: { status: 'IN_PROGRESS' },
          include: {
            match: true
          }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const player = session.players.find(p => p.id === playerId);
    if (!player) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAYER_NOT_FOUND',
          message: 'Player not found in session'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check if player is currently in an active game
    const isInActiveGame = session.games.some(game => 
      game.team1Player1 === player.name ||
      game.team1Player2 === player.name ||
      game.team2Player1 === player.name ||
      game.team2Player2 === player.name
    );

    // Prevent leaving if in active game
    if (status === 'LEFT' && isInActiveGame) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PLAYER_IN_ACTIVE_GAME',
          message: 'Cannot leave session while playing in an active game'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check authorization - either the player themselves or the session owner
    const isOwner = session.ownerDeviceId === ownerDeviceId;
    const isPlayerThemselves = player.deviceId === deviceId;

    if (!isOwner && !isPlayerThemselves) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the player themselves or session owner can update player status'
        },
        timestamp: new Date().toISOString()
      });
    }

    const updatedPlayer = await prisma.mvpPlayer.update({
      where: { id: playerId },
      data: { status }
    });

    // TODO: Emit real-time update when Socket.IO is properly configured

    res.json({
      success: true,
      data: {
        player: {
          id: updatedPlayer.id,
          name: updatedPlayer.name,
          status: updatedPlayer.status
        }
      },
      message: 'Player status updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update player status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update player status'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Remove player from session (organizer only)
router.delete('/:shareCode/players/:playerId', async (req, res) => {
  try {
    const { shareCode, playerId } = req.params;
    const { ownerDeviceId } = req.body;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: {
        players: true,
        games: {
          where: { status: 'IN_PROGRESS' },
          include: {
            match: true
          }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check if the requester is the owner
    if (session.ownerDeviceId !== ownerDeviceId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the session owner can remove players'
        },
        timestamp: new Date().toISOString()
      });
    }

    const player = session.players.find(p => p.id === playerId);
    if (!player) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAYER_NOT_FOUND',
          message: 'Player not found in session'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check if player is currently in an active game
    const isInActiveGame = session.games.some(game => 
      game.team1Player1 === player.name ||
      game.team1Player2 === player.name ||
      game.team2Player1 === player.name ||
      game.team2Player2 === player.name
    );

    if (isInActiveGame) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PLAYER_IN_ACTIVE_GAME',
          message: 'Cannot remove player while they are playing in an active game'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Remove the player
    await prisma.mvpPlayer.delete({
      where: { id: playerId }
    });

    // TODO: Emit real-time update when Socket.IO is properly configured

    res.json({
      success: true,
      message: 'Player removed from session successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Remove player error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to remove player from session'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Get player's own status by deviceId
router.get('/:shareCode/players/me/:deviceId', async (req, res) => {
  try {
    const { shareCode, deviceId } = req.params;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: {
        players: {
          where: { deviceId }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const player = session.players[0];
    if (!player) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAYER_NOT_FOUND',
          message: 'Player not found in session'
        },
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: {
        player: {
          id: player.id,
          name: player.name,
          status: player.status,
          gamesPlayed: player.gamesPlayed,
          wins: player.wins,
          losses: player.losses
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get player status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get player status'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Create/Save completed game
router.post('/:shareCode/games', async (req, res) => {
  try {
    const { shareCode } = req.params;
    const { 
      courtName,
      team1Player1, team1Player2, team1Score,
      team2Player1, team2Player2, team2Score,
      winnerTeam,
      startTime,
      endTime,
      duration,
      sets
    } = req.body;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: { games: true }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Get next game number
    const gameNumber = (session.games.length || 0) + 1;

    // Create the game
    const game = await prisma.mvpGame.create({
      data: {
        sessionId: session.id,
        courtName: courtName || 'Court 1',
        gameNumber,
        team1Player1,
        team1Player2,
        team2Player1,
        team2Player2,
        team1FinalScore: team1Score || 0,
        team2FinalScore: team2Score || 0,
        winnerTeam,
        startTime: startTime ? new Date(startTime) : new Date(),
        endTime: endTime ? new Date(endTime) : new Date(),
        duration: duration || 0,
        status: 'COMPLETED'
      }
    });

    // Create game sets if provided
    if (sets && Array.isArray(sets)) {
      for (const set of sets) {
        await prisma.mvpGameSet.create({
          data: {
            gameId: game.id,
            setNumber: set.setNumber,
            team1Score: set.team1Score || 0,
            team2Score: set.team2Score || 0,
            winnerTeam: set.winnerTeam,
            isCompleted: set.isCompleted || true
          }
        });
      }
    }

    // TODO: Emit real-time update when Socket.IO is properly configured

    res.json({
      success: true,
      data: { game },
      message: 'Game saved successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Save game error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to save game'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Update session court settings
router.put('/:shareCode/courts', async (req, res) => {
  try {
    const { shareCode } = req.params;
    const { courtCount, ownerDeviceId } = req.body;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check if the requester is the owner
    if (session.ownerDeviceId !== ownerDeviceId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the session owner can update court settings'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Update court count with transaction to ensure consistency
    const updatedSession = await prisma.mvpSession.update({
      where: { shareCode },
      data: { courtCount: courtCount || 2 },
      include: {
        players: {
          orderBy: { joinedAt: 'asc' }
        },
        games: {
          orderBy: { gameNumber: 'desc' }
        },
        matches: {
          include: {
            games: {
              orderBy: { gameInMatch: 'asc' }
            }
          },
          orderBy: { matchNumber: 'desc' }
        }
      }
    });

    // Emit real-time update with fresh data
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`session-${shareCode}`).emit('mvp-session-updated', {
          session: {
            id: updatedSession.id,
            name: updatedSession.name,
            scheduledAt: updatedSession.scheduledAt,
            location: updatedSession.location,
            maxPlayers: updatedSession.maxPlayers,
            courtCount: updatedSession.courtCount, // Fresh court count
            status: updatedSession.status,
            ownerName: updatedSession.ownerName,
            ownerDeviceId: updatedSession.ownerDeviceId,
            shareCode: updatedSession.shareCode,
            playerCount: updatedSession.players.length,
            players: updatedSession.players.map(player => ({
                id: player.id,
                name: player.name,
                deviceId: player.deviceId,
                status: player.status,
                gamesPlayed: player.gamesPlayed,
                wins: player.wins,
                losses: player.losses,
                joinedAt: player.joinedAt
              })),
            games: updatedSession.games || [],
            matches: updatedSession.matches || [],
            createdAt: updatedSession.createdAt
          },
          timestamp: new Date().toISOString()
        });
        console.log(`📡 Socket.IO: Court count updated to ${updatedSession.courtCount} for session ${shareCode}`);
      }
    } catch (socketError) {
      console.error('Failed to emit court update:', socketError);
      // Don't fail the request if socket emission fails
    }

    res.json({
      success: true,
      data: { 
        session: {
          id: updatedSession.id,
          name: updatedSession.name,
          courtCount: updatedSession.courtCount,
          playerCount: updatedSession.players.length,
          gameCount: updatedSession.games.length,
          matchCount: updatedSession.matches.length
        }
      },
      message: 'Court settings updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update court settings error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update court settings'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Rest Management Routes

// Set player rest status (self or owner-managed)
router.put('/:shareCode/players/:playerId/rest', async (req, res) => {
  try {
    const { shareCode, playerId } = req.params;
    const { gamesCount = 1, requestedBy, deviceId, ownerDeviceId } = req.body;

    // Validate games count
    if (gamesCount < 0 || gamesCount > 5) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_GAMES_COUNT',
          message: 'Games count must be between 0 and 5'
        },
        timestamp: new Date().toISOString()
      });
    }

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: {
        players: true,
        games: { where: { status: 'IN_PROGRESS' } }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const player = session.players.find(p => p.id === playerId);
    if (!player) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAYER_NOT_FOUND',
          message: 'Player not found in session'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check authorization - either player themselves or session owner
    const isOwner = session.ownerDeviceId === ownerDeviceId;
    const isPlayerThemselves = player.deviceId === deviceId;

    if (!isOwner && !isPlayerThemselves) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the player themselves or session owner can manage rest'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check if player is in active game
    const isInActiveGame = session.games.some(game => 
      game.team1Player1 === player.name ||
      game.team1Player2 === player.name ||
      game.team2Player1 === player.name ||
      game.team2Player2 === player.name
    );

    if (isInActiveGame && gamesCount > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PLAYER_IN_ACTIVE_GAME',
          message: 'Cannot set rest while player is in an active game'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Update player rest status
    const updatedPlayer = await prisma.mvpPlayer.update({
      where: { id: playerId },
      data: {
        status: gamesCount > 0 ? 'RESTING' : 'ACTIVE',
        restGamesRemaining: gamesCount,
        restRequestedAt: gamesCount > 0 ? new Date() : null,
        restRequestedBy: gamesCount > 0 ? (isOwner ? session.ownerName : 'self') : null
      }
    });

    // Emit real-time update
    try {
      const io = req.app.get('io');
      if (io) {
        const updatedSession = await prisma.mvpSession.findUnique({
          where: { shareCode },
          include: {
            players: { orderBy: { joinedAt: 'asc' } },
            games: { orderBy: { gameNumber: 'desc' } }
          }
        });

        if (updatedSession) {
          io.to(`session-${shareCode}`).emit('mvp-session-updated', {
            session: updatedSession,
            playerRestChanged: {
              playerId: playerId,
              playerName: player.name,
              restGamesRemaining: gamesCount,
              requestedBy: isOwner ? session.ownerName : 'self',
              action: gamesCount > 0 ? 'rest_started' : 'rest_ended'
            },
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.warn('Failed to emit socket update:', error instanceof Error ? error.message : 'Unknown error');
    }

    const actionMessage = gamesCount > 0 
      ? `Player is now resting for ${gamesCount} game(s)`
      : 'Player is no longer resting';

    res.json({
      success: true,
      data: {
        player: {
          id: updatedPlayer.id,
          name: updatedPlayer.name,
          status: updatedPlayer.status,
          restGamesRemaining: updatedPlayer.restGamesRemaining,
          restRequestedAt: updatedPlayer.restRequestedAt,
          restRequestedBy: updatedPlayer.restRequestedBy
        }
      },
      message: actionMessage,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Set player rest error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to set player rest status'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Get rest status for all players in session
router.get('/:shareCode/rest-status', async (req, res) => {
  try {
    const { shareCode } = req.params;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: {
        players: {
          select: {
            id: true,
            name: true,
            status: true,
            restGamesRemaining: true,
            restRequestedAt: true,
            restRequestedBy: true
          },
          orderBy: { joinedAt: 'asc' }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const restingPlayers = session.players.filter(p => p.status === 'RESTING');
    const activePlayers = session.players.filter(p => p.status === 'ACTIVE');

    res.json({
      success: true,
      data: {
        restingPlayers,
        activePlayers,
        totalPlayers: session.players.length
      },
      message: 'Rest status retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get rest status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get rest status'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Leave session by device ID (for web interface)
 * DELETE /:shareCode/leave-by-device
 */
router.delete('/:shareCode/leave-by-device', async (req, res) => {
  try {
    const { shareCode } = req.params;
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DEVICE_ID_REQUIRED',
          message: 'Device ID is required'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Find the session
    const session = await prisma.mvpSession.findUnique({
      where: { shareCode }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Find the player by deviceId
    const player = await prisma.mvpPlayer.findFirst({
      where: {
        sessionId: session.id,
        deviceId,
        status: 'ACTIVE'
      }
    });

    if (!player) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAYER_NOT_FOUND',
          message: 'You are not currently registered for this session'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Update player status to LEFT
    const updatedPlayer = await prisma.mvpPlayer.update({
      where: { id: player.id },
      data: { status: 'LEFT' }
    });

    // Emit socket event for real-time updates
    if (typeof io !== 'undefined') {
      io.to(`session-${shareCode}`).emit('mvp-session-updated', {
        type: 'player-left',
        player: {
          id: updatedPlayer.id,
          name: updatedPlayer.name,
          status: updatedPlayer.status
        },
        sessionId: session.id,
        shareCode: session.shareCode
      });
      
      console.log(`📡 Socket.IO: Player ${player.name} left session ${shareCode} via web interface`);
    }

    res.json({
      success: true,
      data: {
        player: {
          id: updatedPlayer.id,
          name: updatedPlayer.name,
          status: updatedPlayer.status
        }
      },
      message: 'Successfully left the session',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Leave session by device error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to leave session'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;