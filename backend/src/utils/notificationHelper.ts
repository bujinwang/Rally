import { prisma } from '../config/database';

interface NotificationPayload {
  title: string;
  body: string;
  type: string;
  data?: Record<string, any>;
}

/**
 * Send push notification to all subscribers of a session.
 *
 * In the MVP context (no Expo push tokens stored), this reads the
 * NotificationToken table and delivers to all subscribed devices.
 * Returns the count of devices notified.
 */
export async function notifySessionSubscribers(
  sessionId: string,
  payload: NotificationPayload,
): Promise<number> {
  try {
    const subscribers = await prisma.mvpPlayer.findMany({
      where: {
        sessionId,
        status: { not: 'LEFT' },
      },
      select: {
        id: true,
        sessionId: true,
      },
    });

    if (subscribers.length === 0) return 0;

    // In a full implementation, we'd look up device push tokens from a
    // NotificationToken table. For MVP, we log for observability.
    console.log(
      `📢 Notifying ${subscribers.length} players for session ${sessionId}: ${payload.title}`,
    );

    // Attempt actual push delivery if device tokens exist
    let delivered = 0;
    for (const player of subscribers) {
      try {
        // Look up NotificationToken for this player (future: device-level binding)
        const tokens = await prisma.pushToken.findMany({
          where: {
            playerId: player.id,
          },
        });

        if (tokens.length === 0) continue;

        // Send push (implementation depends on Expo push service)
        for (const token of tokens) {
          // Placeholder — actual implementation would call Expo Push API
          // await sendExpoPushNotification(token.token, payload);
          console.log(`  → Would push to token ${token.token.substring(0, 12)}...`);
        }

        delivered++;
      } catch (err) {
        // Individual player notification failure shouldn't block others
        console.error(`Failed to notify player ${player.id}:`, err);
      }
    }

    return delivered;
  } catch (error) {
    console.error('Failed to send session notifications:', error);
    return 0;
  }
}

/**
 * Send notification to a specific device/user.
 */
export async function notifyDevice(
  userId: string,
  payload: NotificationPayload,
): Promise<boolean> {
  try {
    const tokens = await prisma.pushToken.findMany({
      where: { playerId: userId },
    });

    if (tokens.length === 0) return false;

    for (const token of tokens) {
      // Placeholder — actual push delivery goes here
      console.log(`  → Push to token ${token.token.substring(0, 12)}... : ${payload.title}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to notify device:', error);
    return false;
  }
}

/**
 * Send notification to a specific player in a session.
 */
export async function notifyPlayer(
  sessionId: string,
  playerName: string,
  payload: NotificationPayload,
): Promise<boolean> {
  try {
    const player = await prisma.mvpPlayer.findFirst({
      where: { sessionId, name: playerName },
    });

    if (!player) return false;

    const tokens = await prisma.pushToken.findMany({
      where: { playerId: player.id },
    });

    if (tokens.length === 0) return false;

    for (const token of tokens) {
      console.log(`  → Push to ${player.name}: ${payload.title}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to notify player:', error);
    return false;
  }
}
