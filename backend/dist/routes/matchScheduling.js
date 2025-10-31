"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const simpleMatchScheduler_1 = require("../services/simpleMatchScheduler");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// POST /api/match-scheduling - Create a scheduled match
router.post('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const { sessionId, title, description, scheduledAt, duration, location, courtName, player1Id, player2Id, matchType, createdBy } = req.body;
        // Validate required fields
        if (!sessionId || !title || !scheduledAt || !player1Id || !matchType) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Missing required fields: sessionId, title, scheduledAt, player1Id, matchType'
                }
            });
        }
        // Validate scheduled time is in the future
        const scheduledDate = new Date(scheduledAt);
        if (scheduledDate <= new Date()) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Scheduled time must be in the future'
                }
            });
        }
        // Validate match type
        if (!['SINGLES', 'DOUBLES'].includes(matchType)) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid match type. Must be SINGLES or DOUBLES'
                }
            });
        }
        // Check for basic conflicts
        const playerIds = [player1Id, player2Id].filter((id) => id !== undefined);
        const hasConflict = await simpleMatchScheduler_1.SimpleMatchScheduler.checkBasicConflicts(sessionId, scheduledDate, courtName, playerIds);
        if (hasConflict) {
            return res.status(409).json({
                success: false,
                error: {
                    code: 'SCHEDULE_CONFLICT',
                    message: 'Schedule conflict detected. Please choose a different time or court.'
                }
            });
        }
        const matchData = {
            sessionId,
            title,
            description,
            scheduledAt: scheduledDate,
            duration,
            location,
            courtName,
            player1Id,
            player2Id,
            matchType,
            createdBy: createdBy || req.user?.id || 'system'
        };
        const scheduledMatch = await simpleMatchScheduler_1.SimpleMatchScheduler.createScheduledMatch(matchData);
        res.status(201).json({
            success: true,
            data: scheduledMatch,
            message: 'Match scheduled successfully'
        });
    }
    catch (error) {
        console.error('Error scheduling match:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to schedule match'
            }
        });
    }
});
// GET /api/match-scheduling/session/:sessionId - Get scheduled matches for a session
router.get('/session/:sessionId', auth_1.authenticateToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const matches = await simpleMatchScheduler_1.SimpleMatchScheduler.getScheduledMatchesForSession(sessionId);
        res.json({
            success: true,
            data: {
                matches,
                total: matches.length
            }
        });
    }
    catch (error) {
        console.error('Error fetching scheduled matches:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch scheduled matches'
            }
        });
    }
});
// GET /api/match-scheduling/player/:playerId - Get scheduled matches for a player
router.get('/player/:playerId', auth_1.authenticateToken, async (req, res) => {
    try {
        const { playerId } = req.params;
        const matches = await simpleMatchScheduler_1.SimpleMatchScheduler.getScheduledMatchesForPlayer(playerId);
        res.json({
            success: true,
            data: {
                matches,
                total: matches.length
            }
        });
    }
    catch (error) {
        console.error('Error fetching player matches:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch player matches'
            }
        });
    }
});
// PUT /api/match-scheduling/:matchId/cancel - Cancel a scheduled match
router.put('/:matchId/cancel', auth_1.authenticateToken, async (req, res) => {
    try {
        const { matchId } = req.params;
        const { cancelledBy } = req.body;
        const cancelledMatch = await simpleMatchScheduler_1.SimpleMatchScheduler.cancelScheduledMatch(matchId, cancelledBy || req.user?.id || 'system');
        res.json({
            success: true,
            data: cancelledMatch,
            message: 'Match cancelled successfully'
        });
    }
    catch (error) {
        console.error('Error cancelling match:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to cancel match'
            }
        });
    }
});
// GET /api/match-scheduling/upcoming - Get upcoming matches for the current user
router.get('/upcoming', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'AUTH_REQUIRED',
                    message: 'User authentication required'
                }
            });
        }
        // For now, return empty array since we're using MVP models
        // In a real implementation, this would fetch upcoming matches
        const upcomingMatches = [];
        res.json({
            success: true,
            data: {
                matches: upcomingMatches,
                total: upcomingMatches.length
            }
        });
    }
    catch (error) {
        console.error('Error fetching upcoming matches:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch upcoming matches'
            }
        });
    }
});
exports.default = router;
//# sourceMappingURL=matchScheduling.js.map