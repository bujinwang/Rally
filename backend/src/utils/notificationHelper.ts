import { prisma } from '../config/database';
import {
  createExpoPushTransport,
  PushMessage,
  PushTicketResult,
  PushTransport,
} from '../services/pushTransport';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  isAllowedForGuest,
  isInQuietHours,
  isTypeEnabled,
  StoredNotificationPreferences,
  toNotificationPreferences,
} from '../services/notificationPreferences';
import type { NotificationPreferences } from '../types/notifications';

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

/** The columns of a `push_tokens` row the send path needs. */
interface DeliverableToken {
  id: string;
  token: string;
  userId: string | null;
  deviceId: string | null;
}

/** `select` clause shared by every token lookup, so no lookup can forget a field. */
const TOKEN_SELECT = {
  id: true,
  token: true,
  userId: true,
  deviceId: true,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Injectable push transport (test seam)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The process-wide transport. A real Expo-backed transport is created **lazily**
 * and **once** — never per call — and only if no fake has been injected. Tests
 * call {@link setPushTransport} to substitute a fake and {@link setPushTransport}
 * with `null` to restore the default.
 */
let injectedTransport: PushTransport | null = null;
let defaultTransport: PushTransport | null = null;

/** Inject a fake transport (tests) or pass `null` to restore the real one. */
export function setPushTransport(transport: PushTransport | null): void {
  injectedTransport = transport;
}

/** Resolve the transport to use, constructing the real one on first use only. */
export function getPushTransport(): PushTransport {
  if (injectedTransport) return injectedTransport;
  if (!defaultTransport) defaultTransport = createExpoPushTransport();
  return defaultTransport;
}

// ─────────────────────────────────────────────────────────────────────────────
// Preference / policy gate (AC 3 + AC 5)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load the effective preferences for a token: account-keyed row first, then a
 * device-keyed row, else the schema defaults. Never throws into the caller.
 */
async function loadPreferences(token: DeliverableToken): Promise<NotificationPreferences> {
  let row: StoredNotificationPreferences | null = null;

  if (token.userId) {
    row = await prisma.notificationPreferences.findUnique({ where: { userId: token.userId } });
  }
  if (!row && token.deviceId) {
    row = await prisma.notificationPreferences.findUnique({ where: { deviceId: token.deviceId } });
  }

  return row ? toNotificationPreferences(row) : DEFAULT_NOTIFICATION_PREFERENCES;
}

/**
 * AC 3 + AC 5 policy gate: may a push of `type` be delivered to `token`?
 *
 * Suppression is a **skip**, never an error. Returns `false` when any of:
 *   - the token is device-only (guest) and `type` is not on the guest allow-list
 *     (deny-by-default — an unknown/unmapped type is refused for guests);
 *   - the master push toggle is off (`pushEnabled === false`);
 *   - the type's own preference column is off;
 *   - the current time is inside the recipient's quiet hours.
 */
async function isDeliverable(token: DeliverableToken, type: string): Promise<boolean> {
  // AC 5 — guest policy first (no DB read needed for the common deny case).
  if (!token.userId && !isAllowedForGuest(type)) {
    return false;
  }

  const preferences = await loadPreferences(token);

  if (preferences.pushEnabled === false) return false; // master toggle off
  if (!isTypeEnabled(type, preferences)) return false; // per-type column off
  if (isInQuietHours(preferences)) return false; // quiet hours

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared delivery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deliver `payload` to `tokens`, applying the AC 3/5 gate, and return the number
 * of tokens Expo accepted.
 *
 * Contract:
 *  - **Never throws.** A transport failure is logged and reported as zero
 *    delivered (Story 6.4 `FIX-7` discipline: delivery must not break the caller).
 *  - **Suppressed tokens are skipped, not failed.**
 *  - A token is deactivated **only** on a genuine `DeviceNotRegistered` — never
 *    on a `skipped` result (a skipped token is not a dead device).
 *  - AC 16: only caller-supplied `data` is sent; the token is never logged and
 *    never placed in the payload.
 */
async function deliverToTokens(
  tokens: DeliverableToken[],
  payload: NotificationPayload,
): Promise<number> {
  if (tokens.length === 0) return 0;

  // 1. Policy gate. Evaluate each token; a policy-evaluation error fails CLOSED
  //    (the token is skipped) rather than delivering something we could not clear.
  const eligible: DeliverableToken[] = [];
  for (const token of tokens) {
    try {
      if (await isDeliverable(token, payload.type)) {
        eligible.push(token);
      }
    } catch (error) {
      console.error('Failed to evaluate push preference policy:', error);
    }
  }

  if (eligible.length === 0) return 0;

  // 2. Send. AC 16: only the caller's own fields are forwarded.
  const messages: PushMessage[] = eligible.map((token) => ({
    to: token.token,
    title: payload.title,
    body: payload.body,
    ...(payload.data ? { data: payload.data } : {}),
  }));

  let results: PushTicketResult[];
  try {
    results = await getPushTransport().send(messages);
  } catch (error) {
    // FIX-7: a transport failure must never propagate to the caller.
    console.error('Push transport failed:', error);
    return 0;
  }

  // 3. Reconcile. `results[i]` corresponds to `eligible[i]` (the transport returns
  //    one result per message, in input order).
  let delivered = 0;
  for (let i = 0; i < eligible.length; i += 1) {
    const result = results[i];
    if (!result) continue;

    if (result.ok) delivered += 1;

    // Only a genuine dead device — never a skip — retires the token.
    if (result.deviceNotRegistered && !result.skipped) {
      try {
        await prisma.pushToken.update({
          where: { id: eligible[i].id },
          data: { isActive: false },
        });
      } catch (error) {
        console.error('Failed to deactivate unregistered push token:', error);
      }
    }
  }

  return delivered;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public senders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a push notification to all subscribers of a session.
 *
 * Returns the number of **players** for whom at least one push was accepted.
 * Delivery failures are isolated per player and never abort the batch.
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

    console.log(
      `📢 Notifying ${subscribers.length} players for session ${sessionId}: ${payload.title}`,
    );

    let notified = 0;
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
          select: TOKEN_SELECT,
        });

        if (tokens.length === 0) continue;

        const delivered = await deliverToTokens(tokens, payload);
        if (delivered > 0) notified += 1;
      } catch (err) {
        // Individual player notification failure shouldn't block others
        console.error(`Failed to notify player ${player.id}:`, err);
      }
    }

    return notified;
  } catch (error) {
    console.error('Failed to send session notifications:', error);
    return 0;
  }
}

/**
 * Send a notification to a specific account.
 *
 * `userId` is a `User.id` (callers: `scheduler.ts`, `friends.ts`, `messaging.ts`),
 * so the lookup is on `push_tokens.userId` (Story 6.9 F9, Option C).
 *
 * Returns `true` when at least one push was accepted.
 */
export async function notifyDevice(
  userId: string,
  payload: NotificationPayload,
): Promise<boolean> {
  try {
    const tokens = await prisma.pushToken.findMany({
      where: { isActive: true, userId },
      select: TOKEN_SELECT,
    });

    if (tokens.length === 0) return false;

    const delivered = await deliverToTokens(tokens, payload);
    return delivered > 0;
  } catch (error) {
    console.error('Failed to notify device:', error);
    return false;
  }
}

/**
 * Send a notification to a specific player in a session.
 *
 * Returns `true` when at least one push was accepted.
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
      select: TOKEN_SELECT,
    });

    if (tokens.length === 0) return false;

    const delivered = await deliverToTokens(tokens, payload);
    return delivered > 0;
  } catch (error) {
    console.error('Failed to notify player:', error);
    return false;
  }
}
