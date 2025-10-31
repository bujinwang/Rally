import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface MessageData {
  threadId: string;
  senderId: string;
  content: string;
  messageType?: string;
}

export interface ThreadData {
  participants: string[];
  title?: string;
}

export class MessagingService {
  /**
   * Create a new message thread
   */
  async createThread(data: ThreadData) {
    // Check if a thread already exists with these exact participants
    const existingThread = await prisma.$queryRaw`
      SELECT * FROM message_threads
      WHERE participants <@ ${data.participants}::text[]
        AND participants @> ${data.participants}::text[]
        AND array_length(participants, 1) = ${data.participants.length}
    ` as any[];

    if (existingThread.length > 0) {
      return existingThread[0];
    }

    // Create new thread
    const threadId = crypto.randomUUID();
    await prisma.$queryRaw`
      INSERT INTO message_threads (id, participants, title, last_message_at)
      VALUES (${threadId}, ${data.participants}, ${data.title || null}, NOW())
    `;

    return {
      id: threadId,
      participants: data.participants,
      title: data.title,
      lastMessageAt: new Date()
    };
  }

  /**
   * Send a message
   */
  async sendMessage(data: MessageData) {
    // Verify thread exists and user is a participant
    const threadResult = await prisma.$queryRaw`
      SELECT * FROM message_threads
      WHERE id = ${data.threadId} AND ${data.senderId} = ANY(participants)
    ` as any[];

    if (threadResult.length === 0) {
      throw new Error('Thread not found or user is not a participant');
    }

    // Create message
    const messageId = crypto.randomUUID();
    await prisma.$queryRaw`
      INSERT INTO messages (id, thread_id, sender_id, content, message_type, sent_at)
      VALUES (${messageId}, ${data.threadId}, ${data.senderId}, ${data.content},
              ${data.messageType || 'TEXT'}, NOW())
    `;

    // Update thread's last message timestamp
    await prisma.$queryRaw`
      UPDATE message_threads
      SET last_message_at = NOW()
      WHERE id = ${data.threadId}
    `;

    // Get the created message with sender details
    const message = await prisma.$queryRaw`
      SELECT m.*, p.name as sender_name
      FROM messages m
      JOIN mvp_players p ON m.sender_id = p.id
      WHERE m.id = ${messageId}
    ` as any[];

    return message[0] ? {
      id: message[0].id,
      threadId: message[0].thread_id,
      senderId: message[0].sender_id,
      content: message[0].content,
      messageType: message[0].message_type,
      sentAt: new Date(message[0].sent_at),
      isRead: false,
      sender: { id: message[0].sender_id, name: message[0].sender_name }
    } : null;
  }

  /**
   * Get messages for a thread
   */
  async getThreadMessages(threadId: string, userId: string, limit: number = 50, offset: number = 0) {
    // Verify user is a participant
    const threadResult = await prisma.$queryRaw`
      SELECT * FROM message_threads
      WHERE id = ${threadId} AND ${userId} = ANY(participants)
    ` as any[];

    if (threadResult.length === 0) {
      throw new Error('Thread not found or user is not a participant');
    }

    const messages = await prisma.$queryRaw`
      SELECT m.*, p.name as sender_name
      FROM messages m
      JOIN mvp_players p ON m.sender_id = p.id
      WHERE m.thread_id = ${threadId}
      ORDER BY m.sent_at DESC
      LIMIT ${limit} OFFSET ${offset}
    ` as any[];

    return messages.map(row => ({
      id: row.id,
      threadId: row.thread_id,
      senderId: row.sender_id,
      content: row.content,
      messageType: row.message_type,
      sentAt: new Date(row.sent_at),
      isRead: row.is_read,
      readAt: row.read_at ? new Date(row.read_at) : null,
      sender: { id: row.sender_id, name: row.sender_name }
    })).reverse(); // Reverse to get chronological order
  }

