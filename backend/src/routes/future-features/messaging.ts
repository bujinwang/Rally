import { Router } from 'express';
import { messagingService } from '../services/messagingService';
import { validate } from '../utils/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createThreadSchema = Joi.object({
  participants: Joi.array().items(Joi.string().uuid()).min(2).required(),
  title: Joi.string().max(100).optional()
});

const sendMessageSchema = Joi.object({
  threadId: Joi.string().uuid().required(),
  content: Joi.string().min(1).max(1000).required(),
  messageType: Joi.string().valid('TEXT', 'IMAGE', 'SYSTEM', 'CHALLENGE').optional()
});

const addParticipantsSchema = Joi.object({
  participants: Joi.array().items(Joi.string().uuid()).min(1).required()
});

/**
 * @route POST /api/messaging/threads
 * @desc Create a new message thread
 * @access Private
 */
router.post('/threads', validate(createThreadSchema), async (req, res) => {
  try {
    const { participants, title } = req.body;

    const thread = await messagingService.createThread({
      participants,
      title
    });

    res.status(201).json({
      success: true,
      data: thread,
      message: 'Thread created successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create thread'
    });
  }
});

/**
 * @route POST /api/messaging/messages
 * @desc Send a message
 * @access Private
 */
router.post('/messages', validate(sendMessageSchema), async (req, res) => {
  try {
    const { threadId, content, messageType } = req.body;
    const senderId = 'player-123'; // Mock user ID for MVP

    const message = await messagingService.sendMessage({
      threadId,
      senderId,
      content,
      messageType
    });

    res.status(201).json({
      success: true,
      data: message,
      message: 'Message sent successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to send message'
    });
  }
});

/**
 * @route GET /api/messaging/threads
 * @desc Get user's message threads
 * @access Private
 */
router.get('/threads', async (req, res) => {
  try {
    const userId = 'player-123'; // Mock user ID for MVP

    const threads = await messagingService.getUserThreads(userId);

    res.json({
      success: true,
      data: threads,
      count: threads.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch threads'
    });
  }
});

/**
 * @route GET /api/messaging/threads/:threadId/messages
 * @desc Get messages for a thread
 * @access Private
 */
router.get('/threads/:threadId/messages', async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = 'player-123'; // Mock user ID for MVP
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const messages = await messagingService.getThreadMessages(threadId, userId, limit, offset);

    res.json({
      success: true,
      data: messages,
      count: messages.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to fetch messages'
    });
  }
});

/**
 * @route POST /api/messaging/threads/:threadId/read
 * @desc Mark messages as read in a thread
 * @access Private
 */
router.post('/threads/:threadId/read', async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = 'player-123'; // Mock user ID for MVP

    const result = await messagingService.markMessagesAsRead(threadId, userId);

    res.json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to mark messages as read'
    });
  }
});

/**
 * @route GET /api/messaging/unread
 * @desc Get unread messages count
 * @access Private
 */
router.get('/unread', async (req, res) => {
  try {
    const userId = 'player-123'; // Mock user ID for MVP

    const count = await messagingService.getUnreadCount(userId);

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count'
    });
  }
});

/**
 * @route GET /api/messaging/threads/:threadId/unread
 * @desc Get unread count for a specific thread
 * @access Private
 */
router.get('/threads/:threadId/unread', async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = 'player-123'; // Mock user ID for MVP

    const count = await messagingService.getThreadUnreadCount(threadId, userId);

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to fetch thread unread count'
    });
  }
});

/**
 * @route DELETE /api/messaging/messages/:messageId
 * @desc Delete a message
 * @access Private
 */
router.delete('/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = 'player-123'; // Mock user ID for MVP

    const result = await messagingService.deleteMessage(messageId, userId);

    res.json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete message'
    });
  }
});

/**
 * @route POST /api/messaging/threads/:threadId/leave
 * @desc Leave a message thread
 * @access Private
 */
router.post('/threads/:threadId/leave', async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = 'player-123'; // Mock user ID for MVP

    const result = await messagingService.leaveThread(threadId, userId);

    res.json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to leave thread'
    });
  }
});

/**
 * @route POST /api/messaging/threads/:threadId/participants
 * @desc Add participants to a thread
 * @access Private
 */
router.post('/threads/:threadId/participants', validate(addParticipantsSchema), async (req, res) => {
  try {
    const { threadId } = req.params;
    const { participants } = req.body;
    const userId = 'player-123'; // Mock user ID for MVP

    const result = await messagingService.addParticipants(threadId, userId, participants);

    res.json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to add participants'
    });
  }
});

/**
 * @route GET /api/messaging/threads/:threadId
 * @desc Get thread details
 * @access Private
 */
router.get('/threads/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = 'player-123'; // Mock user ID for MVP

    const thread = await messagingService.getThreadDetails(threadId, userId);

    res.json({
      success: true,
      data: thread
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to fetch thread details'
    });
  }
});

/**
 * @route GET /api/messaging/threads/:threadId/search
 * @desc Search messages in a thread
 * @access Private
 */
router.get('/threads/:threadId/search', async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = 'player-123'; // Mock user ID for MVP
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const messages = await messagingService.searchMessages(threadId, userId, query, limit);

    res.json({
      success: true,
      data: messages,
      count: messages.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to search messages'
    });
  }
});

export default router;