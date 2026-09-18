/**
 * Story 6.9 — T3: push transport tests.
 *
 * Every test injects a FAKE Expo client: no network, no Expo credentials. The
 * fake mirrors the real SDK's contract — `sendPushNotificationsAsync` returns a
 * positional ticket array, and `chunkPushNotifications` slices at the SDK's
 * 100-message limit.
 */

import { ExpoPushTransport } from '../pushTransport';
import type { ExpoPushClient, PushMessage } from '../pushTransport';
import type { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

const INVALID_TOKEN_ERROR = 'Not an Expo push token (skipped)';

/** Faithful fake of the slice of `expo-server-sdk` the transport uses. */
class FakeExpo implements ExpoPushClient {
  public sentChunks: ExpoPushMessage[][] = [];
  public chunkSize = 100;
  /** 0-based indices of `sendPushNotificationsAsync` calls that should reject. */
  public rejectChunks = new Set<number>();

  private responder: (chunk: ExpoPushMessage[]) => ExpoPushTicket[] = (chunk) =>
    chunk.map((_message, index) => ({ status: 'ok', id: `receipt-${index}` }));

  /** Replace the ticket generator. */
  onSend(responder: (chunk: ExpoPushMessage[]) => ExpoPushTicket[]): void {
    this.responder = responder;
  }

  chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][] {
    const chunks: ExpoPushMessage[][] = [];
    for (let i = 0; i < messages.length; i += this.chunkSize) {
      chunks.push(messages.slice(i, i + this.chunkSize));
    }
    return chunks;
  }

  async sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    const callIndex = this.sentChunks.length;
    this.sentChunks.push(messages);
    if (this.rejectChunks.has(callIndex)) {
      throw new Error('network down');
    }
    return this.responder(messages);
  }
}

let tokenSeq = 0;
/** A syntactically valid Expo token (accepted by `Expo.isExpoPushToken`). */
const expoToken = () => `ExpoPushToken[device-${++tokenSeq}]`;

const msg = (to: string, extra: Partial<PushMessage> = {}): PushMessage => ({
  to,
  title: 'Title',
  body: 'Body',
  ...extra,
});