  /**
   * Get user threads
   */
  async getUserThreads(userId: string) {
    const threads = await prisma.$queryRaw`
      SELECT mt.*, m.content as last_message_content, m.sent_at as last_message_time,
             p.name as last_sender_name
      FROM message_threads mt
      LEFT JOIN messages m ON mt.id = m.thread_id
        AND m.sent_at = (
          SELECT MAX(sent_at) FROM messages WHERE thread_id = mt.id
        )
      LEFT JOIN mvp_players p ON m.sender_id = p.id
      WHERE ${userId} = ANY(mt.participants)
      ORDER BY mt.last_message_at DESC
    ` as any[];

    return threads.map(row => ({
      id: row.id,
      participants: row.participants,
      title: row.title,
      lastMessageAt: new Date(row.last_message_at),
      lastMessage: row.last_message_content ? {
        content: row.last_message_content,
        sentAt: new Date(row.last_message_time),
        senderName: row.last_sender_name
      } : null
    }));
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(threadId: string, userId: string) {
    // Verify user is a participant
    const threadResult = await prisma.$queryRaw`
      SELECT * FROM message_threads
      WHERE id = ${threadId} AND ${userId} = ANY(participants)
    ` as any[];

    if (threadResult.length === 0) {
      throw new Error('Thread not found or user is not a participant');
    }

    await prisma.$queryRaw`
      UPDATE messages
      SET is_read = true, read_at = NOW()
      WHERE thread_id = ${threadId} AND sender_id != ${userId} AND is_read = false
    `;

    return { success: true, message: 'Messages marked as read' };
  }

  /**
   * Get unread messages count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const result = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM messages m
      JOIN message_threads mt ON m.thread_id = mt.id
      WHERE ${userId} = ANY(mt.participants)
        AND m.sender_id != ${userId}
        AND m.is_read = false
    ` as any[];

    return Array.isArray(result) ? parseInt((result[0] as any).count) || 0 : 0;
  }

  /**
   * Get unread count for a specific thread
   */
  async getThreadUnreadCount(threadId: string, userId: string): Promise<number> {
    const result = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM messages m
      JOIN message_threads mt ON m.thread_id = mt.id
      WHERE m.thread_id = ${threadId}
        AND ${userId} = ANY(mt.participants)
        AND m.sender_id != ${userId}
        AND m.is_read = false
    ` as any[];

    return Array.isArray(result) ? parseInt((result[0] as any).count) || 0 : 0;
  }

  /**
   * Delete a message (soft delete by marking as deleted for the user)
   */
  async deleteMessage(messageId: string, userId: string) {
    // Verify user owns the message
    const messageResult = await prisma.$queryRaw`
      SELECT * FROM messages WHERE id = ${messageId} AND sender_id = ${userId}
    ` as any[];

    if (messageResult.length === 0) {
      throw new Error('Message not found or user does not have permission to delete');
    }

    // For now, we'll physically delete the message
    // In a production system, you might want to soft delete
    await prisma.$queryRaw`
      DELETE FROM messages WHERE id = ${messageId}
    `;

    return { success: true, message: 'Message deleted successfully' };
  }

  /**
   * Leave a thread
   */
  async leaveThread(threadId: string, userId: string) {
    // Get current participants
    const threadResult = await prisma.$queryRaw`
      SELECT * FROM message_threads WHERE id = ${threadId}
    ` as any[];

    if (threadResult.length === 0) {
      throw new Error('Thread not found');
    }

    const participants = threadResult[0].participants as string[];
    const updatedParticipants = participants.filter(p => p !== userId);

    if (updatedParticipants.length === 0) {
      // If no participants left, delete the thread
      await prisma.$queryRaw`DELETE FROM message_threads WHERE id = ${threadId}`;
      await prisma.$queryRaw`DELETE FROM messages WHERE thread_id = ${threadId}`;
    } else {
      // Update participants list
      await prisma.$queryRaw`
        UPDATE message_threads
        SET participants = ${updatedParticipants}
        WHERE id = ${threadId}
      `;
    }

    return { success: true, message: 'Left thread successfully' };
  }

  /**
   * Add participants to a thread
   */
  async addParticipants(threadId: string, userId: string, newParticipants: string[]) {
    // Verify user is a participant
    const threadResult = await prisma.$queryRaw`
      SELECT * FROM message_threads
      WHERE id = ${threadId} AND ${userId} = ANY(participants)
    ` as any[];

    if (threadResult.length === 0) {
      throw new Error('Thread not found or user is not a participant');
    }

    const currentParticipants = threadResult[0].participants as string[];
    const updatedParticipants = [...new Set([...currentParticipants, ...newParticipants])];

    await prisma.$queryRaw`
      UPDATE message_threads
      SET participants = ${updatedParticipants}
      WHERE id = ${threadId}
    `;

    return { success: true, message: 'Participants added successfully' };
  }

  /**
   * Get thread details
   */
  async getThreadDetails(threadId: string, userId: string) {
    const threadResult = await prisma.$queryRaw`
      SELECT mt.*, COUNT(m.id) as message_count
      FROM message_threads mt
      LEFT JOIN messages m ON mt.id = m.thread_id
      WHERE mt.id = ${threadId} AND ${userId} = ANY(mt.participants)
      GROUP BY mt.id
    ` as any[];

    if (threadResult.length === 0) {
      throw new Error('Thread not found or user is not a participant');
    }

    const thread = threadResult[0];
    return {
      id: thread.id,
      participants: thread.participants,
      title: thread.title,
      lastMessageAt: new Date(thread.last_message_at),
      messageCount: parseInt(thread.message_count) || 0
    };
  }

  /**
   * Search messages in a thread
   */
  async searchMessages(threadId: string, userId: string, query: string, limit: number = 20) {
    // Verify user is a participant
    const threadResult = await prisma.$queryRaw`
      SELECT * FROM message_threads
      WHERE id = ${threadId} AND ${userId} = ANY(participants)
    ` as any[];

    if (threadResult.length === 0) {
      throw new Error('Thread not found or user is not a participant');
    }

    const messages = await prisma.$queryRaw`
      SELECT m.*, p.name as sender_name
      FROM messages m
      JOIN mvp_players p ON m.sender_id = p.id
      WHERE m.thread_id = ${threadId}
        AND m.content ILIKE ${`%${query}%`}
      ORDER BY m.sent_at DESC
      LIMIT ${limit}
    ` as any[];

    return messages.map(row => ({
      id: row.id,
      threadId: row.thread_id,
      senderId: row.sender_id,
      content: row.content,
      messageType: row.message_type,
      sentAt: new Date(row.sent_at),
      isRead: row.is_read,
      sender: { id: row.sender_id, name: row.sender_name }
    }));
  }
}

export const messagingService = new MessagingService();