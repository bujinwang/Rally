/**
 * Story 6.9 — T3: real push transport (Expo).
 *
 * This module is deliberately self-contained and DB-free. It knows how to turn a
 * batch of application-level push messages into Expo push tickets and nothing
 * else — no database access, no credential management, no logging of tokens.
 *
 * Design seam: the `Expo` client is **injected** via the constructor, so tests
 * (and any caller) can supply a fake and exercise the full behaviour with no
 * network and no Expo credentials. The module never constructs a live client
 * inside `send`.
 *
 * Correctness notes that drive the implementation:
 *  - `sendPushNotificationsAsync` returns a ticket array that is POSITIONAL
 *    against the messages actually sent. Because non-Expo tokens are filtered
 *    out before sending, the input array and the sent array diverge; we therefore
 *    carry each token (and its input index) alongside the message we send and map
 *    tickets back by index against THAT list. Attributing a ticket to the wrong
 *    device would be worse than not reporting at all.
 *  - `chunkPushNotifications` is an INSTANCE method (not a module export) and its
 *    limit is `Expo.pushNotificationChunkSizeLimit` (100). Chunks are sent
 *    sequentially — never unbounded parallel requests.
 *  - Results are returned in INPUT order (one per input message), so a caller can
 *    zip them straight back against what it asked to send.
 */

import { Expo } from 'expo-server-sdk';
import type { ExpoClientOptions, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

/** An application-level push message. `to` is an Expo push token. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** The outcome for a single input token. Exactly one per input message. */
export interface PushTicketResult {
  token: string;
  /** True when Expo accepted the message for delivery. */
  ok: boolean;
  /** Error message for a rejected/skipped message; absent when `ok` is true. */
  error?: string;
  /** True when Expo reported `DeviceNotRegistered` — the caller should deactivate the token. */
  deviceNotRegistered?: boolean;
}

export interface PushTransport {
  send(messages: PushMessage[]): Promise<PushTicketResult[]>;
}

/**
 * The minimal slice of the Expo SDK this transport needs. Kept structural so a
 * plain object can be injected in tests without credentials or network.
 */
export interface ExpoPushClient {
  sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
  chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][];
}

/** Message used to report a token that Expo cannot deliver to. */
const INVALID_TOKEN_ERROR = 'Not an Expo push token (skipped)';

export class ExpoPushTransport implements PushTransport {
  constructor(private readonly client: ExpoPushClient) {}

  /**
   * Send `messages`, returning exactly one {@link PushTicketResult} per input
   * message, in input order. Non-Expo tokens are reported as skipped, and a
   * single failing token never aborts the rest of the batch.
   */
  async send(messages: PushMessage[]): Promise<PushTicketResult[]> {
    // No messages → no work, no network.
    if (messages.length === 0) {
      return [];
    }

    // Results are keyed by input index so the returned array lines up 1:1 with
    // `messages` regardless of how many tokens are skipped.
    const results: Array<PushTicketResult | undefined> = new Array(messages.length);

    // 1. Partition. Skip tokens Expo cannot address, but REPORT them (one result
    //    each) so the caller sees the skip instead of a silent drop.
    const deliverable: Array<{ inputIndex: number; token: string; message: ExpoPushMessage }> = [];
    messages.forEach((message, inputIndex) => {
      if (!Expo.isExpoPushToken(message.to)) {
        results[inputIndex] = { token: message.to, ok: false, error: INVALID_TOKEN_ERROR };
        return;
      }
      deliverable.push({
        inputIndex,
        token: message.to,
        // Only what the caller supplied — no identity/email/token material is injected (AC 16).
        message: {
          to: message.to,
          title: message.title,
          body: message.body,
          ...(message.data ? { data: message.data } : {}),
        },
      });
    });

    if (deliverable.length === 0) {
      return results.map((result) => result as PushTicketResult);
    }

    // 2. Batch with the SDK's own chunker (limit 100/request), then send each
    //    chunk SEQUENTIALLY (bounded — never unbounded parallel fan-out).
    const chunks = this.client.chunkPushNotifications(deliverable.map((entry) => entry.message));

    // Walk the deliverable list in lockstep with the chunks. `chunkPushNotifications`
    // returns ordered slices, so a running cursor keeps token↔message alignment.
    let cursor = 0;
    for (const chunk of chunks) {
      const chunkEntries = deliverable.slice(cursor, cursor + chunk.length);
      cursor += chunk.length;

      let tickets: ExpoPushTicket[];
      try {
        tickets = await this.client.sendPushNotificationsAsync(chunk);
      } catch (err) {
        // A whole-chunk transport failure must not lose any token: report each
        // token in this chunk as failed and continue with the remaining chunks.
        const reason = err instanceof Error ? err.message : 'Push send failed';
        for (const entry of chunkEntries) {
          results[entry.inputIndex] = { token: entry.token, ok: false, error: reason };
        }
        continue;
      }

      // 3. Index-safe correlation: tickets[i] belongs to chunkEntries[i] (which
      //    is chunk[i]). This is exact even though non-Expo tokens were filtered
      //    out of the input, because we map against the SENT list, not the input.
      for (let i = 0; i < chunkEntries.length; i += 1) {
        const entry = chunkEntries[i];
        results[entry.inputIndex] = this.toResult(entry.token, tickets[i]);
      }
    }

    return results.map((result) => result as PushTicketResult);
  }

  /** Map one Expo ticket (or a missing one) to a per-token result. */
  private toResult(token: string, ticket: ExpoPushTicket | undefined): PushTicketResult {
    if (!ticket) {
      return { token, ok: false, error: 'No ticket returned for token' };
    }

    if (ticket.status === 'ok') {
      return { token, ok: true };
    }

    const result: PushTicketResult = { token, ok: false, error: ticket.message };
    if (ticket.details?.error === 'DeviceNotRegistered') {
      result.deviceNotRegistered = true;
    }
    return result;
  }
}

/**
 * Convenience factory for production wiring: builds an {@link ExpoPushTransport}
 * around a real `Expo` client. Kept out of the class so tests can inject a fake
 * without touching credentials.
 */
export function createExpoPushTransport(options?: Partial<ExpoClientOptions>): ExpoPushTransport {
  return new ExpoPushTransport(new Expo(options));
}
