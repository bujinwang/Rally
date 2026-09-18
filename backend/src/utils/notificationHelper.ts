import { prisma } from '../config/database';

interface NotificationPayload {
  title: string;
  body: string;
  type: string;
  data?: Record<string, any>;
}

/**
 * Story 6.9 (F9): `push_tokens` is keyed to a **user** and/or a **device** (Option
 * C). `playerId` is legacy and permanently NULL, so any lookup on it returns zero
 * rows. Token selection therefore matches `userId` OR `deviceId` against the
 * identity in hand — never `playerId`.
 *
 * `isActive: true` is part of every selection: an inactive token must not be used.
 */
type TokenIdentityFilter = { userId: string } | { deviceId: string };

/** Build the OR-identity filter for a token lookup from a (userId, deviceId) pair. */
function tokenIdentityFilters(
  userId: string | null | undefined,
  deviceId: string | null | undefined,
): TokenIdentityFilter[] {
  const filters: TokenIdentityFilter[] = [];
  if (userId) filters.push({ userId });
  if (deviceId) filters.push({ deviceId });
  return filters;
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
        // Story 6.9 (F9): a player's token identity is its linked account
        // (`userId`) and/or its device (`deviceId`) — not the MvpPlayer id.
        userId: true,
        deviceId: true,
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
        // Story 6.9 (F9): match tokens by the player's account/device identity.
        const filters = tokenIdentityFilters(player.userId, player.deviceId);
        if (filters.length === 0) continue; // no resolvable token identity

        const tokens = await prisma.pushToken.findMany({
          where: {
            isActive: true,
            OR: filters,
          },
        });

        if (tokens.length === 0) continue;

        // Send push (implementation depends on Expo push service)
        for (const token of tokens) {
          // Placeholder — actual implementation would call Expo Push API
          // await sendExpoPushNotification(token.token, payload);
          // AC 16: never log the push token (credential material).
          console.log(`  → Would push to ${token.platform} device for session ${sessionId}`);
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
 *
 * `userId` is a `User.id` (callers: `scheduler.ts`, `friends.ts`, `messaging.ts`),
 * so the lookup is on `push_tokens.userId` (Story 6.9 F9, Option C).
 */
export async function notifyDevice(
  userId: string,
  payload: NotificationPayload,
): Promise<boolean> {
  try {
    const tokens = await prisma.pushToken.findMany({
      where: { isActive: true, userId },
    });

    if (tokens.length === 0) return false;

    for (const token of tokens) {
      // Placeholder — actual push delivery goes here.
      // AC 16: never log the push token (credential material).
      console.log(`  → Push to ${token.platform} device: ${payload.title}`);
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
      select: {
        id: true,
        name: true,
        // Story 6.9 (F9): token identity is the linked account/device, not the
        // MvpPlayer id.
        userId: true,
        deviceId: true,
      },
    });

    if (!player) return false;

    // Story 6.9 (F9): match tokens by the player's account/device identity.
    const filters = tokenIdentityFilters(player.userId, player.deviceId);
    if (filters.length === 0) return false;

    const tokens = await prisma.pushToken.findMany({
      where: {
        isActive: true,
        OR: filters,
      },
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
