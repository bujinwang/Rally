import { Router } from 'express';
import { friendsService } from '../services/friendsService';
import { validate } from '../utils/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const sendFriendRequestSchema = Joi.object({
  receiverId: Joi.string().uuid().required(),
  message: Joi.string().max(500).optional()
});

const respondToRequestSchema = Joi.object({
  requestId: Joi.string().uuid().required(),
  accept: Joi.boolean().required()
});

/**
 * @route POST /api/friends/request
 * @desc Send a friend request
 * @access Private
 */
router.post('/request', validate(sendFriendRequestSchema), async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    const senderId = 'player-123'; // Mock user ID for MVP

    const friendRequest = await friendsService.sendFriendRequest({
      senderId,
      receiverId,
      message
    });

    res.status(201).json({
      success: true,
      data: friendRequest,
      message: 'Friend request sent successfully'
    });
  } catch (error) {
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
router.post('/respond', validate(respondToRequestSchema), async (req, res) => {
  try {
    const { requestId, accept } = req.body;
    const userId = 'player-123'; // Mock user ID for MVP

    const response = await friendsService.respondToFriendRequest(requestId, userId, userId, accept);

    res.json({
      success: true,
      data: response,
      message: accept ? 'Friend request accepted' : 'Friend request declined'
    });
  } catch (error) {
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
    const type = (req.query.type as 'sent' | 'received') || 'received';

    const requests = await friendsService.getFriendRequests(userId, type);

    res.json({
      success: true,
      data: requests,
      count: requests.length
    });
  } catch (error) {
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

    const friends = await friendsService.getFriends(userId);

    res.json({
      success: true,
      data: friends,
      count: friends.length
    });
  } catch (error) {
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

    const result = await friendsService.removeFriend(userId, friendId);

    res.json(result);
  } catch (error) {
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

    const result = await friendsService.blockUser(userId, targetUserId);

    res.json(result);
  } catch (error) {
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

    const result = await friendsService.unblockUser(userId, targetUserId);

    res.json(result);
  } catch (error) {
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

    const blockedUsers = await friendsService.getBlockedUsers(userId);

    res.json({
      success: true,
      data: blockedUsers,
      count: blockedUsers.length
    });
  } catch (error) {
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

    const stats = await friendsService.getFriendStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
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

    const areFriends = await friendsService.areFriends(userId, otherUserId);

    res.json({
      success: true,
      data: { areFriends }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check friendship status'
    });
  }
});

export default router;