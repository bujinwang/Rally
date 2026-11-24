import { authFetch } from './authFetch';

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

/** Error carrying the HTTP status so callers can react to 401 vs 4xx/5xx. */
export class MessagingApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'MessagingApiError';
    this.status = status;
  }
}

/**
 * Best-effort extraction of the server's error message. A 401 from a proxy or a
 * 204 response has no JSON body, so never let error parsing mask the real
 * status code.
 */
async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return body?.error?.message || fallback;
  } catch {
    return fallback;
  }
}

class MessagingApiService {
  /**
   * All messaging routes are private (`router.use(authenticateToken)` on the
   * backend), so every call goes through `authFetch`. It attaches the stored
   * access token and, on a 401, refreshes once and retries — a raw `fetch` here
   * meant an expired token surfaced as "Invalid or expired access token" and
   * never recovered.
   *
   * Paths are relative: `authFetch` prefixes `API_BASE_URL` itself.
   */
  private async request<T>(path: string, init: RequestInit = {}, fallback: string): Promise<T> {
    // `authFetch` only adds `Authorization`; `Content-Type` stays the caller's
    // job (Express `express.json()` ignores a body without it).
    const response = await authFetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...((init.headers as Record<string, string> | undefined) || {}),
      },
    });

    if (!response.ok) {
      throw new MessagingApiError(await readErrorMessage(response, fallback), response.status);
    }

    return (await response.json()) as T;
  }

  /**
   * Create a new message thread
   */
  async createThread(participants: string[], title?: string): Promise<MessageThread> {
    const result = await this.request<{ data: MessageThread }>(
      '/messaging/threads',
      {
        method: 'POST',
        body: JSON.stringify({ participants, title }),
      },
      'Failed to create thread'
    );

    return result.data;
  }

  /**
   * Get user's message threads
   */
  async getUserThreads(): Promise<MessageThread[]> {
    const result = await this.request<{ data: MessageThread[] }>(
      '/messaging/threads',
      {},
      'Failed to fetch threads'
    );

    return result.data;
  }

  /**
   * Get thread details
   */
  async getThreadDetails(threadId: string): Promise<ThreadDetails> {
    const result = await this.request<{ data: ThreadDetails }>(
      `/messaging/threads/${threadId}`,
      {},
      'Failed to fetch thread details'
    );

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
    const result = await this.request<{ data: Message[] }>(
      `/messaging/threads/${threadId}/messages?limit=${limit}&offset=${offset}`,
      {},
      'Failed to fetch messages'
    );

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
    const result = await this.request<{ data: Message }>(
      '/messaging/messages',
      {
        method: 'POST',
        body: JSON.stringify({ threadId, content, messageType }),
      },
      'Failed to send message'
    );

    return result.data;
  }

  /**
   * Mark messages as read
   */
  async markAsRead(threadId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      `/messaging/threads/${threadId}/read`,
      { method: 'POST' },
      'Failed to mark as read'
    );
  }

  /**
   * Get total unread message count
   */
  async getUnreadCount(): Promise<number> {
    const result = await this.request<{ data: { count: number } }>(
      '/messaging/unread',
      {},
      'Failed to fetch unread count'
    );

    return result.data.count;
  }

  /**
   * Get unread count for a specific thread
   */
  async getThreadUnreadCount(threadId: string): Promise<number> {
    const result = await this.request<{ data: { count: number } }>(
      `/messaging/threads/${threadId}/unread`,
      {},
      'Failed to fetch thread unread count'
    );

    return result.data.count;
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      `/messaging/messages/${messageId}`,
      { method: 'DELETE' },
      'Failed to delete message'
    );
  }

  /**
   * Leave a thread
   */
  async leaveThread(threadId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      `/messaging/threads/${threadId}/leave`,
      { method: 'POST' },
      'Failed to leave thread'
    );
  }

  /**
   * Add participants to a thread
   */
  async addParticipants(
    threadId: string,
    participants: string[]
  ): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      `/messaging/threads/${threadId}/participants`,
      {
        method: 'POST',
        body: JSON.stringify({ participants }),
      },
      'Failed to add participants'
    );
  }

  /**
   * Search messages in a thread
   */
  async searchMessages(threadId: string, query: string, limit: number = 20): Promise<Message[]> {
    const result = await this.request<{ data: Message[] }>(
      `/messaging/threads/${threadId}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      {},
      'Failed to search messages'
    );

    return result.data;
  }
}

export const messagingApi = new MessagingApiService();
