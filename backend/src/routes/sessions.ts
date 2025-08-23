import { Router, Request } from 'express';
import { prisma } from '../config/database';
import { authenticateToken, requireRole } from '../middleware/auth';
import { createSessionSchema, updateSessionSchema, validate } from '../utils/validation';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string | null;
    role: string;
  };
}

const router = Router();

// Get user's sessions
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const { status, page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      OR: [
        { ownerId: userId },
        {
          sessionPlayers: {
            some: {
              userId: userId
            }
          }
        }
      ]
    };

    if (status) {
      where.status = status;
    }

    const sessions = await prisma.session.findMany({
      where,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        sessionPlayers: {
          include: {
            user: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        scheduledAt: 'asc'
      },
      skip,
      take: limitNum
    });

    const total = await prisma.session.count({ where });

    res.json({
      success: true,
      data: {
        sessions: sessions.map(session => ({
          id: session.id,
          name: session.name,
          scheduledAt: session.scheduledAt,
          location: session.location,
          maxPlayers: session.maxPlayers,
          skillLevel: session.skillLevel,
          cost: session.cost,
          status: session.status,
          owner: session.owner,
          playerCount: session.sessionPlayers.length,
          isOwner: session.ownerId === userId
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get sessions error:', error);
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

// Create new session
router.post('/', authenticateToken, requireRole(['OWNER']), validate(createSessionSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const sessionData = req.body;

    const session = await prisma.session.create({
      data: {
        ...sessionData,
        ownerId: userId
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: {
        session: {
          id: session.id,
          name: session.name,
          scheduledAt: session.scheduledAt,
          location: session.location,
          maxPlayers: session.maxPlayers,
          skillLevel: session.skillLevel,
          cost: session.cost,
          description: session.description,
          status: session.status,
          owner: session.owner,
          createdAt: session.createdAt
        }
      },
      message: 'Session created successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Create session error:', error);
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

// Get session details
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        sessionPlayers: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
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

    // Check if user has access to this session
    const isOwner = session.ownerId === userId;
    const isPlayer = session.sessionPlayers.some(sp => sp.userId === userId);

    if (!isOwner && !isPlayer) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied'
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
          skillLevel: session.skillLevel,
          cost: session.cost,
          description: session.description,
          status: session.status,
          owner: session.owner,
          isOwner,
          players: session.sessionPlayers.map(sp => ({
            id: sp.user.id,
            name: sp.user.name,
            email: sp.user.email,
            status: sp.status,
            gamesPlayed: sp.gamesPlayed,
            wins: sp.wins,
            losses: sp.losses,
            joinedAt: sp.joinedAt
          })),
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get session error:', error);
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

// Update session
router.put('/:id', authenticateToken, requireRole(['OWNER']), validate(updateSessionSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const updateData = req.body;

    // Check if session exists and user is owner
    const existingSession = await prisma.session.findUnique({
      where: { id }
    });

    if (!existingSession) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (existingSession.ownerId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only session owner can update the session'
        },
        timestamp: new Date().toISOString()
      });
    }

    const session = await prisma.session.update({
      where: { id },
      data: updateData,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          name: session.name,
          scheduledAt: session.scheduledAt,
          location: session.location,
          maxPlayers: session.maxPlayers,
          skillLevel: session.skillLevel,
          cost: session.cost,
          description: session.description,
          status: session.status,
          owner: session.owner,
          updatedAt: session.updatedAt
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

// Delete session
router.delete('/:id', authenticateToken, requireRole(['OWNER']), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    // Check if session exists and user is owner
    const existingSession = await prisma.session.findUnique({
      where: { id }
    });

    if (!existingSession) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (existingSession.ownerId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only session owner can delete the session'
        },
        timestamp: new Date().toISOString()
      });
    }

    await prisma.session.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Session deleted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete session'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;