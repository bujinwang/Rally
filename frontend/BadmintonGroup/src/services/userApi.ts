import { API_BASE_URL } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  role: string;
  stats: {
    totalSessions: number;
    sessionsHosted: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  isOwnProfile: boolean;
}

export interface UpdateProfileData {
  name?: string;
  phone?: string;
  bio?: string;
  location?: string;
  skillLevel?: string;
  preferredPlayStyle?: string;
}

export interface UserSettings {
  privacySettings: {
    profileVisibility: 'public' | 'friends' | 'private';
    showEmail: boolean;
    showPhone: boolean;
    showStats: boolean;
    showLocation: boolean;
  };
  notificationSettings: {
    friendRequests: boolean;
    messages: boolean;
    sessionInvites: boolean;
    matchResults: boolean;
    achievements: boolean;
  };
}

export interface SearchUser {
  id: string;
  name: string;
  avatarUrl?: string;
  role: string;
}

class UserApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  /**
   * Get authentication headers with JWT token
   */
  private async getAuthHeaders(): Promise<HeadersInit> {
    const token = await AsyncStorage.getItem('accessToken');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    };
  }

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId: string): Promise<UserProfile> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/users/${userId}/profile`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch user profile');
    }

    const result = await response.json();
    return result.data.profile;
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: UpdateProfileData): Promise<UserProfile> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/users/${userId}/profile`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to update profile');
    }

    const result = await response.json();
    return result.data.user;
  }

  /**
   * Upload user avatar
   */
  async uploadAvatar(userId: string, imageUri: string): Promise<string> {
    const token = await AsyncStorage.getItem('accessToken');
    
    // Create form data
    const formData = new FormData();
    const filename = imageUri.split('/').pop() || 'avatar.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('avatar', {
      uri: imageUri,
      name: filename,
      type
    } as any);

    const response = await fetch(`${this.baseUrl}/users/${userId}/avatar`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to upload avatar');
    }

    const result = await response.json();
    return result.data.avatarUrl;
  }

  /**
   * Delete user avatar
   */
  async deleteAvatar(userId: string): Promise<void> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/users/${userId}/avatar`, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to delete avatar');
    }
  }

  /**
   * Get user settings
   */
  async getUserSettings(userId: string): Promise<UserSettings> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/users/${userId}/settings`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch settings');
    }

    const result = await response.json();
    return result.data.settings;
  }

  /**
   * Update user settings
   */
  async updateSettings(userId: string, settings: Partial<UserSettings>): Promise<UserSettings> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/users/${userId}/settings`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(settings)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to update settings');
    }

    const result = await response.json();
    return result.data.settings;
  }

  /**
   * Search users by name or email
   */
  async searchUsers(query: string, limit: number = 20): Promise<SearchUser[]> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(
      `${this.baseUrl}/users/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      {
        method: 'GET',
        headers
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to search users');
    }

    const result = await response.json();
    return result.data.users;
  }

  /**
   * Get current user ID from storage
   */
  async getCurrentUserId(): Promise<string | null> {
    return await AsyncStorage.getItem('userId');
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await AsyncStorage.getItem('accessToken');
    return !!token;
  }
}

export const userApi = new UserApiService();
export default userApi;
