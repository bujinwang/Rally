import { Router, Request } from 'express';
import { FriendService } from '../services/friendService';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../utils/validation';
import Joi from 'joi';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Extend Request type for TypeScript
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string | null;
    role: string;
  };
}

// Validation schemas
const sendFriendRequestSchema = Joi.object({
  receiverId: Joi.string().required(),
  message: Joi.string().max(500).optional()
});

/**
 * @route POST /api/v1/friends/requests
 * @desc Send a friend request
 * @access Private
 */
router.post('/requests', validate(sendFriendRequestSchema), async (req: AuthRequest, res) => {
  try {
    const { receiverId, message } = req.body;
    const senderId = req.user?.id;

    if (!senderId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    if (senderId === receiverId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Cannot send friend request to yourself' },
        timestamp: new Date().toISOString()
      });
    }

    const friendRequest = await FriendService.sendFriendRequest({
      senderId,
      receiverId,
      message
    });

    res.status(201).json({
      success: true,
      data: friendRequest,
      message: 'Friend request sent successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to send friend request'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route PUT /api/v1/friends/requests/:requestId
 * @desc Respond to a friend request (accept or decline)
 * @access Private
 */
router.put('/requests/:requestId', async (req: AuthRequest, res) => {
  try {
    const { requestId } = req.params;
    const { accept } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    if (typeof accept !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '"accept" must be a boolean' },
        timestamp: new Date().toISOString()
      });
    }

    const response = await FriendService.respondToFriendRequest(requestId, userId, accept);

    res.json({
      success: true,
      data: response,
      message: accept ? 'Friend request accepted' : 'Friend request declined',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Respond to friend request error:', error);
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to respond to friend request'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/v1/friends/requests
 * @desc Get friend requests (sent or received)
 * @access Private
 */
router.get('/requests', async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const type = (req.query.type as 'sent' | 'received') || 'received';

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const requests = await FriendService.getFriendRequests(userId, type);

    res.json({
      success: true,
      data: requests,
      count: requests.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch friend requests' },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/v1/friends
 * @desc Get user's friends list
 * @access Private
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const friends = await FriendService.getFriends(userId);

    res.json({
      success: true,
      data: friends,
      count: friends.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch friends list' },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route DELETE /api/v1/friends/:friendId
 * @desc Remove a friend
 * @access Private
 */
router.delete('/:friendId', async (req: AuthRequest, res) => {
  try {
    const { friendId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const result = await FriendService.removeFriend(userId, friendId);

    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to remove friend'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/v1/friends/block/:userId
 * @desc Block a user
 * @access Private
 */
router.post('/block/:targetUserId', async (req: AuthRequest, res) => {
  try {
    const { targetUserId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    if (userId === targetUserId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Cannot block yourself' },
        timestamp: new Date().toISOString()
      });
    }

    const result = await FriendService.blockUser(userId, targetUserId);

    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to block user'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route DELETE /api/v1/friends/block/:userId
 * @desc Unblock a user
 * @access Private
 */
router.delete('/block/:targetUserId', async (req: AuthRequest, res) => {
  try {
    const { targetUserId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const result = await FriendService.unblockUser(userId, targetUserId);

    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to unblock user'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/v1/friends/blocked
 * @desc Get blocked users list
 * @access Private
 */
router.get('/blocked', async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const blockedUsers = await FriendService.getBlockedUsers(userId);

    res.json({
      success: true,
      data: blockedUsers,
      count: blockedUsers.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch blocked users' },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/v1/friends/stats
 * @desc Get friend statistics
 * @access Private
 */
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const stats = await FriendService.getFriendStats(userId);

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get friend stats error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch friend statistics' },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/v1/friends/check/:userId
 * @desc Check if two users are friends
 * @access Private
 */
router.get('/check/:otherUserId', async (req: AuthRequest, res) => {
  try {
    const { otherUserId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const areFriends = await FriendService.areFriends(userId, otherUserId);

    res.json({
      success: true,
      data: { areFriends },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Check friendship error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to check friendship status' },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/v1/friends/suggestions
 * @desc Get friend suggestions
 * @access Private
 */
router.get('/suggestions', async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const suggestions = await FriendService.getFriendSuggestions(userId, limit);

    res.json({
      success: true,
      data: suggestions,
      count: suggestions.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get friend suggestions error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch friend suggestions' },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
