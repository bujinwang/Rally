import { prisma } from '../config/database';
import { NotificationType, NotificationCategory, NotificationData, PushTokenData, NotificationPreferences, NotificationRecord } from '../types/notifications';

export class NotificationService {
  /**
   * Send a notification to a player
   */
  static async sendNotification(playerId: string, notificationData: NotificationData): Promise<void> {
    try {
      // Check user preferences first
      const preferences = await this.getNotificationPreferences(playerId);

      // Check if this type of notification is enabled
      if (!this.isNotificationEnabled(notificationData.type, preferences)) {
        return; // User has disabled this type of notification
      }

      // Check quiet hours
      if (this.isInQuietHours(preferences)) {
        return; // Skip notification during quiet hours
      }

      // Store notification in database
      const notificationId = crypto.randomUUID();
      await prisma.$queryRaw`
        INSERT INTO notifications (id, player_id, title, body, data, type, category, is_read, sent_at)
        VALUES (${notificationId}, ${playerId}, ${notificationData.title}, ${notificationData.body},
                ${JSON.stringify(notificationData.data || {})}, ${notificationData.type}, ${notificationData.category}, false, NOW())
      `;

      // Send push notification if enabled
      if (preferences.pushEnabled) {
        await this.sendPushNotification(playerId, notificationData);
      }

      // Mark as delivered
      await prisma.$queryRaw`
        UPDATE notifications
        SET delivered_at = NOW()
        WHERE id = ${notificationId}
      `;

    } catch (error) {
      console.error('Error sending notification:', error);
      throw new Error('Failed to send notification');
    }
  }

  /**
   * Send push notification to all active devices of a player
   */
  private static async sendPushNotification(playerId: string, notificationData: NotificationData): Promise<void> {
    try {
      // Get all active push tokens for the player
      const pushTokens = await prisma.$queryRaw`
        SELECT * FROM push_tokens
        WHERE player_id = ${playerId} AND is_active = true
      ` as any[];

      if (pushTokens.length === 0) {
        return; // No active push tokens
      }

      // Send to each device (in a real implementation, you'd use FCM/APNs)
      for (const token of pushTokens) {
        await this.sendToDevice(token, notificationData);
      }

      // Update last used timestamp
      await prisma.$queryRaw`
        UPDATE push_tokens
        SET last_used = NOW()
        WHERE player_id = ${playerId} AND is_active = true
      `;

    } catch (error) {
      console.error('Error sending push notification:', error);
      // Don't throw error here - notification is still stored in DB
    }
  }

  /**
   * Send notification to a specific device (mock implementation)
   */
  private static async sendToDevice(token: any, notificationData: NotificationData): Promise<void> {
    // In a real implementation, this would integrate with FCM/APNs
    // For now, we'll just log the notification
    console.log(`Sending push notification to ${token.platform} device:`, {
      token: token.token,
      title: notificationData.title,
      body: notificationData.body,
      data: notificationData.data,
    });

    // Simulate successful delivery
    return Promise.resolve();
  }

  /**
   * Register a push token for a player
   */
  static async registerPushToken(playerId: string, tokenData: PushTokenData): Promise<void> {
    try {
      // Deactivate old tokens for this device if they exist
      if (tokenData.deviceId) {
        await prisma.$queryRaw`
          UPDATE push_tokens
          SET is_active = false
          WHERE player_id = ${playerId} AND device_id = ${tokenData.deviceId} AND token != ${tokenData.token}
        `;
      }

      // Create or update the push token
      const existingToken = await prisma.$queryRaw`
        SELECT * FROM push_tokens WHERE token = ${tokenData.token}
      ` as any[];

      if (existingToken.length > 0) {
        // Update existing token
        await prisma.$queryRaw`
          UPDATE push_tokens
          SET is_active = true, last_used = NOW(), platform = ${tokenData.platform}, device_id = ${tokenData.deviceId}
          WHERE token = ${tokenData.token}
        `;
      } else {
        // Create new token
        const tokenId = crypto.randomUUID();
        await prisma.$queryRaw`
          INSERT INTO push_tokens (id, player_id, token, platform, device_id, is_active, created_at, updated_at)
          VALUES (${tokenId}, ${playerId}, ${tokenData.token}, ${tokenData.platform}, ${tokenData.deviceId}, true, NOW(), NOW())
        `;
      }

    } catch (error) {
      console.error('Error registering push token:', error);
      throw new Error('Failed to register push token');
    }
  }

