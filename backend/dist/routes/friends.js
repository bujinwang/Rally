"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const friendsService_1 = require("../services/friendsService");
const validation_1 = require("../utils/validation");
const joi_1 = __importDefault(require("joi"));
const router = (0, express_1.Router)();
// Validation schemas
const sendFriendRequestSchema = joi_1.default.object({
    receiverId: joi_1.default.string().uuid().required(),
    message: joi_1.default.string().max(500).optional()
});
const respondToRequestSchema = joi_1.default.object({
    requestId: joi_1.default.string().uuid().required(),
    accept: joi_1.default.boolean().required()
});
/**
 * @route POST /api/friends/request
 * @desc Send a friend request
 * @access Private
 */
router.post('/request', (0, validation_1.validate)(sendFriendRequestSchema), async (req, res) => {
    try {
        const { receiverId, message } = req.body;
        const senderId = 'player-123'; // Mock user ID for MVP
        const friendRequest = await friendsService_1.friendsService.sendFriendRequest({
            senderId,
            receiverId,
            message
        });
        res.status(201).json({
            success: true,
            data: friendRequest,
            message: 'Friend request sent successfully'
        });
    }
    catch (error) {
        res.status(400).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to send friend request'
        });
    }
});
/**
 * @route POST /api/friends/respond
 * @desc Respond to a friend request
 * @access Private
 */
router.post('/respond', (0, validation_1.validate)(respondToRequestSchema), async (req, res) => {
    try {
        const { requestId, accept } = req.body;
        const userId = 'player-123'; // Mock user ID for MVP
        const response = await friendsService_1.friendsService.respondToFriendRequest(requestId, userId, userId, accept);
        res.json({
            success: true,
            data: response,
            message: accept ? 'Friend request accepted' : 'Friend request declined'
        });
    }
    catch (error) {
        res.status(400).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to respond to friend request'
        });
    }
});
/**
 * @route GET /api/friends/requests
 * @desc Get friend requests for the current user
 * @access Private
 */
router.get('/requests', async (req, res) => {
    try {
        const userId = 'player-123'; // Mock user ID for MVP
        const type = req.query.type || 'received';
        const requests = await friendsService_1.friendsService.getFriendRequests(userId, type);
        res.json({
            success: true,
            data: requests,
            count: requests.length
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch friend requests'
        });
    }
});
/**
 * @route GET /api/friends
 * @desc Get user's friends list
 * @access Private
 */
router.get('/', async (req, res) => {
    try {
        const userId = 'player-123'; // Mock user ID for MVP
        const friends = await friendsService_1.friendsService.getFriends(userId);
        res.json({
            success: true,
            data: friends,
            count: friends.length
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch friends list'
        });
    }
});
/**
 * @route DELETE /api/friends/:friendId
 * @desc Remove a friend
 * @access Private
 */
router.delete('/:friendId', async (req, res) => {
    try {
        const { friendId } = req.params;
        const userId = 'player-123'; // Mock user ID for MVP
        const result = await friendsService_1.friendsService.removeFriend(userId, friendId);
        res.json(result);
    }
    catch (error) {
        res.status(400).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to remove friend'
        });
    }
});
/**
 * @route POST /api/friends/block/:userId
 * @desc Block a user
 * @access Private
 */
router.post('/block/:userId', async (req, res) => {
    try {
        const { userId: targetUserId } = req.params;
        const userId = 'player-123'; // Mock user ID for MVP
        const result = await friendsService_1.friendsService.blockUser(userId, targetUserId);
        res.json(result);
    }
    catch (error) {
        res.status(400).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to block user'
        });
    }
});
/**
 * @route POST /api/friends/unblock/:userId
 * @desc Unblock a user
 * @access Private
 */
router.post('/unblock/:userId', async (req, res) => {
    try {
        const { userId: targetUserId } = req.params;
        const userId = 'player-123'; // Mock user ID for MVP
        const result = await friendsService_1.friendsService.unblockUser(userId, targetUserId);
        res.json(result);
    }
    catch (error) {
        res.status(400).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to unblock user'
        });
    }
});
/**
 * @route GET /api/friends/blocked
 * @desc Get blocked users list
 * @access Private
 */
router.get('/blocked', async (req, res) => {
    try {
        const userId = 'player-123'; // Mock user ID for MVP
        const blockedUsers = await friendsService_1.friendsService.getBlockedUsers(userId);
        res.json({
            success: true,
            data: blockedUsers,
            count: blockedUsers.length
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch blocked users'
        });
    }
});
/**
 * @route GET /api/friends/stats
 * @desc Get friend statistics
 * @access Private
 */
router.get('/stats', async (req, res) => {
    try {
        const userId = 'player-123'; // Mock user ID for MVP
        const stats = await friendsService_1.friendsService.getFriendStats(userId);
        res.json({
            success: true,
            data: stats
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch friend statistics'
        });
    }
});
/**
 * @route GET /api/friends/check/:userId
 * @desc Check if two users are friends
 * @access Private
 */
router.get('/check/:userId', async (req, res) => {
    try {
        const { userId: otherUserId } = req.params;
        const userId = 'player-123'; // Mock user ID for MVP
        const areFriends = await friendsService_1.friendsService.areFriends(userId, otherUserId);
        res.json({
            success: true,
            data: { areFriends }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to check friendship status'
        });
    }
});
exports.default = router;
//# sourceMappingURL=friends.js.map