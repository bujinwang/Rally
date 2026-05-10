// @ts-nocheck
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type NotificationType =
  | 'GAME_READY'
  | 'REST_APPROVED'
  | 'REST_DENIED'
  | 'SCORE_RECORDED'
  | 'NEXT_UP'
  | 'SESSION_STARTING'
  | 'SESSION_UPDATED'
  | 'PLAYER_JOINED'
  | 'PAIRING_GENERATED';

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
}

class NotificationService {
  private pushToken: string | null = null;
  private notificationListener: any = null;
  private responseListener: any = null;

  /**
   * Initialize notification service and request permissions
   */
  async initialize(): Promise<string | null> {
    try {
      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('Failed to get push notification permissions');
        return null;
      }

      // Get push token (for production push notifications)
      if (Platform.OS !== 'web') {
        const token = await Notifications.getExpoPushTokenAsync({
          projectId: process.env.EXPO_PUBLIC_PROJECT_ID || 'your-expo-project-id',
        });
        this.pushToken = token.data;
        
        // Save token to AsyncStorage
        await AsyncStorage.setItem('push_token', this.pushToken);
        
        console.log('Push notification token:', this.pushToken);
      }

      // Setup notification listeners
      this.setupListeners();

      return this.pushToken;
    } catch (error) {
      console.error('Error initializing notifications:', error);
      return null;
    }
  }

  /**
   * Setup notification listeners
   */
  private setupListeners() {
    // Listener for notifications received while app is foregrounded
    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('Notification received:', notification);
        // Handle in-app notification display
        this.handleNotificationReceived(notification);
      }
    );

    // Listener for when user interacts with notification
    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('Notification response:', response);
        // Handle notification tap
        this.handleNotificationResponse(response);
      }
    );
  }

  /**
   * Handle notification received while app is open
   */
  private handleNotificationReceived(notification: Notifications.Notification) {
    const { request } = notification;
    const { content } = request;
    
    // You can show in-app toast or banner here
    // For now, just log
    console.log('Handling notification:', content.title, content.body);
  }

  /**
   * Handle notification tap/response
   */
  private handleNotificationResponse(response: Notifications.NotificationResponse) {
    const { notification } = response;
    const { request } = notification;
    const { content } = request;
    const data = content.data as any;

    // Navigate based on notification type
    switch (data?.type) {
      case 'GAME_READY':
        // Navigate to active games
        console.log('Navigate to games screen');
        break;
      case 'REST_APPROVED':
      case 'REST_DENIED':
        // Navigate to player status
        console.log('Navigate to status screen');
        break;
      case 'SCORE_RECORDED':
        // Navigate to match history
        console.log('Navigate to history screen');
        break;
      case 'NEXT_UP':
        // Navigate to queue
        console.log('Navigate to queue screen');
        break;
      case 'SESSION_STARTING':
        // Navigate to session details
        console.log('Navigate to session screen');
        break;
    }
  }

  /**
   * Schedule a local notification
   */
  async scheduleNotification(payload: NotificationPayload, delaySeconds: number = 0) {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: payload.title,
          body: payload.body,
          data: { ...payload.data, type: payload.type },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: delaySeconds > 0 ? { seconds: delaySeconds } : null,
      });

      console.log('Scheduled notification:', notificationId);
      return notificationId;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  }

  /**
   * Show immediate local notification
   */
  async showNotification(payload: NotificationPayload) {
    return this.scheduleNotification(payload, 0);
  }

  /**
   * Cancel a scheduled notification
   */
  async cancelNotification(notificationId: string) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      console.log('Cancelled notification:', notificationId);
    } catch (error) {
      console.error('Error cancelling notification:', error);
    }
  }

  /**
   * Cancel all notifications
   */
  async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('Cancelled all notifications');
    } catch (error) {
      console.error('Error cancelling all notifications:', error);
    }
  }

  /**
   * Get push token
   */
  getPushToken(): string | null {
    return this.pushToken;
  }

  /**
   * Send push token to backend
   */
  async registerPushToken(userId: string, deviceId: string) {
    if (!this.pushToken) {
      console.warn('No push token available');
      return false;
    }

    try {
      // TODO: Implement API call to register token
      // await api.post('/notifications/register', {
      //   userId,
      //   deviceId,
      //   pushToken: this.pushToken,
      //   platform: Platform.OS,
      // });
      
      console.log('Push token registered for user:', userId);
      return true;
    } catch (error) {
      console.error('Error registering push token:', error);
      return false;
    }
  }

  /**
   * Cleanup listeners
   */
  cleanup() {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
    }
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
    }
  }

  /**
   * Helper methods for specific notification types
   */

  async notifyGameReady(gameId: string, players: string[], courtName: string) {
    return this.showNotification({
      type: 'GAME_READY',
      title: '🏸 Your Game is Ready!',
      body: `Court ${courtName}: ${players.join(', ')}`,
      data: { gameId, courtName },
    });
  }

  async notifyRestApproved(playerName: string, duration: number) {
    return this.showNotification({
      type: 'REST_APPROVED',
      title: '✅ Rest Request Approved',
      body: `${playerName}, your rest request (${duration} min) has been approved`,
      data: { playerName, duration },
    });
  }

  async notifyRestDenied(playerName: string, reason?: string) {
    return this.showNotification({
      type: 'REST_DENIED',
      title: '❌ Rest Request Denied',
      body: reason || `${playerName}, your rest request was denied`,
      data: { playerName, reason },
    });
  }

  async notifyScoreRecorded(
    matchNumber: number,
    team1Score: number,
    team2Score: number,
    isWinner: boolean
  ) {
    return this.showNotification({
      type: 'SCORE_RECORDED',
      title: isWinner ? '🎉 You Won!' : '😔 Match Lost',
      body: `Match #${matchNumber} final score: ${team1Score}-${team2Score}`,
      data: { matchNumber, team1Score, team2Score, isWinner },
    });
  }

  async notifyNextUp(playerName: string, position: number) {
    return this.showNotification({
      type: 'NEXT_UP',
      title: "🎾 You're Up Next!",
      body: `${playerName}, you're #${position} in the queue`,
      data: { playerName, position },
    });
  }

  async notifySessionStarting(sessionName: string, minutesUntilStart: number) {
    return this.showNotification({
      type: 'SESSION_STARTING',
      title: '⏰ Session Starting Soon',
      body: `${sessionName} starts in ${minutesUntilStart} minutes`,
      data: { sessionName, minutesUntilStart },
    });
  }

  async notifySessionUpdated(sessionName: string, updateType: string, details: string) {
    return this.showNotification({
      type: 'SESSION_UPDATED',
      title: `📢 ${sessionName} Updated`,
      body: `${updateType}: ${details}`,
      data: { sessionName, updateType, details },
    });
  }

  async notifyPlayerJoined(playerName: string, sessionName: string) {
    return this.showNotification({
      type: 'PLAYER_JOINED',
      title: '👋 New Player Joined',
      body: `${playerName} joined ${sessionName}`,
      data: { playerName, sessionName },
    });
  }

  async notifyPairingGenerated(newGamesCount: number) {
    return this.showNotification({
      type: 'PAIRING_GENERATED',
      title: '🎯 New Pairings Generated',
      body: `${newGamesCount} new ${newGamesCount === 1 ? 'game' : 'games'} created`,
      data: { newGamesCount },
    });
  }
}

// Export singleton instance
export const notificationService = new NotificationService();

// Hook for using notifications in components
export const useNotifications = () => {
  return {
    notificationService,
    scheduleNotification: notificationService.scheduleNotification.bind(notificationService),
    showNotification: notificationService.showNotification.bind(notificationService),
    cancelNotification: notificationService.cancelNotification.bind(notificationService),
    cancelAllNotifications: notificationService.cancelAllNotifications.bind(notificationService),
    
    // Helper methods
    notifyGameReady: notificationService.notifyGameReady.bind(notificationService),
    notifyRestApproved: notificationService.notifyRestApproved.bind(notificationService),
    notifyRestDenied: notificationService.notifyRestDenied.bind(notificationService),
    notifyScoreRecorded: notificationService.notifyScoreRecorded.bind(notificationService),
    notifyNextUp: notificationService.notifyNextUp.bind(notificationService),
    notifySessionStarting: notificationService.notifySessionStarting.bind(notificationService),
    notifySessionUpdated: notificationService.notifySessionUpdated.bind(notificationService),
    notifyPlayerJoined: notificationService.notifyPlayerJoined.bind(notificationService),
    notifyPairingGenerated: notificationService.notifyPairingGenerated.bind(notificationService),
  };
};
