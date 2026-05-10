import { API_BASE_URL } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MessageThread {
  id: string;
  participants: string[];
  title?: string;
  lastMessageAt: string;
  isActive: boolean;
  lastMessage?: {
    content: string;
    sentAt: string;
    senderName: string;
  };
}

export interface Message {
  id: string;
  threadId: string;
  senderId: string;
  content: string;
  messageType: 'TEXT' | 'IMAGE' | 'SYSTEM' | 'CHALLENGE';
  sentAt: string;
  isRead: boolean;
  readAt?: string;
  sender: {
    id: string;
    name: string;
  };
}

export interface ThreadDetails {
  id: string;
  participants: string[];
  title?: string;
  lastMessageAt: string;
  messageCount: number;
}

class MessagingApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    const token = await AsyncStorage.getItem('accessToken');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    };
  }

  /**
   * Create a new message thread
   */
  async createThread(participants: string[], title?: string): Promise<MessageThread> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/messaging/threads`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ participants, title })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to create thread');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get user's message threads
   */
  async getUserThreads(): Promise<MessageThread[]> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/messaging/threads`, {
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch threads');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get thread details
   */
  async getThreadDetails(threadId: string): Promise<ThreadDetails> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/messaging/threads/${threadId}`, {
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch thread details');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get messages for a thread
   */
  async getThreadMessages(
    threadId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Message[]> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(
      `${this.baseUrl}/messaging/threads/${threadId}/messages?limit=${limit}&offset=${offset}`,
      { headers }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch messages');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Send a message (REST API - for fallback)
   */
  async sendMessage(
    threadId: string,
    content: string,
    messageType: 'TEXT' | 'IMAGE' | 'SYSTEM' | 'CHALLENGE' = 'TEXT'
  ): Promise<Message> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/messaging/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ threadId, content, messageType })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to send message');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Mark messages as read
   */
  async markAsRead(threadId: string): Promise<{ success: boolean; message: string }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/messaging/threads/${threadId}/read`, {
      method: 'POST',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to mark as read');
    }

    return await response.json();
  }

  /**
   * Get total unread message count
   */
  async getUnreadCount(): Promise<number> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/messaging/unread`, {
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch unread count');
    }

    const result = await response.json();
    return result.data.count;
  }

  /**
   * Get unread count for a specific thread
   */
  async getThreadUnreadCount(threadId: string): Promise<number> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/messaging/threads/${threadId}/unread`, {
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch thread unread count');
    }

    const result = await response.json();
    return result.data.count;
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string): Promise<{ success: boolean; message: string }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/messaging/messages/${messageId}`, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to delete message');
    }

    return await response.json();
  }

  /**
   * Leave a thread
   */
  async leaveThread(threadId: string): Promise<{ success: boolean; message: string }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/messaging/threads/${threadId}/leave`, {
      method: 'POST',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to leave thread');
    }

    return await response.json();
  }

  /**
   * Add participants to a thread
   */
  async addParticipants(
    threadId: string,
    participants: string[]
  ): Promise<{ success: boolean; message: string }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/messaging/threads/${threadId}/participants`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ participants })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to add participants');
    }

    return await response.json();
  }

  /**
   * Search messages in a thread
   */
  async searchMessages(threadId: string, query: string, limit: number = 20): Promise<Message[]> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(
      `${this.baseUrl}/messaging/threads/${threadId}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      { headers }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to search messages');
    }

    const result = await response.json();
    return result.data;
  }
}

export const messagingApi = new MessagingApiService();
