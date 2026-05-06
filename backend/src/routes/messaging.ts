import { Router, Request } from 'express';
import { messagingService } from '../services/messagingService';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../utils/validation';
import Joi from 'joi';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Extend Request type
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string | null;
    role: string;
  };
}

// Validation schemas
const createThreadSchema = Joi.object({
  participants: Joi.array().items(Joi.string()).min(1).required(),
  title: Joi.string().max(100).optional()
});

const sendMessageSchema = Joi.object({
  threadId: Joi.string().required(),
  content: Joi.string().min(1).max(1000).required(),
  messageType: Joi.string().valid('TEXT', 'IMAGE', 'SYSTEM', 'CHALLENGE').optional()
});

const addParticipantsSchema = Joi.object({
  participants: Joi.array().items(Joi.string()).min(1).required()
});

/**
 * @route POST /api/v1/messaging/threads
 * @desc Create a new message thread
 * @access Private
 */
router.post('/threads', validate(createThreadSchema), async (req: AuthRequest, res) => {
  try {
    const { participants, title } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    // Ensure current user is included in participants
    const allParticipants = participants.includes(userId) ? participants : [userId, ...participants];

    const thread = await messagingService.createThread({
      participants: allParticipants,
      title
    });

    res.status(201).json({
      success: true,
      data: thread,
      message: 'Thread created successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Create thread error:', error);
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to create thread'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/v1/messaging/messages
 * @desc Send a message
 * @access Private
 */
router.post('/messages', validate(sendMessageSchema), async (req: AuthRequest, res) => {
  try {
    const { threadId, content, messageType } = req.body;
    const senderId = req.user?.id;

    if (!senderId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const message = await messagingService.sendMessage({
      threadId,
      senderId,
      content,
      messageType
    });

    res.status(201).json({
      success: true,
      data: message,
      message: 'Message sent successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to send message'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/v1/messaging/threads
 * @desc Get user's message threads
 * @access Private
 */
router.get('/threads', async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const threads = await messagingService.getUserThreads(userId);

    res.json({
      success: true,
      data: threads,
      count: threads.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get threads error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch threads' },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/v1/messaging/threads/:threadId/messages
 * @desc Get messages for a thread
 * @access Private
 */
router.get('/threads/:threadId/messages', async (req: AuthRequest, res) => {
  try {
    const { threadId } = req.params;
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const messages = await messagingService.getThreadMessages(threadId, userId, limit, offset);

    res.json({
      success: true,
      data: messages,
      count: messages.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch messages'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/v1/messaging/threads/:threadId/read
 * @desc Mark messages as read in a thread
 * @access Private
 */
router.post('/threads/:threadId/read', async (req: AuthRequest, res) => {
  try {
    const { threadId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const result = await messagingService.markMessagesAsRead(threadId, userId);

    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to mark messages as read'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/v1/messaging/unread
 * @desc Get unread messages count
 * @access Private
 */
router.get('/unread', async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const count = await messagingService.getUnreadCount(userId);

    res.json({
      success: true,
      data: { count },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch unread count' },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/v1/messaging/threads/:threadId/unread
 * @desc Get unread count for a specific thread
 * @access Private
 */
router.get('/threads/:threadId/unread', async (req: AuthRequest, res) => {
  try {
    const { threadId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const count = await messagingService.getThreadUnreadCount(threadId, userId);

    res.json({
      success: true,
      data: { count },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get thread unread count error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch thread unread count' },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route DELETE /api/v1/messaging/messages/:messageId
 * @desc Delete a message
 * @access Private
 */
router.delete('/messages/:messageId', async (req: AuthRequest, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const result = await messagingService.deleteMessage(messageId, userId);

    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to delete message'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/v1/messaging/threads/:threadId/leave
 * @desc Leave a message thread
 * @access Private
 */
router.post('/threads/:threadId/leave', async (req: AuthRequest, res) => {
  try {
    const { threadId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const result = await messagingService.leaveThread(threadId, userId);

    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Leave thread error:', error);
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to leave thread'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/v1/messaging/threads/:threadId/participants
 * @desc Add participants to a thread
 * @access Private
 */
router.post('/threads/:threadId/participants', validate(addParticipantsSchema), async (req: AuthRequest, res) => {
  try {
    const { threadId } = req.params;
    const { participants } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const result = await messagingService.addParticipants(threadId, userId, participants);

    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Add participants error:', error);
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to add participants'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/v1/messaging/threads/:threadId
 * @desc Get thread details
 * @access Private
 */
router.get('/threads/:threadId', async (req: AuthRequest, res) => {
  try {
    const { threadId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    const thread = await messagingService.getThreadDetails(threadId, userId);

    res.json({
      success: true,
      data: thread,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get thread details error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch thread details'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/v1/messaging/threads/:threadId/search
 * @desc Search messages in a thread
 * @access Private
 */
router.get('/threads/:threadId/search', async (req: AuthRequest, res) => {
  try {
    const { threadId } = req.params;
    const userId = req.user?.id;
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString()
      });
    }

    if (!query) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Search query is required' },
        timestamp: new Date().toISOString()
      });
    }

    const messages = await messagingService.searchMessages(threadId, userId, query, limit);

    res.json({
      success: true,
      data: messages,
      count: messages.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to search messages'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
