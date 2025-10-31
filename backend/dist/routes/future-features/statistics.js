"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const statisticsService_1 = require("../services/statisticsService");
const router = (0, express_1.Router)();
/**
 * GET /api/statistics/player/:playerId
 * Get comprehensive statistics for a specific player
 */
router.get('/player/:playerId', async (req, res) => {
    try {
        const { playerId } = req.params;
        const { sessionId, timeRange, minMatches } = req.query;
        const filters = {
            sessionId: sessionId,
            timeRange: timeRange,
            minMatches: minMatches ? parseInt(minMatches) : undefined,
        };
        const stats = await statisticsService_1.statisticsService.getPlayerStatistics(playerId, filters);
        if (!stats) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'PLAYER_NOT_FOUND',
                    message: 'Player not found or has no matches'
                }
            });
        }
        res.json({
            success: true,
            data: stats,
            message: 'Player statistics retrieved successfully'
        });
    }
    catch (error) {
        console.error('Error fetching player statistics:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch player statistics'
            }
        });
    }
});
/**
 * GET /api/statistics/leaderboard
 * Get leaderboard rankings
 */
router.get('/leaderboard', async (req, res) => {
    try {
        const { sessionId, minMatches, limit } = req.query;
        const filters = {
            sessionId: sessionId,
            minMatches: minMatches ? parseInt(minMatches) : 1,
        };
        const leaderboard = await statisticsService_1.statisticsService.getLeaderboard(filters);
        // Apply limit if specified
        const limitedLeaderboard = limit
            ? leaderboard.slice(0, parseInt(limit))
            : leaderboard;
        res.json({
            success: true,
            data: limitedLeaderboard,
            message: 'Leaderboard retrieved successfully'
        });
    }
    catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch leaderboard'
            }
        });
    }
});
/**
 * GET /api/statistics/session/:sessionId
 * Get statistics for a specific session
 */
router.get('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const sessionStats = await statisticsService_1.statisticsService.getSessionStatistics(sessionId);
        if (!sessionStats) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'SESSION_NOT_FOUND',
                    message: 'Session not found'
                }
            });
        }
        res.json({
            success: true,
            data: sessionStats,
            message: 'Session statistics retrieved successfully'
        });
    }
    catch (error) {
        console.error('Error fetching session statistics:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch session statistics'
            }
        });
    }
});
/**
 * GET /api/statistics/compare
 * Compare multiple players' statistics
 */
router.get('/compare', async (req, res) => {
    try {
        const { playerIds, sessionId, timeRange } = req.query;
        if (!playerIds) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'playerIds parameter is required'
                }
            });
        }
        const playerIdsArray = Array.isArray(playerIds)
            ? playerIds
            : playerIds.split(',');
        const filters = {
            sessionId: sessionId,
            timeRange: timeRange,
        };
        const comparison = await statisticsService_1.statisticsService.getPlayerComparison(playerIdsArray, filters);
        res.json({
            success: true,
            data: comparison,
            message: 'Player comparison retrieved successfully'
        });
    }
    catch (error) {
        console.error('Error comparing players:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to compare players'
            }
        });
    }
});
/**
 * GET /api/statistics/trends/:playerId
 * Get performance trends for a player
 */
router.get('/trends/:playerId', async (req, res) => {
    try {
        const { playerId } = req.params;
        const { days } = req.query;
        const daysNum = days ? parseInt(days) : 30;
        const trends = await statisticsService_1.statisticsService.getPerformanceTrends(playerId, daysNum);
        res.json({
            success: true,
            data: trends,
            message: 'Performance trends retrieved successfully'
        });
    }
    catch (error) {
        console.error('Error fetching performance trends:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch performance trends'
            }
        });
    }
});
exports.default = router;
//# sourceMappingURL=statistics.js.map