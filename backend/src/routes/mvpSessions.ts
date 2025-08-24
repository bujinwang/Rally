import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { body, param, validationResult } from 'express-validator';
import { generateOptimalRotation, getRotationExplanation } from '../utils/rotationAlgorithm';

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
            status: true,
            joinedAt: true,
            gamesPlayed: true,
            wins: true,
            losses: true
          },
          orderBy: {
            joinedAt: 'asc'
          }
        },
        games: {
          orderBy: {
            gameNumber: 'desc'
          }
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
      skillLevel: session.skillLevel,
      cost: session.cost,
      description: session.description,
      ownerName: session.ownerName,
      ownerDeviceId: session.ownerDeviceId,
      status: session.status,
      playerCount: session.players?.length || 0,
      players: session.players || [],
      games: session.games || [],
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
        maxPlayers: 50, // Default max players
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
          games: session.games || [],
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

    // Check if the requester is the owner (if ownerDeviceId is provided)
    if (ownerDeviceId && session.ownerDeviceId !== ownerDeviceId) {
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

    const updatedSession = await prisma.mvpSession.update({
      where: { shareCode },
      data: updateData,
      include: {
        players: {
          orderBy: { joinedAt: 'asc' }
        },
        games: {
          orderBy: { gameNumber: 'desc' }
        }
      }
    });

    // Emit real-time update to all clients in this session
    if (req.app.get('io')) {
      req.app.get('io').to(`session-${shareCode}`).emit('mvp-session-updated', {
        session: {
          id: updatedSession.id,
          name: updatedSession.name,
          scheduledAt: updatedSession.scheduledAt,
          location: updatedSession.location,
          maxPlayers: updatedSession.maxPlayers,
          courtCount: updatedSession.courtCount,
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
          createdAt: updatedSession.createdAt
        },
        timestamp: new Date().toISOString()
      });
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
          courtCount: updatedSession.courtCount,
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
    const { name, ownerDeviceId } = req.body;

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
        name: name.trim(),
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

    // Update player stats
    const players = [game.team1Player1, game.team1Player2, game.team2Player1, game.team2Player2];
    const winners = winnerTeam === 1 ? [game.team1Player1, game.team1Player2] : [game.team2Player1, game.team2Player2];
    const losers = winnerTeam === 1 ? [game.team2Player1, game.team2Player2] : [game.team1Player1, game.team1Player2];

    // Update all players' games played
    await prisma.mvpPlayer.updateMany({
      where: {
        sessionId: session.id,
        name: { in: players }
      },
      data: {
        gamesPlayed: { increment: 1 }
      }
    });

    // Update winners
    await prisma.mvpPlayer.updateMany({
      where: {
        sessionId: session.id,
        name: { in: winners }
      },
      data: {
        wins: { increment: 1 }
      }
    });

    // Update losers
    await prisma.mvpPlayer.updateMany({
      where: {
        sessionId: session.id,
        name: { in: losers }
      },
      data: {
        losses: { increment: 1 }
      }
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
        console.log(`📡 Socket.IO: Game completed for ${shareCode} - ${winners.join(' & ')} beat ${losers.join(' & ')} ${team1FinalScore}-${team2FinalScore}`);
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
            status: true,
            gamesPlayed: true,
            wins: true,
            losses: true,
            joinedAt: true
          },
          orderBy: { joinedAt: 'asc' }
        },
        games: {
          where: { status: { in: ['IN_PROGRESS', 'COMPLETED'] } },
          orderBy: { gameNumber: 'asc' }
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
      status: g.status as 'IN_PROGRESS' | 'COMPLETED'
    }));

    // Create courts based on session court count
    const courts = Array.from({ length: session.courtCount }, (_, index) => ({
      id: `court-${index + 1}`,
      name: `Court ${index + 1}`,
      isAvailable: true
    }));

    // Generate rotation suggestions
    const rotationResult = generateOptimalRotation(players, gameHistory, courts);
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

export default router;