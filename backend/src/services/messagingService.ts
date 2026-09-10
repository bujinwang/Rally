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
      INSERT INTO message_threads (id, participants, title, "lastMessageAt")
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
      INSERT INTO messages (id, "threadId", "senderId", content, "messageType", "sentAt")
      VALUES (${messageId}, ${data.threadId}, ${data.senderId}, ${data.content},
              CAST(${data.messageType || 'TEXT'} AS "MessageType"), NOW())
    `;

    // Update thread's last message timestamp
    await prisma.$queryRaw`
      UPDATE message_threads
      SET "lastMessageAt" = NOW()
      WHERE id = ${data.threadId}
    `;

    // Get the created message with sender details
    const message = await prisma.$queryRaw`
      SELECT m.*, u.name as sender_name
      FROM messages m
      LEFT JOIN users u ON m."senderId" = u.id
      WHERE m.id = ${messageId}
    ` as any[];

    return message[0] ? {
      id: message[0].id,
      threadId: message[0].threadId,
      senderId: message[0].senderId,
      content: message[0].content,
      messageType: message[0].messageType,
      sentAt: new Date(message[0].sentAt),
      isRead: message[0].isRead ?? false,
      sender: { id: message[0].senderId, name: message[0].sender_name }
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
      SELECT m.*, u.name as sender_name
      FROM messages m
      LEFT JOIN users u ON m."senderId" = u.id
      WHERE m."threadId" = ${threadId}
      ORDER BY m."sentAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    ` as any[];

    return messages.map(row => ({
      id: row.id,
      threadId: row.threadId,
      senderId: row.senderId,
      content: row.content,
      messageType: row.messageType,
      sentAt: new Date(row.sentAt),
      isRead: row.isRead,
      readAt: row.readAt ? new Date(row.readAt) : null,
      sender: { id: row.senderId, name: row.sender_name }
    })).reverse(); // Reverse to get chronological order
  }

  /**
   * Get user threads
   */
  async getUserThreads(userId: string) {
    const threads = await prisma.$queryRaw`
      SELECT mt.*, m.content as last_message_content, m."sentAt" as last_message_time,
             u.name as last_sender_name
      FROM message_threads mt
      LEFT JOIN messages m ON mt.id = m."threadId"
        AND m."sentAt" = (
          SELECT MAX("sentAt") FROM messages WHERE "threadId" = mt.id
        )
      LEFT JOIN users u ON m."senderId" = u.id
      WHERE ${userId} = ANY(mt.participants)
      ORDER BY mt."lastMessageAt" DESC
    ` as any[];

    return threads.map(row => ({
      id: row.id,
      participants: row.participants,
      title: row.title,
      lastMessageAt: new Date(row.lastMessageAt),
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
      SET "isRead" = true, "readAt" = NOW()
      WHERE "threadId" = ${threadId} AND "senderId" != ${userId} AND "isRead" = false
    `;

    return { success: true, message: 'Messages marked as read' };
  }

  /**
   * Get unread messages count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const result = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM messages m
      JOIN message_threads mt ON m."threadId" = mt.id
      WHERE ${userId} = ANY(mt.participants)
        AND m."senderId" != ${userId}
        AND m."isRead" = false
    ` as any[];

    return Array.isArray(result) ? parseInt((result[0] as any).count) || 0 : 0;
  }

  /**
   * Get unread count for a specific thread
   */
  async getThreadUnreadCount(threadId: string, userId: string): Promise<number> {
    const result = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM messages m
      JOIN message_threads mt ON m."threadId" = mt.id
      WHERE m."threadId" = ${threadId}
        AND ${userId} = ANY(mt.participants)
        AND m."senderId" != ${userId}
        AND m."isRead" = false
    ` as any[];

    return Array.isArray(result) ? parseInt((result[0] as any).count) || 0 : 0;
  }

  /**
   * Delete a message (soft delete by marking as deleted for the user)
   */
  async deleteMessage(messageId: string, userId: string) {
    // Verify user owns the message
    const messageResult = await prisma.$queryRaw`
      SELECT * FROM messages WHERE id = ${messageId} AND "senderId" = ${userId}
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
      await prisma.$queryRaw`DELETE FROM messages WHERE "threadId" = ${threadId}`;
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
      LEFT JOIN messages m ON mt.id = m."threadId"
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
      lastMessageAt: new Date(thread.lastMessageAt),
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
      SELECT m.*, u.name as sender_name
      FROM messages m
      LEFT JOIN users u ON m."senderId" = u.id
      WHERE m."threadId" = ${threadId}
        AND m.content ILIKE ${`%${query}%`}
      ORDER BY m."sentAt" DESC
      LIMIT ${limit}
    ` as any[];

    return messages.map(row => ({
      id: row.id,
      threadId: row.threadId,
      senderId: row.senderId,
      content: row.content,
      messageType: row.messageType,
      sentAt: new Date(row.sentAt),
      isRead: row.isRead,
      sender: { id: row.senderId, name: row.sender_name }
    }));
  }

  /**
   * Get or create a chat thread for a session.
   * Thread participants = all current session players.
   */
  async getOrCreateSessionChat(sessionId: string, playerName: string, playerDeviceId: string) {
    const session = await prisma.mvpSession.findUnique({
      where: { id: sessionId },
      include: { players: { select: { name: true, deviceId: true } } },
    });
    if (!session) throw new Error('Session not found');

    const participants = session.players.map(p => p.deviceId).filter(Boolean) as string[];
    if (!participants.includes(playerDeviceId)) participants.push(playerDeviceId);

    const title = `💬 ${session.name}`;
    return this.createThread({ participants, title });
  }

}

export const messagingService = new MessagingService();
