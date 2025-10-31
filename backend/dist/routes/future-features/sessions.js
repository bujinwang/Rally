"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../utils/validation");
// Generate short share code
function generateShareCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
const router = (0, express_1.Router)();
// Get user's sessions
router.get('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { status, page = 1, limit = 10 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        const where = {
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
        const sessions = await database_1.prisma.session.findMany({
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
        const total = await database_1.prisma.session.count({ where });
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
    }
    catch (error) {
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
// Create new session (no authentication required)
router.post('/', (0, validation_1.validate)(validation_1.createSessionSchema), async (req, res) => {
    try {
        const sessionData = req.body;
        let shareCode = generateShareCode();
        // Ensure unique share code
        while (await database_1.prisma.session.findUnique({ where: { shareCode } })) {
            shareCode = generateShareCode();
        }
        const session = await database_1.prisma.session.create({
            data: {
                name: sessionData.name,
                scheduledAt: new Date(sessionData.dateTime),
                location: sessionData.location,
                maxPlayers: sessionData.maxPlayers || 20,
                organizerName: sessionData.organizerName,
                shareCode,
                status: 'ACTIVE'
            }
        });
        // Auto-join the organizer as first player
        await database_1.prisma.sessionPlayer.create({
            data: {
                sessionId: session.id,
                name: sessionData.organizerName,
                status: 'ACTIVE'
            }
        });
        // Fetch the session with players to return complete data
        const sessionWithPlayers = await database_1.prisma.session.findUnique({
            where: { id: session.id },
            include: {
                sessionPlayers: {
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
                    scheduledAt: session.scheduledAt,
                    location: session.location,
                    maxPlayers: session.maxPlayers,
                    organizerName: session.organizerName,
                    status: session.status,
                    playerCount: sessionWithPlayers?.sessionPlayers.length || 1,
                    players: sessionWithPlayers?.sessionPlayers.map(player => ({
                        id: player.id,
                        name: player.name,
                        status: player.status,
                        joinedAt: player.joinedAt
                    })) || [],
                    createdAt: session.createdAt
                },
                shareLink: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/join/${shareCode}`
            },
            message: 'Session created successfully',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
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
router.get('/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        const session = await database_1.prisma.session.findUnique({
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
    }
    catch (error) {
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
router.put('/:id', auth_1.authenticateToken, (0, auth_1.requireRole)(['OWNER']), (0, validation_1.validate)(validation_1.updateSessionSchema), async (req, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        const updateData = req.body;
        // Check if session exists and user is owner
        const existingSession = await database_1.prisma.session.findUnique({
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
        const session = await database_1.prisma.session.update({
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
    }
    catch (error) {
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
router.delete('/:id', auth_1.authenticateToken, (0, auth_1.requireRole)(['OWNER']), async (req, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        // Check if session exists and user is owner
        const existingSession = await database_1.prisma.session.findUnique({
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
        await database_1.prisma.session.delete({
            where: { id }
        });
        res.json({
            success: true,
            message: 'Session deleted successfully',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
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
exports.default = router;
//# sourceMappingURL=sessions.js.map