  /**
   * Unregister a push token
   */
  static async unregisterPushToken(token: string): Promise<void> {
    try {
      await prisma.$queryRaw`
        UPDATE push_tokens
        SET is_active = false
        WHERE token = ${token}
      `;
    } catch (error) {
      console.error('Error unregistering push token:', error);
      throw new Error('Failed to unregister push token');
    }
  }

  /**
   * Get notification preferences for a player
   */
  static async getNotificationPreferences(playerId: string): Promise<NotificationPreferences> {
    try {
      const preferencesResult = await prisma.$queryRaw`
        SELECT * FROM notification_preferences WHERE player_id = ${playerId}
      ` as any[];

      if (preferencesResult.length > 0) {
        const prefs = preferencesResult[0];
        return {
          matchResults: prefs.match_results,
          achievements: prefs.achievements,
          friendRequests: prefs.friend_requests,
          challenges: prefs.challenges,
          tournamentUpdates: prefs.tournament_updates,
          socialMessages: prefs.social_messages,
          sessionReminders: prefs.session_reminders,
          pushEnabled: prefs.push_enabled,
          emailEnabled: prefs.email_enabled,
          quietHoursStart: prefs.quiet_hours_start,
          quietHoursEnd: prefs.quiet_hours_end,
        };
      }

      // Create default preferences if none exist
      const defaultPrefs: NotificationPreferences = {
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

      await this.updateNotificationPreferences(playerId, defaultPrefs);
      return defaultPrefs;

    } catch (error) {
      console.error('Error getting notification preferences:', error);
      // Return default preferences on error
      return {
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
    }
  }

  /**
   * Update notification preferences for a player
   */
  static async updateNotificationPreferences(playerId: string, preferences: NotificationPreferences): Promise<void> {
    try {
      const existingPrefs = await prisma.$queryRaw`
        SELECT * FROM notification_preferences WHERE player_id = ${playerId}
      ` as any[];

      if (existingPrefs.length > 0) {
        // Update existing preferences
        await prisma.$queryRaw`
          UPDATE notification_preferences SET
            match_results = ${preferences.matchResults},
            achievements = ${preferences.achievements},
            friend_requests = ${preferences.friendRequests},
            challenges = ${preferences.challenges},
            tournament_updates = ${preferences.tournamentUpdates},
            social_messages = ${preferences.socialMessages},
            session_reminders = ${preferences.sessionReminders},
            push_enabled = ${preferences.pushEnabled},
            email_enabled = ${preferences.emailEnabled},
            quiet_hours_start = ${preferences.quietHoursStart || null},
            quiet_hours_end = ${preferences.quietHoursEnd || null},
            updated_at = NOW()
          WHERE player_id = ${playerId}
        `;
      } else {
        // Create new preferences
        const prefId = crypto.randomUUID();
        await prisma.$queryRaw`
          INSERT INTO notification_preferences (
            id, player_id, match_results, achievements, friend_requests, challenges,
            tournament_updates, social_messages, session_reminders, push_enabled,
            email_enabled, quiet_hours_start, quiet_hours_end, created_at, updated_at
          ) VALUES (
            ${prefId}, ${playerId}, ${preferences.matchResults}, ${preferences.achievements},
            ${preferences.friendRequests}, ${preferences.challenges}, ${preferences.tournamentUpdates},
            ${preferences.socialMessages}, ${preferences.sessionReminders}, ${preferences.pushEnabled},
            ${preferences.emailEnabled}, ${preferences.quietHoursStart || null}, ${preferences.quietHoursEnd || null},
            NOW(), NOW()
          )
        `;
      }
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      throw new Error('Failed to update notification preferences');
    }
  }

  /**
   * Get notifications for a player
   */
  static async getNotifications(playerId: string, options: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    category?: NotificationCategory;
  } = {}): Promise<NotificationRecord[]> {
    try {
      const { limit = 50, offset = 0, unreadOnly = false, category } = options;

      let whereClause = `player_id = '${playerId}'`;
      if (unreadOnly) {
        whereClause += ' AND is_read = false';
      }
      if (category) {
        whereClause += ` AND category = '${category}'`;
      }

      const notifications = await prisma.$queryRaw`
        SELECT * FROM notifications
        WHERE ${whereClause}
        ORDER BY sent_at DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as any[];

      return notifications.map(row => ({
        id: row.id,
        playerId: row.player_id,
        title: row.title,
        body: row.body,
        data: row.data ? JSON.parse(row.data) : undefined,
        type: row.type as NotificationType,
        category: row.category as NotificationCategory,
        isRead: row.is_read,
        readAt: row.read_at ? new Date(row.read_at) : undefined,
        deliveredAt: row.delivered_at ? new Date(row.delivered_at) : undefined,
        sentAt: new Date(row.sent_at),
      }));

    } catch (error) {
      console.error('Error getting notifications:', error);
      throw new Error('Failed to get notifications');
    }
  }

  /**
   * Mark notification as read
   */
  static async markNotificationAsRead(notificationId: string, playerId: string): Promise<void> {
    try {
      await prisma.$queryRaw`
        UPDATE notifications
        SET is_read = true, read_at = NOW()
        WHERE id = ${notificationId} AND player_id = ${playerId}
      `;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw new Error('Failed to mark notification as read');
    }
  }

  /**
   * Mark all notifications as read for a player
   */
  static async markAllNotificationsAsRead(playerId: string): Promise<void> {
    try {
      await prisma.$queryRaw`
        UPDATE notifications
        SET is_read = true, read_at = NOW()
        WHERE player_id = ${playerId}
      `;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw new Error('Failed to mark all notifications as read');
    }
  }

  /**
   * Get unread notification count for a player
   */
  static async getUnreadNotificationCount(playerId: string): Promise<number> {
    try {
      const countResult = await prisma.$queryRaw`
        SELECT COUNT(*) as count FROM notifications
        WHERE player_id = ${playerId} AND is_read = false
      ` as any[];

      return parseInt(countResult[0].count) || 0;
    } catch (error) {
      console.error('Error getting unread notification count:', error);
      return 0;
    }
  }

  /**
   * Delete old notifications (cleanup function)
   */
  static async cleanupOldNotifications(daysOld: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      await prisma.$queryRaw`
        DELETE FROM notifications
        WHERE sent_at < ${cutoffDate} AND is_read = true
      `;
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
      throw new Error('Failed to cleanup old notifications');
    }
  }

  /**
   * Check if notification type is enabled based on preferences
   */
  private static isNotificationEnabled(type: NotificationType, preferences: NotificationPreferences): boolean {
    switch (type) {
      case NotificationType.MATCH_RESULT:
        return preferences.matchResults;
      case NotificationType.ACHIEVEMENT_UNLOCK:
        return preferences.achievements;
      case NotificationType.FRIEND_REQUEST:
      case NotificationType.FRIEND_ACCEPTED:
        return preferences.friendRequests;
      case NotificationType.CHALLENGE_RECEIVED:
      case NotificationType.CHALLENGE_RESPONSE:
        return preferences.challenges;
      case NotificationType.TOURNAMENT_UPDATE:
        return preferences.tournamentUpdates;
      case NotificationType.SESSION_REMINDER:
        return preferences.sessionReminders;
      case NotificationType.SOCIAL_MESSAGE:
        return preferences.socialMessages;
      case NotificationType.SYSTEM_ANNOUNCEMENT:
        return true; // Always send system announcements
      default:
        return true;
    }
  }

  /**
   * Check if current time is within quiet hours
   */
  private static isInQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quietHoursStart || !preferences.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentTime = now.getHours() * 100 + now.getMinutes();

    const startTime = this.parseTimeString(preferences.quietHoursStart);
    const endTime = this.parseTimeString(preferences.quietHoursEnd);

    if (startTime < endTime) {
      // Same day quiet hours (e.g., 22:00 to 08:00)
      return currentTime >= startTime && currentTime <= endTime;
    } else {
      // Overnight quiet hours (e.g., 22:00 to 08:00 next day)
      return currentTime >= startTime || currentTime <= endTime;
    }
  }

  /**
   * Parse time string (HH:MM) to minutes since midnight
   */
  private static parseTimeString(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 100 + minutes;
  }
}

// Convenience functions for common notification types
export class NotificationHelpers {
  static async sendMatchResultNotification(
    playerId: string,
    matchResult: 'win' | 'loss',
    opponentName: string,
    score?: string
  ): Promise<void> {
    const title = matchResult === 'win' ? 'Match Won! 🎉' : 'Match Completed';
    const body = matchResult === 'win'
      ? `Congratulations! You defeated ${opponentName}${score ? ` (${score})` : ''}`
      : `You played against ${opponentName}${score ? ` (${score})` : ''}`;

    await NotificationService.sendNotification(playerId, {
      title,
      body,
      type: NotificationType.MATCH_RESULT,
      category: NotificationCategory.MATCHES,
      data: { matchResult, opponentName, score },
    });
  }

  static async sendAchievementNotification(
    playerId: string,
    achievementName: string,
    achievementDescription: string,
    points?: number
  ): Promise<void> {
    const title = 'Achievement Unlocked! 🏆';
    const body = `${achievementName}: ${achievementDescription}${points ? ` (+${points} points)` : ''}`;

    await NotificationService.sendNotification(playerId, {
      title,
      body,
      type: NotificationType.ACHIEVEMENT_UNLOCK,
      category: NotificationCategory.ACHIEVEMENTS,
      data: { achievementName, achievementDescription, points },
    });
  }

  static async sendFriendRequestNotification(
    playerId: string,
    requesterName: string
  ): Promise<void> {
    const title = 'New Friend Request 👋';
    const body = `${requesterName} wants to be your friend`;

    await NotificationService.sendNotification(playerId, {
      title,
      body,
      type: NotificationType.FRIEND_REQUEST,
      category: NotificationCategory.SOCIAL,
      data: { requesterName },
    });
  }

  static async sendFriendAcceptedNotification(
    playerId: string,
    accepterName: string
  ): Promise<void> {
    const title = 'Friend Request Accepted! 🎉';
    const body = `${accepterName} accepted your friend request`;

    await NotificationService.sendNotification(playerId, {
      title,
      body,
      type: NotificationType.FRIEND_ACCEPTED,
      category: NotificationCategory.SOCIAL,
      data: { accepterName },
    });
  }

  static async sendChallengeNotification(
    playerId: string,
    challengerName: string,
    challengeType: string
  ): Promise<void> {
    const title = 'New Challenge! ⚡';
    const body = `${challengerName} challenged you to a ${challengeType}`;

    await NotificationService.sendNotification(playerId, {
      title,
      body,
      type: NotificationType.CHALLENGE_RECEIVED,
      category: NotificationCategory.SOCIAL,
      data: { challengerName, challengeType },
    });
  }

  static async sendChallengeResponseNotification(
    playerId: string,
    responderName: string,
    challengeType: string,
    accepted: boolean
  ): Promise<void> {
    const title = accepted ? 'Challenge Accepted! 🎾' : 'Challenge Declined';
    const body = accepted
      ? `${responderName} accepted your ${challengeType} challenge`
      : `${responderName} declined your ${challengeType} challenge`;

    await NotificationService.sendNotification(playerId, {
      title,
      body,
      type: NotificationType.CHALLENGE_RESPONSE,
      category: NotificationCategory.SOCIAL,
      data: { responderName, challengeType, accepted },
    });
  }

  static async sendTournamentUpdateNotification(
    playerId: string,
    tournamentName: string,
    updateType: string,
    message: string
  ): Promise<void> {
    const title = 'Tournament Update 🏓';
    const body = `${tournamentName}: ${message}`;

    await NotificationService.sendNotification(playerId, {
      title,
      body,
      type: NotificationType.TOURNAMENT_UPDATE,
      category: NotificationCategory.TOURNAMENTS,
      data: { tournamentName, updateType, message },
    });
  }

  static async sendSessionReminderNotification(
    playerId: string,
    sessionName: string,
    sessionTime: string,
    location?: string
  ): Promise<void> {
    const title = 'Session Reminder 🏓';
    const body = `${sessionName} starts at ${sessionTime}${location ? ` at ${location}` : ''}`;

    await NotificationService.sendNotification(playerId, {
      title,
      body,
      type: NotificationType.SESSION_REMINDER,
      category: NotificationCategory.SESSIONS,
      data: { sessionName, sessionTime, location },
    });
  }

  static async sendSystemAnnouncementNotification(
    playerId: string,
    announcementTitle: string,
    message: string
  ): Promise<void> {
    const title = `System: ${announcementTitle}`;
    const body = message;

    await NotificationService.sendNotification(playerId, {
      title,
      body,
      type: NotificationType.SYSTEM_ANNOUNCEMENT,
      category: NotificationCategory.SYSTEM,
      data: { announcementTitle, message },
    });
  }
}