import {
  MessageThread,
  Message,
  MessageData,
  ThreadData,
  ThreadApiResponse,
  MessageApiResponse,
  ApiResponse,
  CreateThreadForm,
  SendMessageForm,
  MessageType
} from '../types/social';

class MessagingApiService {
  private baseUrl = 'http://localhost:3000/api/messaging';

  /**
   * Create a new message thread
   */
  async createThread(data: CreateThreadForm): Promise<MessageThread> {
    const response = await fetch(`${this.baseUrl}/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create thread');
    }

    const result: ApiResponse<MessageThread> = await response.json();
    return result.data;
  }

  /**
   * Send a message
   */
  async sendMessage(data: SendMessageForm): Promise<Message> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to send message');
    }

    const result: ApiResponse<Message> = await response.json();
    return result.data;
  }

  /**
   * Get user's message threads
   */
  async getUserThreads(): Promise<MessageThread[]> {
    const response = await fetch(`${this.baseUrl}/threads`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch threads');
    }

    const result: ThreadApiResponse = await response.json();
    return result.data;
  }

  /**
   * Get messages for a thread
   */
  async getThreadMessages(threadId: string, limit: number = 50, offset: number = 0): Promise<Message[]> {
    const response = await fetch(`${this.baseUrl}/threads/${threadId}/messages?limit=${limit}&offset=${offset}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch messages');
    }

    const result: MessageApiResponse = await response.json();
    return result.data;
  }

  /**
   * Mark messages as read in a thread
   */
  async markMessagesAsRead(threadId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/threads/${threadId}/read`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to mark messages as read');
    }

    return await response.json();
  }

  /**
   * Get unread messages count
   */
  async getUnreadCount(): Promise<number> {
    const response = await fetch(`${this.baseUrl}/unread`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch unread count');
    }

    const result: ApiResponse<{ count: number }> = await response.json();
    return result.data.count;
  }

  /**
   * Get unread count for a specific thread
   */
  async getThreadUnreadCount(threadId: string): Promise<number> {
    const response = await fetch(`${this.baseUrl}/threads/${threadId}/unread`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch thread unread count');
    }

    const result: ApiResponse<{ count: number }> = await response.json();
    return result.data.count;
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/messages/${messageId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete message');
    }

    return await response.json();
  }

  /**
   * Leave a message thread
   */
  async leaveThread(threadId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/threads/${threadId}/leave`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to leave thread');
    }

    return await response.json();
  }

  /**
   * Add participants to a thread
   */
  async addParticipants(threadId: string, participants: string[]): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/threads/${threadId}/participants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ participants }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to add participants');
    }

    return await response.json();
  }

  /**
   * Get thread details
   */
  async getThreadDetails(threadId: string): Promise<MessageThread> {
    const response = await fetch(`${this.baseUrl}/threads/${threadId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch thread details');
    }

    const result: ApiResponse<MessageThread> = await response.json();
    return result.data;
  }

  /**
   * Search messages in a thread
   */
  async searchMessages(threadId: string, query: string, limit: number = 20): Promise<Message[]> {
    const response = await fetch(`${this.baseUrl}/threads/${threadId}/search?q=${encodeURIComponent(query)}&limit=${limit}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to search messages');
    }

    const result: MessageApiResponse = await response.json();
    return result.data;
  }

  /**
   * Send a text message (convenience method)
   */
  async sendTextMessage(threadId: string, content: string): Promise<Message> {
    return this.sendMessage({
      threadId,
      content,
      messageType: MessageType.TEXT
    });
  }

  /**
   * Create a thread with another user (convenience method)
   */
  async createDirectThread(otherUserId: string, title?: string): Promise<MessageThread> {
    return this.createThread({
      participants: ['player-123', otherUserId], // Mock current user ID
      title
    });
  }

  /**
   * Get or create a direct thread with another user
   */
  async getOrCreateDirectThread(otherUserId: string): Promise<MessageThread> {
    // First, try to find existing direct thread
    const threads = await this.getUserThreads();
    const existingThread = threads.find(thread =>
      thread.participants.length === 2 &&
      thread.participants.includes('player-123') &&
      thread.participants.includes(otherUserId)
    );

    if (existingThread) {
      return existingThread;
    }

    // Create new thread if none exists
    return this.createDirectThread(otherUserId);
  }

  /**
   * Send a message to another user (creates thread if needed)
   */
  async sendMessageToUser(recipientId: string, content: string): Promise<Message> {
    const thread = await this.getOrCreateDirectThread(recipientId);
    return this.sendTextMessage(thread.id, content);
  }
}

export const messagingApi = new MessagingApiService();