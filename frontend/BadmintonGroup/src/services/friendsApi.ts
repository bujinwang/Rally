import { API_BASE_URL } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  message: string | null;
  status: string;
  sentAt: string;
  respondedAt: string | null;
  sender: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  receiver: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export interface Friend {
  id: string;
  playerId: string;
  friendId: string;
  status: string;
  requestedAt: string;
  acceptedAt: string | null;
  friend: {
    id: string;
    name: string;
    avatarUrl: string | null;
    status: string;
  };
}

export interface FriendStats {
  totalFriends: number;
  pendingRequests: number;
  sentRequests: number;
  blockedUsers: number;
}

export interface BlockedUser {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  blockedAt: string;
}

class FriendsApiService {
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
   * Send a friend request
   */
  async sendFriendRequest(receiverId: string, message?: string): Promise<FriendRequest> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/friends/requests`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ receiverId, message }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to send friend request');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Respond to a friend request
   */
  async respondToFriendRequest(requestId: string, accept: boolean): Promise<any> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/friends/requests/${requestId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ accept }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to respond to friend request');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get friend requests
   */
  async getFriendRequests(type: 'sent' | 'received' = 'received'): Promise<FriendRequest[]> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/friends/requests?type=${type}`, {
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch friend requests');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get friends list
   */
  async getFriends(): Promise<Friend[]> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/friends`, {
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch friends');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Remove a friend
   */
  async removeFriend(friendId: string): Promise<{ success: boolean; message: string }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/friends/${friendId}`, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to remove friend');
    }

    return await response.json();
  }

  /**
   * Block a user
   */
  async blockUser(userId: string): Promise<{ success: boolean; message: string }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/friends/block/${userId}`, {
      method: 'POST',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to block user');
    }

    return await response.json();
  }

  /**
   * Unblock a user
   */
  async unblockUser(userId: string): Promise<{ success: boolean; message: string }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/friends/block/${userId}`, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to unblock user');
    }

    return await response.json();
  }

  /**
   * Get blocked users
   */
  async getBlockedUsers(): Promise<BlockedUser[]> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/friends/blocked`, {
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch blocked users');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get friend statistics
   */
  async getFriendStats(): Promise<FriendStats> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/friends/stats`, {
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch friend statistics');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Check if two users are friends
   */
  async checkFriendship(userId: string): Promise<{ areFriends: boolean }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/friends/check/${userId}`, {
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to check friendship status');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get friend suggestions
   */
  async getFriendSuggestions(limit: number = 10): Promise<any[]> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/friends/suggestions?limit=${limit}`, {
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch friend suggestions');
    }

    const result = await response.json();
    return result.data;
  }
}

export const friendsApi = new FriendsApiService();