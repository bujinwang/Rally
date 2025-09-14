import { NotificationType, NotificationCategory, NotificationRecord, NotificationPreferences, NotificationPreferenceKey } from '../types/notifications';

export interface RegisterPushTokenRequest {
  token: string;
  platform: 'ios' | 'android';
  deviceId?: string;
}

export interface UpdateNotificationPreferencesRequest {
  matchResults?: boolean;
  achievements?: boolean;
  friendRequests?: boolean;
  challenges?: boolean;
  tournamentUpdates?: boolean;
  socialMessages?: boolean;
  sessionReminders?: boolean;
  pushEnabled?: boolean;
  emailEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  [key: string]: boolean | string | undefined;
}

export interface GetNotificationsRequest {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
  category?: NotificationCategory;
}

export interface NotificationResponse {
  notifications: NotificationRecord[];
}

export interface NotificationPreferencesResponse {
  preferences: NotificationPreferences;
}

export interface UnreadCountResponse {
  unreadCount: number;
}

export interface ApiResponse {
  success: boolean;
  message: string;
}

class NotificationApiService {
  private baseUrl = 'http://localhost:3000/api/notifications';

  /**
   * Register a push notification token
   */
  async registerPushToken(data: RegisterPushTokenRequest): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to register push token');
    }

    return await response.json();
  }

  /**
   * Unregister a push notification token
   */
  async unregisterPushToken(token: string): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/token`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to unregister push token');
    }

    return await response.json();
  }

  /**
   * Get notification preferences
   */
  async getNotificationPreferences(): Promise<NotificationPreferencesResponse> {
    const response = await fetch(`${this.baseUrl}/preferences`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get notification preferences');
    }

    const result: NotificationPreferencesResponse = await response.json();
    return result;
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(preferences: UpdateNotificationPreferencesRequest): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferences),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update notification preferences');
    }

    return await response.json();
  }

  /**
   * Get notifications with optional filters
   */
  async getNotifications(params?: GetNotificationsRequest): Promise<NotificationResponse> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.unreadOnly) queryParams.append('unreadOnly', params.unreadOnly.toString());
    if (params?.category) queryParams.append('category', params.category);

    const url = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get notifications');
    }

    const result: NotificationResponse = await response.json();
    return result;
  }

  /**
   * Mark a specific notification as read
   */
  async markNotificationAsRead(notificationId: string): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/${notificationId}/read`, {
      method: 'PUT',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to mark notification as read');
    }

    return await response.json();
  }

  /**
   * Mark all notifications as read
   */
  async markAllNotificationsAsRead(): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/read-all`, {
      method: 'PUT',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to mark all notifications as read');
    }

    return await response.json();
  }

  /**
   * Get unread notification count
   */
  async getUnreadNotificationCount(): Promise<UnreadCountResponse> {
    const response = await fetch(`${this.baseUrl}/unread-count`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get unread notification count');
    }

    const result: UnreadCountResponse = await response.json();
    return result;
  }

  /**
   * Get only unread notifications
   */
  async getUnreadNotifications(limit?: number): Promise<NotificationResponse> {
    return this.getNotifications({ unreadOnly: true, limit });
  }

  /**
   * Get notifications by category
   */
  async getNotificationsByCategory(category: NotificationCategory, limit?: number): Promise<NotificationResponse> {
    return this.getNotifications({ category, limit });
  }

  /**
   * Get recent notifications (last N notifications)
   */
  async getRecentNotifications(limit: number = 20): Promise<NotificationResponse> {
    return this.getNotifications({ limit });
  }

  /**
   * Enable/disable all push notifications
   */
  async setPushNotificationsEnabled(enabled: boolean): Promise<ApiResponse> {
    return this.updateNotificationPreferences({ pushEnabled: enabled });
  }

  /**
   * Set quiet hours for notifications
   */
  async setQuietHours(startTime?: string, endTime?: string): Promise<ApiResponse> {
    return this.updateNotificationPreferences({
      quietHoursStart: startTime,
      quietHoursEnd: endTime,
    });
  }

  /**
   * Update specific notification type preferences
   */
  async updateNotificationTypePreference(
    type: NotificationPreferenceKey,
    enabled: boolean
  ): Promise<ApiResponse> {
    const preferences: UpdateNotificationPreferencesRequest = {};
    preferences[type] = enabled;
    return this.updateNotificationPreferences(preferences);
  }

  /**
   * Bulk update multiple notification preferences
   */
  async updateMultiplePreferences(updates: UpdateNotificationPreferencesRequest): Promise<ApiResponse> {
    return this.updateNotificationPreferences(updates);
  }

  /**
   * Reset notification preferences to defaults
   */
  async resetToDefaults(): Promise<ApiResponse> {
    const defaultPreferences: UpdateNotificationPreferencesRequest = {
      matchResults: true,
      achievements: true,
      friendRequests: true,
      challenges: true,
      tournamentUpdates: true,
      socialMessages: false,
      sessionReminders: true,
      pushEnabled: true,
      emailEnabled: false,
    };
    return this.updateNotificationPreferences(defaultPreferences);
  }
}

// Export singleton instance
export const notificationApi = new NotificationApiService();

// Export convenience functions for common operations
export const notificationHelpers = {
  /**
   * Register device for push notifications
   */
  async registerDevice(token: string, platform: 'ios' | 'android', deviceId?: string): Promise<void> {
    try {
      await notificationApi.registerPushToken({ token, platform, deviceId });
      console.log('Device registered for push notifications');
    } catch (error) {
      console.error('Failed to register device for push notifications:', error);
      throw error;
    }
  },

  /**
   * Unregister device from push notifications
   */
  async unregisterDevice(token: string): Promise<void> {
    try {
      await notificationApi.unregisterPushToken(token);
      console.log('Device unregistered from push notifications');
    } catch (error) {
      console.error('Failed to unregister device from push notifications:', error);
      throw error;
    }
  },

  /**
   * Get current notification settings
   */
  async getCurrentSettings(): Promise<NotificationPreferences> {
    try {
      const response = await notificationApi.getNotificationPreferences();
      return response.preferences;
    } catch (error) {
      console.error('Failed to get notification settings:', error);
      throw error;
    }
  },

  /**
   * Enable/disable specific notification types
   */
  async toggleNotificationType(
    type: NotificationPreferenceKey,
    enabled: boolean
  ): Promise<void> {
    try {
      await notificationApi.updateNotificationTypePreference(type, enabled);
      console.log(`${type} notifications ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error(`Failed to ${enabled ? 'enable' : 'disable'} ${type} notifications:`, error);
      throw error;
    }
  },

  /**
   * Mark notification as read by ID
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      await notificationApi.markNotificationAsRead(notificationId);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      throw error;
    }
  },

  /**
   * Get unread notification count
   */
  async getUnreadCount(): Promise<number> {
    try {
      const response = await notificationApi.getUnreadNotificationCount();
      return response.unreadCount;
    } catch (error) {
      console.error('Failed to get unread notification count:', error);
      return 0;
    }
  },

  /**
   * Clear all notifications (mark as read)
   */
  async clearAllNotifications(): Promise<void> {
    try {
      await notificationApi.markAllNotificationsAsRead();
      console.log('All notifications marked as read');
    } catch (error) {
      console.error('Failed to clear all notifications:', error);
      throw error;
    }
  },
};