describe('ExpoPushTransport (Story 6.9 T3)', () => {
  let expo: FakeExpo;
  let transport: ExpoPushTransport;

  beforeEach(() => {
    expo = new FakeExpo();
    transport = new ExpoPushTransport(expo);
  });

  // ── payload construction ───────────────────────────────────────────────────

  it('maps to/title/body/data through to the SDK message', async () => {
    const token = expoToken();

    await transport.send([
      { to: token, title: 'Hi', body: 'There', data: { sessionId: 's1' } },
    ]);

    expect(expo.sentChunks).toHaveLength(1);
    expect(expo.sentChunks[0][0]).toEqual({
      to: token,
      title: 'Hi',
      body: 'There',
      data: { sessionId: 's1' },
    });
  });

  it('omits the data field entirely when the caller supplies none', async () => {
    const token = expoToken();

    await transport.send([msg(token)]);

    expect(expo.sentChunks[0][0]).not.toHaveProperty('data');
  });

  it('injects nothing into the payload (AC 16 — no sensitive data)', async () => {
    const token = expoToken();
    const data = { sessionId: 's1', kind: 'reminder' };

    await transport.send([{ to: token, title: 'T', body: 'B', data }]);

    const sent = expo.sentChunks[0][0];
    expect(sent.data).toEqual({ sessionId: 's1', kind: 'reminder' });
    expect(Object.keys(sent.data as object).sort()).toEqual(['kind', 'sessionId']);
    expect(sent).not.toHaveProperty('email');
    expect(sent).not.toHaveProperty('userId');
    expect(sent.data).not.toHaveProperty('token');
  });

  // ── batching ───────────────────────────────────────────────────────────────

  it('splits >100 messages into the correct number of sequential sends', async () => {
    const messages = Array.from({ length: 250 }, () => msg(expoToken()));

    const results = await transport.send(messages);

    expect(expo.sentChunks.map((chunk) => chunk.length)).toEqual([100, 100, 50]);
    expect(results).toHaveLength(250);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  // ── index-safe correlation ─────────────────────────────────────────────────

  it('maps tickets to the right tokens when a non-Expo token is filtered out mid-array', async () => {
    const t1 = expoToken();
    const bad = 'not-an-expo-token';
    const t2 = expoToken();
    const t3 = expoToken();

    // Positional tickets against the SENT chunk [t1, t2, t3]: only t2 fails.
    expo.onSend((chunk) =>
      chunk.map((m, index) =>
        m.to === t2
          ? { status: 'error', message: 't2 rejected' }
          : { status: 'ok', id: `receipt-${index}` },
      ),
    );

    const results = await transport.send([msg(t1), msg(bad), msg(t2), msg(t3)]);
    const byToken = Object.fromEntries(results.map((r) => [r.token, r]));

    // The skipped token was never sent...
    expect(expo.sentChunks[0].map((m) => m.to)).toEqual([t1, t2, t3]);
    // ...and its result is the SKIP, not some other device's ticket.
    expect(byToken[bad].ok).toBe(false);
    expect(byToken[bad].error).toBe(INVALID_TOKEN_ERROR);
    // t2's failure is attributed to t2, not shifted onto t3.
    expect(byToken[t2].ok).toBe(false);
    expect(byToken[t2].error).toBe('t2 rejected');
    expect(byToken[t1].ok).toBe(true);
    expect(byToken[t3].ok).toBe(true);
  });

  // ── skipping non-Expo tokens ───────────────────────────────────────────────

  it('reports a skipped non-Expo token instead of silently dropping it', async () => {
    const results = await transport.send([msg('bad-token')]);

    expect(results).toEqual([
      { token: 'bad-token', ok: false, error: INVALID_TOKEN_ERROR },
    ]);
    expect(expo.sentChunks).toHaveLength(0);
  });

  // ── per-token error isolation ──────────────────────────────────────────────

  it('isolates one rejected ticket from the rest of the batch', async () => {
    const [a, b, c] = [expoToken(), expoToken(), expoToken()];
    expo.onSend((chunk) =>
      chunk.map((_m, index) =>
        index === 1
          ? { status: 'error', message: 'boom' }
          : { status: 'ok', id: `receipt-${index}` },
      ),
    );

    const results = await transport.send([msg(a), msg(b), msg(c)]);

    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(results[1].error).toBe('boom');
    expect(expo.sentChunks[0]).toHaveLength(3); // all three were still sent
  });

  it('attributes a whole-chunk transport failure to that chunk only', async () => {
    expo.chunkSize = 2;
    expo.rejectChunks.add(1); // second chunk (3rd & 4th messages) rejects

    const tokens = [expoToken(), expoToken(), expoToken(), expoToken()];
    const results = await transport.send(tokens.map((token) => msg(token)));

    expect(results).toHaveLength(4);
    expect(results.map((r) => r.ok)).toEqual([true, true, false, false]);
    expect(results[2].error).toBe('network down');
    expect(results[3].error).toBe('network down');
  });

  // ── DeviceNotRegistered ────────────────────────────────────────────────────

  it('sets deviceNotRegistered when Expo reports DeviceNotRegistered', async () => {
    const token = expoToken();
    expo.onSend(() => [
      {
        status: 'error',
        message: 'The device is not registered',
        details: { error: 'DeviceNotRegistered' },
      },
    ]);

    const [result] = await transport.send([msg(token)]);

    expect(result.ok).toBe(false);
    expect(result.deviceNotRegistered).toBe(true);
  });

  it('does not set deviceNotRegistered for other error types', async () => {
    const token = expoToken();
    expo.onSend(() => [{ status: 'error', message: 'rate limited', details: { error: 'MessageRateExceeded' } }]);

    const [result] = await transport.send([msg(token)]);

    expect(result.ok).toBe(false);
    expect(result.deviceNotRegistered).toBeUndefined();
  });

  // ── completeness ───────────────────────────────────────────────────────────

  it('returns exactly one result per input message, in input order', async () => {
    const tokens = [expoToken(), 'bad-1', expoToken(), expoToken(), 'bad-2'];

    const results = await transport.send(tokens.map((token) => msg(token)));

    expect(results).toHaveLength(tokens.length);
    expect(results.map((r) => r.token)).toEqual(tokens);
  });

  it('is a no-op for an empty list and makes no network call', async () => {
    await expect(transport.send([])).resolves.toEqual([]);
    expect(expo.sentChunks).toHaveLength(0);
  });
});
