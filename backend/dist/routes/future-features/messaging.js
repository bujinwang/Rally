"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const messagingService_1 = require("../services/messagingService");
const validation_1 = require("../utils/validation");
const joi_1 = __importDefault(require("joi"));
const router = (0, express_1.Router)();
// Validation schemas
const createThreadSchema = joi_1.default.object({
    participants: joi_1.default.array().items(joi_1.default.string().uuid()).min(2).required(),
    title: joi_1.default.string().max(100).optional()
});
const sendMessageSchema = joi_1.default.object({
    threadId: joi_1.default.string().uuid().required(),
    content: joi_1.default.string().min(1).max(1000).required(),
    messageType: joi_1.default.string().valid('TEXT', 'IMAGE', 'SYSTEM', 'CHALLENGE').optional()
});
const addParticipantsSchema = joi_1.default.object({
    participants: joi_1.default.array().items(joi_1.default.string().uuid()).min(1).required()
});
/**
 * @route POST /api/messaging/threads
 * @desc Create a new message thread
 * @access Private
 */
router.post('/threads', (0, validation_1.validate)(createThreadSchema), async (req, res) => {
    try {
        const { participants, title } = req.body;
        const thread = await messagingService_1.messagingService.createThread({
            participants,
            title
        });
        res.status(201).json({
            success: true,
            data: thread,
            message: 'Thread created successfully'
        });
    }
    catch (error) {
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
router.post('/messages', (0, validation_1.validate)(sendMessageSchema), async (req, res) => {
    try {
        const { threadId, content, messageType } = req.body;
        const senderId = 'player-123'; // Mock user ID for MVP
        const message = await messagingService_1.messagingService.sendMessage({
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
    }
    catch (error) {
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
        const threads = await messagingService_1.messagingService.getUserThreads(userId);
        res.json({
            success: true,
            data: threads,
            count: threads.length
        });
    }
    catch (error) {
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
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const messages = await messagingService_1.messagingService.getThreadMessages(threadId, userId, limit, offset);
        res.json({
            success: true,
            data: messages,
            count: messages.length
        });
    }
    catch (error) {
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
        const result = await messagingService_1.messagingService.markMessagesAsRead(threadId, userId);
        res.json(result);
    }
    catch (error) {
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
        const count = await messagingService_1.messagingService.getUnreadCount(userId);
        res.json({
            success: true,
            data: { count }
        });
    }
    catch (error) {
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
        const count = await messagingService_1.messagingService.getThreadUnreadCount(threadId, userId);
        res.json({
            success: true,
            data: { count }
        });
    }
    catch (error) {
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
        const result = await messagingService_1.messagingService.deleteMessage(messageId, userId);
        res.json(result);
    }
    catch (error) {
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
        const result = await messagingService_1.messagingService.leaveThread(threadId, userId);
        res.json(result);
    }
    catch (error) {
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
router.post('/threads/:threadId/participants', (0, validation_1.validate)(addParticipantsSchema), async (req, res) => {
    try {
        const { threadId } = req.params;
        const { participants } = req.body;
        const userId = 'player-123'; // Mock user ID for MVP
        const result = await messagingService_1.messagingService.addParticipants(threadId, userId, participants);
        res.json(result);
    }
    catch (error) {
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
        const thread = await messagingService_1.messagingService.getThreadDetails(threadId, userId);
        res.json({
            success: true,
            data: thread
        });
    }
    catch (error) {
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
        const query = req.query.q;
        const limit = parseInt(req.query.limit) || 20;
        if (!query) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }
        const messages = await messagingService_1.messagingService.searchMessages(threadId, userId, query, limit);
        res.json({
            success: true,
            data: messages,
            count: messages.length
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to search messages'
        });
    }
});
exports.default = router;
//# sourceMappingURL=messaging.js.map