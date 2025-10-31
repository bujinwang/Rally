"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchSchedulingService = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
class MatchSchedulingService {
    /**
     * Create a new scheduled match
     */
    static async createScheduledMatch(data) {
        try {
            // Validate session exists and is active
            const session = await prisma.mvpSession.findUnique({
                where: { id: data.sessionId },
                include: { players: true }
            });
            if (!session) {
                throw new Error('Session not found');
            }
            if (session.status !== 'ACTIVE') {
                throw new Error('Cannot schedule matches for inactive sessions');
            }
            // Validate all players are in the session
            const playerIds = [data.player1Id, data.player2Id, data.player3Id, data.player4Id].filter(Boolean);
            for (const playerId of playerIds) {
                const playerInSession = session.players.find(p => p.id === playerId);
                if (!playerInSession) {
                    throw new Error(`Player ${playerId} is not a participant in this session`);
                }
            }
            // Check for scheduling conflicts
            const conflicts = await this.checkScheduleConflicts(data);
            if (conflicts.length > 0) {
                const highSeverityConflicts = conflicts.filter(c => c.severity === 'HIGH');
                if (highSeverityConflicts.length > 0) {
                    throw new Error('Schedule conflict detected: ' + highSeverityConflicts[0].conflictingMatch.title);
                }
            }
            // Create the scheduled match
            const scheduledMatch = await prisma.scheduledMatch.create({
                data: {
                    sessionId: data.sessionId,
                    title: data.title,
                    description: data.description,
                    scheduledAt: data.scheduledAt,
                    duration: data.duration || 60, // default 60 minutes
                    location: data.location,
                    courtName: data.courtName,
                    player1Id: data.player1Id,
                    player2Id: data.player2Id,
                    player3Id: data.player3Id,
                    player4Id: data.player4Id,
                    matchType: data.matchType,
                    status: 'SCHEDULED',
                    createdBy: data.createdBy,
                    reminderSent: false
                },
                include: {
                    session: { select: { id: true, name: true } }
                }
            });
            // Schedule reminders (15 minutes before match)
            const validPlayerIds = playerIds.filter((id) => id !== undefined);
            await this.scheduleReminders(scheduledMatch.id, validPlayerIds, data.scheduledAt);
            return scheduledMatch;
        }
        catch (error) {
            console.error('Error creating scheduled match:', error);
            throw error;
        }
    }
    /**
     * Get scheduled matches for a session
     */
    static async getScheduledMatchesForSession(sessionId) {
        try {
            const matches = await prisma.scheduledMatch.findMany({
                where: { sessionId },
                include: {
                    session: { select: { id: true, name: true } }
                },
                orderBy: { scheduledAt: 'asc' }
            });
            return matches;
        }
        catch (error) {
            console.error('Error fetching scheduled matches:', error);
            throw new Error('Failed to fetch scheduled matches');
        }
    }
    /**
     * Get scheduled matches for a specific player
     */
    static async getScheduledMatchesForPlayer(playerId) {
        try {
            const matches = await prisma.scheduledMatch.findMany({
                where: {
                    OR: [
                        { player1Id: playerId },
                        { player2Id: playerId },
                        { player3Id: playerId },
                        { player4Id: playerId }
                    ]
                },
                include: {
                    session: { select: { id: true, name: true } }
                },
                orderBy: { scheduledAt: 'asc' }
            });
            return matches;
        }
        catch (error) {
            console.error('Error fetching player matches:', error);
            throw new Error('Failed to fetch player matches');
        }
    }
    /**
     * Update a scheduled match
     */
    static async updateScheduledMatch(matchId, data, updatedBy) {
        try {
            const existingMatch = await prisma.scheduledMatch.findUnique({
                where: { id: matchId }
            });
            if (!existingMatch) {
                throw new Error('Scheduled match not found');
            }
            // Check for conflicts if time/location changed
            if (data.scheduledAt || data.courtName) {
                const checkData = {
                    sessionId: existingMatch.sessionId,
                    title: existingMatch.title,
                    scheduledAt: data.scheduledAt || existingMatch.scheduledAt,
                    duration: data.duration || existingMatch.duration,
                    courtName: data.courtName || existingMatch.courtName,
                    player1Id: data.player1Id || existingMatch.player1Id,
                    player2Id: data.player2Id || existingMatch.player2Id,
                    player3Id: data.player3Id || existingMatch.player3Id,
                    player4Id: data.player4Id || existingMatch.player4Id,
                    matchType: data.matchType || existingMatch.matchType,
                    createdBy: updatedBy
                };
                const conflicts = await this.checkScheduleConflicts(checkData);
                const highSeverityConflicts = conflicts.filter(c => c.severity === 'HIGH');
                if (highSeverityConflicts.length > 0) {
                    throw new Error('Schedule conflict detected: ' + highSeverityConflicts[0].conflictingMatch.title);
                }
            }
            const updatedMatch = await prisma.scheduledMatch.update({
                where: { id: matchId },
                data: {
                    ...data,
                    updatedAt: new Date()
                }
            });
            return updatedMatch;
        }
        catch (error) {
            console.error('Error updating scheduled match:', error);
            throw error;
        }
    }
    /**
     * Cancel a scheduled match
     */
    static async cancelScheduledMatch(matchId, cancelledBy) {
        try {
            const match = await prisma.scheduledMatch.findUnique({
                where: { id: matchId }
            });
            if (!match) {
                throw new Error('Scheduled match not found');
            }
            const updatedMatch = await prisma.scheduledMatch.update({
                where: { id: matchId },
                data: {
                    status: 'CANCELLED',
                    updatedAt: new Date()
                }
            });
            // Cancel reminders
            await this.cancelReminders(matchId);
            return updatedMatch;
        }
        catch (error) {
            console.error('Error cancelling scheduled match:', error);
            throw error;
        }
    }
    /**
     * Check for scheduling conflicts
     */
    static async checkScheduleConflicts(data) {
        const conflicts = [];
        const matchEndTime = new Date(data.scheduledAt.getTime() + (data.duration || 60) * 60000);
        // Check for overlapping matches on the same court
        if (data.courtName) {
            const courtConflicts = await prisma.scheduledMatch.findMany({
                where: {
                    courtName: data.courtName,
                    status: { in: ['SCHEDULED', 'CONFIRMED'] },
                    OR: [
                        {
                            AND: [
                                { scheduledAt: { lte: data.scheduledAt } },
                                {
                                    scheduledAt: {
                                        gte: new Date(data.scheduledAt.getTime() - (data.duration || 60) * 60000)
                                    }
                                }
                            ]
                        },
                        {
                            AND: [
                                { scheduledAt: { gte: data.scheduledAt } },
                                { scheduledAt: { lte: matchEndTime } }
                            ]
                        }
                    ]
                }
            });
            courtConflicts.forEach(conflict => {
                conflicts.push({
                    conflictingMatch: conflict,
                    conflictType: 'COURT_CONFLICT',
                    severity: 'HIGH'
                });
            });
        }
        // Check for double booking of players
        const playerIds = [data.player1Id, data.player2Id, data.player3Id, data.player4Id].filter(Boolean);
        for (const playerId of playerIds) {
            const playerConflicts = await prisma.scheduledMatch.findMany({
                where: {
                    OR: [
                        { player1Id: playerId },
                        { player2Id: playerId },
                        { player3Id: playerId },
                        { player4Id: playerId }
                    ],
                    status: { in: ['SCHEDULED', 'CONFIRMED'] },
                    AND: [
                        {
                            OR: [
                                {
                                    AND: [
                                        { scheduledAt: { lte: data.scheduledAt } },
                                        {
                                            scheduledAt: {
                                                gte: new Date(data.scheduledAt.getTime() - (data.duration || 60) * 60000)
                                            }
                                        }
                                    ]
                                },
                                {
                                    AND: [
                                        { scheduledAt: { gte: data.scheduledAt } },
                                        { scheduledAt: { lte: matchEndTime } }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            });
            playerConflicts.forEach(conflict => {
                conflicts.push({
                    conflictingMatch: conflict,
                    conflictType: 'DOUBLE_BOOKING',
                    severity: 'HIGH'
                });
            });
        }
        return conflicts;
    }
    /**
     * Schedule reminders for a match
     */
    static async scheduleReminders(matchId, playerIds, matchTime) {
        const reminderTime = new Date(matchTime.getTime() - 15 * 60000); // 15 minutes before
        for (const playerId of playerIds) {
            await prisma.matchReminder.create({
                data: {
                    matchId,
                    userId: playerId,
                    reminderType: 'PUSH', // Default to push notifications
                    scheduledFor: reminderTime,
                    sent: false
                }
            });
        }
    }
    /**
     * Cancel reminders for a match
     */
    static async cancelReminders(matchId) {
        await prisma.matchReminder.updateMany({
            where: { matchId, sent: false },
            data: { sent: true } // Mark as sent to prevent sending
        });
    }
    /**
     * Get upcoming matches that need reminders sent
     */
    static async getUpcomingReminders() {
        const now = new Date();
        const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60000);
        const reminders = await prisma.matchReminder.findMany({
            where: {
                scheduledFor: { lte: fifteenMinutesFromNow },
                sent: false
            },
            include: {
                match: {
                    include: {
                        session: { select: { id: true, name: true } }
                    }
                }
            }
        });
        return reminders;
    }
    /**
     * Mark reminder as sent
     */
    static async markReminderSent(reminderId) {
        await prisma.matchReminder.update({
            where: { id: reminderId },
            data: {
                sent: true,
                sentAt: new Date()
            }
        });
    }
    /**
     * Create calendar event for a match
     */
    static async createCalendarEvent(matchId, calendarId, userId) {
        const match = await prisma.scheduledMatch.findUnique({
            where: { id: matchId },
            include: {
                session: { select: { id: true, name: true } }
            }
        });
        if (!match) {
            throw new Error('Match not found');
        }
        const endTime = new Date(match.scheduledAt.getTime() + match.duration * 60000);
        const calendarEvent = await prisma.calendarEvent.create({
            data: {
                matchId,
                calendarId,
                eventId: `match_${matchId}_${userId}`, // Placeholder for external calendar ID
                title: match.title,
                description: match.description,
                startTime: match.scheduledAt,
                endTime,
                location: match.location
            }
        });
        return calendarEvent;
    }
    /**
     * Get calendar events for a user
     */
    static async getCalendarEvents(userId) {
        const events = await prisma.calendarEvent.findMany({
            where: {
                match: {
                    OR: [
                        { player1Id: userId },
                        { player2Id: userId },
                        { player3Id: userId },
                        { player4Id: userId }
                    ]
                }
            },
            include: {
                match: {
                    include: {
                        session: { select: { id: true, name: true } }
                    }
                }
            },
            orderBy: { startTime: 'asc' }
        });
        return events;
    }
}
exports.MatchSchedulingService = MatchSchedulingService;
//# sourceMappingURL=matchSchedulingService.js.map