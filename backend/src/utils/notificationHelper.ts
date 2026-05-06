import { prisma } from '../config/database';

export interface NotificationPayload {
  title: string;
  body: string;
  type: string;
  data?: Record<string, any>;
}

/**
 * Send notification to session subscribers
 */
export async function notifySessionSubscribers(
  sessionId: string,
  notification: NotificationPayload
): Promise<number> {
  try {
    // Get active subscribers for this session
    const subscriptions = await prisma.sessionSubscription.findMany({
      where: {
        sessionId,
        isActive: true,
      },
      include: {
        pushToken: {
          where: { isActive: true },
        },
      },
    });

    if (subscriptions.length === 0) {
      console.log('No subscribers found for session:', sessionId);
      return 0;
    }

    // Get device IDs with active push tokens
    const deviceIds = subscriptions
      .filter((sub) => sub.pushToken.length > 0)
      .map((sub) => sub.deviceId);

    if (deviceIds.length === 0) {
      console.log('No push tokens found for session subscribers');
      return 0;
    }

    // In production, you would send to Expo Push Notification service here
    console.log(`📱 Would send notification to ${deviceIds.length} devices:`, {
      title: notification.title,
      body: notification.body,
      type: notification.type,
      deviceIds,
    });

    // TODO: Implement actual push notification sending
    // const expo = new Expo();
    // const messages = deviceIds.map(deviceId => ({
    //   to: pushTokens[deviceId],
    //   sound: 'default',
    //   title: notification.title,
    //   body: notification.body,
    //   data: { ...notification.data, type: notification.type },
    // }));
    // await expo.sendPushNotificationsAsync(messages);

    return deviceIds.length;
  } catch (error) {
    console.error('Error sending notification to subscribers:', error);
    return 0;
  }
}

/**
 * Send notification to specific device
 */
export async function notifyDevice(
  deviceId: string,
  notification: NotificationPayload
): Promise<boolean> {
  try {
    const pushToken = await prisma.pushToken.findUnique({
      where: { deviceId, isActive: true },
    });

    if (!pushToken) {
      console.log('No active push token found for device:', deviceId);
      return false;
    }

    console.log(`📱 Would send notification to device ${deviceId}:`, {
      title: notification.title,
      body: notification.body,
      type: notification.type,
    });

    // TODO: Implement actual push notification sending
    return true;
  } catch (error) {
    console.error('Error sending notification to device:', error);
    return false;
  }
}

/**
 * Send notification to specific player
 */
export async function notifyPlayer(
  sessionId: string,
  playerName: string,
  notification: NotificationPayload
): Promise<boolean> {
  try {
    // Find player's device ID
    const player = await prisma.mvpPlayer.findFirst({
      where: {
        sessionId,
        name: playerName,
      },
    });

    if (!player || !player.deviceId) {
      console.log('Player not found or no device ID:', playerName);
      return false;
    }

    return await notifyDevice(player.deviceId, notification);
  } catch (error) {
    console.error('Error sending notification to player:', error);
    return false;
  }
}

/**
 * Check if notifications are allowed (quiet hours, preferences)
 */
export async function shouldSendNotification(
  deviceId: string,
  notificationType: string
): Promise<boolean> {
  try {
    const preferences = await prisma.notificationPreferences.findUnique({
      where: { deviceId },
    });

    // If no preferences, allow all notifications
    if (!preferences) {
      return true;
    }

    // Check if push notifications are enabled
    if (!preferences.enablePush) {
      return false;
    }

    // Check if this notification type is enabled
    const notificationTypes = preferences.notificationTypes as any;
    if (
      notificationTypes &&
      typeof notificationTypes === 'object' &&
      notificationTypes[notificationType] === false
    ) {
      return false;
    }

    // Check quiet hours
    if (preferences.quietHoursStart && preferences.quietHoursEnd) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;

      const start = preferences.quietHoursStart;
      const end = preferences.quietHoursEnd;

      // Simple time comparison (doesn't handle midnight crossing)
      if (currentTime >= start && currentTime <= end) {
        console.log('Notification blocked by quiet hours:', deviceId);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error checking notification preferences:', error);
    return true; // Allow on error
  }
}
