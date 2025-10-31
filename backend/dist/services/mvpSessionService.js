"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MvpSessionService = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
class MvpSessionService {
    /**
     * Create a new MVP session
     */
    static async createSession(data) {
        try {
            // Generate unique share code
            let shareCode = this.generateShareCode();
            while (await prisma.mvpSession.findUnique({ where: { shareCode } })) {
                shareCode = this.generateShareCode();
            }
            const session = await prisma.mvpSession.create({
                data: {
                    name: data.name,
                    scheduledAt: data.scheduledAt,
                    location: data.location,
                    maxPlayers: data.maxPlayers || 20,
                    ownerName: data.ownerName,
                    ownerDeviceId: data.ownerDeviceId,
                    shareCode,
                    skillLevel: data.skillLevel,
                    cost: data.cost,
                    description: data.description,
                    courtCount: data.courtCount || 1,
                    status: 'ACTIVE',
                    // Discovery fields (type assertion for new fields)
                    ...(data.latitude !== undefined && { latitude: data.latitude }),
                    ...(data.longitude !== undefined && { longitude: data.longitude }),
                    ...(data.courtType && { courtType: data.courtType }),
                    ...(data.visibility && { visibility: data.visibility }),
                    ...(data.maxDuration !== undefined && { maxDuration: data.maxDuration }),
                    ...(data.isRecurring !== undefined && { isRecurring: data.isRecurring }),
                    ...(data.recurrencePattern && { recurrencePattern: data.recurrencePattern })
                }
            });
            return session;
        }
        catch (error) {
            console.error('Error creating MVP session:', error);
            throw new Error('Failed to create session');
        }
    }
    /**
     * Get session by share code with optional player inclusion
     */
    static async getSessionByShareCode(shareCode, includePlayers = false) {
        try {
            const session = await prisma.mvpSession.findUnique({
                where: { shareCode },
                include: includePlayers ? {
                    players: {
                        select: {
                            id: true,
                            name: true,
                            deviceId: true,
                            status: true,
                            joinedAt: true,
                            gamesPlayed: true,
                            wins: true,
                            losses: true
                        },
                        orderBy: { joinedAt: 'asc' }
                    }
                } : undefined
            });
            return session;
        }
        catch (error) {
            console.error('Error fetching session by share code:', error);
            throw new Error('Failed to fetch session');
        }
    }
    /**
     * Get all active sessions
     */
    static async getActiveSessions(limit = 50, offset = 0) {
        try {
            const sessions = await prisma.mvpSession.findMany({
                where: { status: 'ACTIVE' },
                include: {
                    players: {
                        select: {
                            id: true,
                            name: true,
                            status: true,
                            joinedAt: true
                        },
                        orderBy: { joinedAt: 'asc' }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset
            });
            return sessions;
        }
        catch (error) {
            console.error('Error fetching active sessions:', error);
            throw new Error('Failed to fetch sessions');
        }
    }
    /**
     * Update session details
     */
    static async updateSession(shareCode, data, ownerDeviceId) {
        try {
            // Verify ownership if deviceId provided
            if (ownerDeviceId) {
                const session = await prisma.mvpSession.findUnique({
                    where: { shareCode }
                });
                if (!session) {
                    throw new Error('Session not found');
                }
                if (session.ownerDeviceId && session.ownerDeviceId !== ownerDeviceId) {
                    throw new Error('Unauthorized: Only session owner can update');
                }
            }
            const updatedSession = await prisma.mvpSession.update({
                where: { shareCode },
                data
            });
            return updatedSession;
        }
        catch (error) {
            console.error('Error updating session:', error);
            throw error;
        }
    }
    /**
     * Terminate session (set to CANCELLED)
     */
    static async terminateSession(shareCode, ownerDeviceId) {
        try {
            const session = await prisma.mvpSession.findUnique({
                where: { shareCode }
            });
            if (!session) {
                throw new Error('Session not found');
            }
            if (session.ownerDeviceId !== ownerDeviceId) {
                throw new Error('Unauthorized: Only session owner can terminate');
            }
            const updatedSession = await prisma.mvpSession.update({
                where: { shareCode },
                data: { status: 'CANCELLED' }
            });
            return updatedSession;
        }
        catch (error) {
            console.error('Error terminating session:', error);
            throw error;
        }
    }
    /**
     * Reactivate terminated session
     */
    static async reactivateSession(shareCode, ownerDeviceId) {
        try {
            const session = await prisma.mvpSession.findUnique({
                where: { shareCode }
            });
            if (!session) {
                throw new Error('Session not found');
            }
            if (session.ownerDeviceId !== ownerDeviceId) {
                throw new Error('Unauthorized: Only session owner can reactivate');
            }
            if (session.status !== 'CANCELLED') {
                throw new Error('Only cancelled sessions can be reactivated');
            }
            // Check if session is not past due
            const now = new Date();
            if (session.scheduledAt < now) {
                throw new Error('Cannot reactivate session that is past its scheduled time');
            }
            const updatedSession = await prisma.mvpSession.update({
                where: { shareCode },
                data: { status: 'ACTIVE' }
            });
            return updatedSession;
        }
        catch (error) {
            console.error('Error reactivating session:', error);
            throw error;
        }
    }
    /**
     * Get sessions owned by a specific device
     */
    static async getSessionsByOwner(deviceId) {
        try {
            const sessions = await prisma.mvpSession.findMany({
                where: {
                    ownerDeviceId: deviceId,
                    status: 'ACTIVE'
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
                        orderBy: { joinedAt: 'asc' }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
            return sessions;
        }
        catch (error) {
            console.error('Error fetching sessions by owner:', error);
            throw new Error('Failed to fetch owned sessions');
        }
    }
    /**
     * Generate a unique 6-character share code
     */
    static generateShareCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}
exports.MvpSessionService = MvpSessionService;
//# sourceMappingURL=mvpSessionService.js.map