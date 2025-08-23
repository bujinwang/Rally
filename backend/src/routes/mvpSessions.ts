import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { body, param, validationResult } from 'express-validator';

const router = Router();

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

export default router;