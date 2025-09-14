import {
  Friend,
  FriendRequest,
  FriendWithDetails,
  FriendRequestApiResponse,
  FriendApiResponse,
  ApiResponse,
  SendFriendRequestForm,
  RespondToFriendRequestForm,
  FriendStats,
  BlockedUser
} from '../types/social';

class FriendsApiService {
  private baseUrl = 'http://localhost:3000/api/friends';

  /**
   * Send a friend request
   */
  async sendFriendRequest(data: SendFriendRequestForm): Promise<FriendRequest> {
    const response = await fetch(`${this.baseUrl}/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to send friend request');
    }

    const result: ApiResponse<FriendRequest> = await response.json();
    return result.data;
  }

  /**
   * Respond to a friend request
   */
  async respondToFriendRequest(data: RespondToFriendRequestForm): Promise<FriendRequest> {
    const response = await fetch(`${this.baseUrl}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to respond to friend request');
    }

    const result: ApiResponse<FriendRequest> = await response.json();
    return result.data;
  }

  /**
   * Get friend requests
   */
  async getFriendRequests(type: 'sent' | 'received' = 'received'): Promise<FriendRequest[]> {
    const response = await fetch(`${this.baseUrl}/requests?type=${type}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch friend requests');
    }

    const result: FriendRequestApiResponse = await response.json();
    return result.data;
  }

  /**
   * Get friends list
   */
  async getFriends(): Promise<FriendWithDetails[]> {
    const response = await fetch(this.baseUrl);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch friends');
    }

    const result: FriendApiResponse = await response.json();
    return result.data;
  }

  /**
   * Remove a friend
   */
  async removeFriend(friendId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/${friendId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to remove friend');
    }

    return await response.json();
  }

  /**
   * Block a user
   */
  async blockUser(userId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/block/${userId}`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to block user');
    }

    return await response.json();
  }

  /**
   * Unblock a user
   */
  async unblockUser(userId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/unblock/${userId}`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to unblock user');
    }

    return await response.json();
  }

  /**
   * Get blocked users
   */
  async getBlockedUsers(): Promise<BlockedUser[]> {
    const response = await fetch(`${this.baseUrl}/blocked`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch blocked users');
    }

    const result: ApiResponse<BlockedUser[]> = await response.json();
    return result.data;
  }

  /**
   * Get friend statistics
   */
  async getFriendStats(): Promise<FriendStats> {
    const response = await fetch(`${this.baseUrl}/stats`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch friend statistics');
    }

    const result: ApiResponse<FriendStats> = await response.json();
    return result.data;
  }

  /**
   * Check if two users are friends
   */
  async checkFriendship(userId: string): Promise<{ areFriends: boolean }> {
    const response = await fetch(`${this.baseUrl}/check/${userId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to check friendship status');
    }

    const result: ApiResponse<{ areFriends: boolean }> = await response.json();
    return result.data;
  }

  /**
   * Search for users (placeholder for future implementation)
   */
  async searchUsers(query: string): Promise<any[]> {
    // This would typically call a user search endpoint
    // For now, return empty array
    console.log('User search not implemented yet:', query);
    return [];
  }
}

export const friendsApi = new FriendsApiService();