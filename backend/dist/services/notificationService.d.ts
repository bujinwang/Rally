import { NotificationCategory, NotificationData, PushTokenData, NotificationPreferences, NotificationRecord } from '../types/notifications';
export declare class NotificationService {
    /**
     * Send a notification to a player
     */
    static sendNotification(playerId: string, notificationData: NotificationData): Promise<void>;
    /**
     * Send push notification to all active devices of a player
     */
    private static sendPushNotification;
    /**
     * Send notification to a specific device (mock implementation)
     */
    private static sendToDevice;
    /**
     * Register a push token for a player
     */
    static registerPushToken(playerId: string, tokenData: PushTokenData): Promise<void>;
    /**
     * Unregister a push token
     */
    static unregisterPushToken(token: string): Promise<void>;
    /**
     * Get notification preferences for a player
     */
    static getNotificationPreferences(playerId: string): Promise<NotificationPreferences>;
    /**
     * Update notification preferences for a player
     */
    static updateNotificationPreferences(playerId: string, preferences: NotificationPreferences): Promise<void>;
    /**
     * Get notifications for a player
     */
    static getNotifications(playerId: string, options?: {
        limit?: number;
        offset?: number;
        unreadOnly?: boolean;
        category?: NotificationCategory;
    }): Promise<NotificationRecord[]>;
    /**
     * Mark notification as read
     */
    static markNotificationAsRead(notificationId: string, playerId: string): Promise<void>;
    /**
     * Mark all notifications as read for a player
     */
    static markAllNotificationsAsRead(playerId: string): Promise<void>;
    /**
     * Get unread notification count for a player
     */
    static getUnreadNotificationCount(playerId: string): Promise<number>;
    /**
     * Delete old notifications (cleanup function)
     */
    static cleanupOldNotifications(daysOld?: number): Promise<void>;
    /**
     * Check if notification type is enabled based on preferences
     */
    private static isNotificationEnabled;
    /**
     * Check if current time is within quiet hours
     */
    private static isInQuietHours;
    /**
     * Parse time string (HH:MM) to minutes since midnight
     */
    private static parseTimeString;
}
export declare class NotificationHelpers {
    static sendMatchResultNotification(playerId: string, matchResult: 'win' | 'loss', opponentName: string, score?: string): Promise<void>;
    static sendAchievementNotification(playerId: string, achievementName: string, achievementDescription: string, points?: number): Promise<void>;
    static sendFriendRequestNotification(playerId: string, requesterName: string): Promise<void>;
    static sendFriendAcceptedNotification(playerId: string, accepterName: string): Promise<void>;
    static sendChallengeNotification(playerId: string, challengerName: string, challengeType: string): Promise<void>;
    static sendChallengeResponseNotification(playerId: string, responderName: string, challengeType: string, accepted: boolean): Promise<void>;
    static sendTournamentUpdateNotification(playerId: string, tournamentName: string, updateType: string, message: string): Promise<void>;
    static sendSessionReminderNotification(playerId: string, sessionName: string, sessionTime: string, location?: string): Promise<void>;
    static sendSystemAnnouncementNotification(playerId: string, announcementTitle: string, message: string): Promise<void>;
}
//# sourceMappingURL=notificationService.d.ts.map