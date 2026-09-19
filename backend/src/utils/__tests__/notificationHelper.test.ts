/**
 * Story 6.9 — send-path integration tests (AC 2/3/5/16).
 *
 * These exercise the REAL `notificationHelper` send path against the REAL
 * Postgres schema (tokens + preferences rows are seeded and read back), while a
 * FAKE transport is injected so nothing touches the network. Assertions are made
 * on the fake's RECEIVED messages — the only thing that proves what would
 * actually have been delivered — not merely on return values.
 */

import { prisma } from '../../config/database';
import {
  notifyDevice,
  notifyPlayer,
  notifySessionSubscribers,
  setPushTransport,
} from '../notificationHelper';
import type { PushMessage, PushTicketResult, PushTransport } from '../../services/pushTransport';

jest.setTimeout(60000);

const RUN = `${Date.now()}-${process.pid}`;
const SHARE = `6-9-h-${RUN}`.slice(0, 16);

let sessionId: string;
const createdUserIds: string[] = [];
const createdPlayerIds: string[] = [];
const createdTokenIds: string[] = [];
const createdPreferenceIds: string[] = [];

/** Fake transport that records every message it is asked to send. */
class FakeTransport implements PushTransport {
  public batches: PushMessage[][] = [];

  /** Default: accept everything. Tests override to simulate failures. */
  public responder: (messages: PushMessage[]) => PushTicketResult[] = (messages) =>
    messages.map((message) => ({ token: message.to, ok: true }));

  async send(messages: PushMessage[]): Promise<PushTicketResult[]> {
    this.batches.push(messages);
    return this.responder(messages);
  }

  /** Every message the transport received, flattened across batches. */
  get messages(): PushMessage[] {
    return this.batches.flat();
  }

  /** The tokens (recipients) the transport received, in order. */
  get tokensSent(): string[] {
    return this.messages.map((message) => message.to);
  }
}

let fake: FakeTransport;

async function seedUser(): Promise<{ id: string }> {
  const user = await prisma.user.create({
    data: {
      name: `6.9 helper user ${RUN}`,
      email: `s69-helper-${RUN}-${createdUserIds.length}@example.test`,
      role: 'PLAYER',
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function seedPlayer(opts: {
  name: string;
  deviceId?: string | null;
  userId?: string | null;
}): Promise<string> {
  const player = await prisma.mvpPlayer.create({
    data: {
      sessionId,
      name: opts.name,
      deviceId: opts.deviceId ?? null,
      userId: opts.userId ?? null,
      status: 'ACTIVE',
    },
  });
  createdPlayerIds.push(player.id);
  return player.id;
}

async function seedToken(opts: {
  token: string;
  deviceId?: string | null;
  userId?: string | null;
  platform?: string;
  isActive?: boolean;
}): Promise<string> {
  const token = await prisma.pushToken.create({
    data: {
      token: opts.token,
      platform: opts.platform ?? 'ios',
      deviceId: opts.deviceId ?? null,
      userId: opts.userId ?? null,
      isActive: opts.isActive ?? true,
    },
  });
  createdTokenIds.push(token.id);
  return token.id;
}

async function seedPreferences(opts: {
  deviceId?: string | null;
  userId?: string | null;
  data?: {
    pushEnabled?: boolean;
    sessionReminders?: boolean;
    matchResults?: boolean;
    socialMessages?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
  };
}): Promise<string> {
  const preferences = await prisma.notificationPreferences.create({
    data: {
      deviceId: opts.deviceId ?? null,
      userId: opts.userId ?? null,
      ...(opts.data ?? {}),
    },
  });
  createdPreferenceIds.push(preferences.id);
  return preferences.id;
}

beforeAll(async () => {
  const session = await prisma.mvpSession.create({
    data: {
      name: `6.9 helper session ${RUN}`,
      ownerName: `6.9 helper owner ${RUN}`,
      scheduledAt: new Date(Date.now() + 86400000),
      shareCode: SHARE,
    },
  });
  sessionId = session.id;
});

beforeEach(() => {
  fake = new FakeTransport();
  setPushTransport(fake);
});

afterEach(async () => {
  // Restore the real transport so nothing leaks between tests.
  setPushTransport(null);

  if (createdTokenIds.length) {
    await prisma.pushToken.deleteMany({ where: { id: { in: createdTokenIds } } });
    createdTokenIds.length = 0;
  }
  if (createdPreferenceIds.length) {
    await prisma.notificationPreferences.deleteMany({ where: { id: { in: createdPreferenceIds } } });
    createdPreferenceIds.length = 0;
  }
  if (createdPlayerIds.length) {
    await prisma.mvpPlayer.deleteMany({ where: { id: { in: createdPlayerIds } } });
    createdPlayerIds.length = 0;
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

afterAll(async () => {
  await prisma.mvpSession.deleteMany({ where: { id: sessionId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('notificationHelper — AC 3 preference suppression', () => {
  it('suppresses when the master push toggle is off', async () => {
    const device = `dev-pushoff-${RUN}`;
    await seedPlayer({ name: `p-pushoff-${RUN}`, deviceId: device });
    await seedToken({ token: `ExpoPushToken[pushoff-${RUN}]`, deviceId: device });
    await seedPreferences({ deviceId: device, data: { pushEnabled: false } });

    const count = await notifySessionSubscribers(sessionId, {
      title: 'T',
      body: 'B',
      type: 'SESSION_REMINDER',
    });

    expect(fake.tokensSent).toEqual([]);
    expect(count).toBe(0);
  });

  it("suppresses when the type's own preference column is off", async () => {
    const device = `dev-typeoff-${RUN}`;
    await seedPlayer({ name: `p-typeoff-${RUN}`, deviceId: device });
    await seedToken({ token: `ExpoPushToken[typeoff-${RUN}]`, deviceId: device });
    await seedPreferences({ deviceId: device, data: { sessionReminders: false } });

    await notifySessionSubscribers(sessionId, { title: 'T', body: 'B', type: 'SESSION_REMINDER' });

    expect(fake.tokensSent).toEqual([]);
  });

  it('suppresses inside quiet hours', async () => {
    const device = `dev-quiet-${RUN}`;
    await seedPlayer({ name: `p-quiet-${RUN}`, deviceId: device });
    await seedToken({ token: `ExpoPushToken[quiet-${RUN}]`, deviceId: device });
    // A window covering every minute of the day guarantees "inside quiet hours".
    await seedPreferences({
      deviceId: device,
      data: { quietHoursStart: '00:00', quietHoursEnd: '23:59' },
    });

    await notifySessionSubscribers(sessionId, { title: 'T', body: 'B', type: 'SESSION_REMINDER' });

    expect(fake.tokensSent).toEqual([]);
  });

  it('delivers when nothing suppresses', async () => {
    const device = `dev-allow-${RUN}`;
    await seedPlayer({ name: `p-allow-${RUN}`, deviceId: device });
    await seedToken({ token: `ExpoPushToken[allow-${RUN}]`, deviceId: device });
    await seedPreferences({ deviceId: device, data: { pushEnabled: true, sessionReminders: true } });

    const count = await notifySessionSubscribers(sessionId, {
      title: 'T',
      body: 'B',
      type: 'SESSION_REMINDER',
    });

    expect(fake.tokensSent).toEqual([`ExpoPushToken[allow-${RUN}]`]);
    expect(count).toBe(1);
  });
});

describe('notificationHelper — AC 5 guest allow-list (device-only tokens)', () => {
  it('delivers an allow-listed type to a device-only token', async () => {
    const device = `dev-guest-allow-${RUN}`;
    await seedPlayer({ name: `p-guest-allow-${RUN}`, deviceId: device });
    await seedToken({ token: `ExpoPushToken[guest-allow-${RUN}]`, deviceId: device });

    const count = await notifySessionSubscribers(sessionId, {
      title: 'T',
      body: 'B',
      type: 'SCORE_RECORDED',
    });

    expect(fake.tokensSent).toEqual([`ExpoPushToken[guest-allow-${RUN}]`]);
    expect(count).toBe(1);
  });

  it('does NOT deliver a denied (social) type to a device-only token', async () => {
    const device = `dev-guest-deny-${RUN}`;
    await seedPlayer({ name: `p-guest-deny-${RUN}`, deviceId: device });
    await seedToken({ token: `ExpoPushToken[guest-deny-${RUN}]`, deviceId: device });

    await notifySessionSubscribers(sessionId, { title: 'T', body: 'B', type: 'FRIEND_REQUEST' });

    expect(fake.tokensSent).toEqual([]);
  });

  it('does NOT deliver an unknown/unmapped type to a device-only token (fails closed)', async () => {
    const device = `dev-guest-unknown-${RUN}`;
    await seedPlayer({ name: `p-guest-unknown-${RUN}`, deviceId: device });
    await seedToken({ token: `ExpoPushToken[guest-unknown-${RUN}]`, deviceId: device });

    await notifySessionSubscribers(sessionId, {
      title: 'T',
      body: 'B',
      type: 'BRAND_NEW_UNMAPPED_TYPE',
    });

    expect(fake.tokensSent).toEqual([]);
  });

  it('delivers a denied-for-guest type to an account (userId) token', async () => {
    const user = await seedUser();
    await seedPlayer({ name: `p-account-${RUN}`, userId: user.id });
    await seedToken({ token: `ExpoPushToken[account-${RUN}]`, userId: user.id });

    await notifySessionSubscribers(sessionId, { title: 'T', body: 'B', type: 'FRIEND_REQUEST' });

    expect(fake.tokensSent).toEqual([`ExpoPushToken[account-${RUN}]`]);
  });
});

describe('notificationHelper — AC 2 token lifecycle', () => {
  it('deactivates a token when the transport reports DeviceNotRegistered', async () => {
    const device = `dev-dnr-${RUN}`;
    await seedPlayer({ name: `p-dnr-${RUN}`, deviceId: device });
    const tokenId = await seedToken({ token: `ExpoPushToken[dnr-${RUN}]`, deviceId: device });

    fake.responder = (messages) =>
      messages.map((message) => ({
        token: message.to,
        ok: false,
        error: 'The device is not registered',
        deviceNotRegistered: true,
      }));

    await notifySessionSubscribers(sessionId, { title: 'T', body: 'B', type: 'SCORE_RECORDED' });

    const row = await prisma.pushToken.findUnique({ where: { id: tokenId } });
    expect(row).not.toBeNull();
    expect(row!.isActive).toBe(false);
  });

  it('does NOT deactivate a token that was merely skipped', async () => {
    const device = `dev-skip-${RUN}`;
    await seedPlayer({ name: `p-skip-${RUN}`, deviceId: device });
    const tokenId = await seedToken({ token: `ExpoPushToken[skip-${RUN}]`, deviceId: device });

    fake.responder = (messages) =>
      messages.map((message) => ({
        token: message.to,
        ok: false,
        error: 'Not an Expo push token (skipped)',
        skipped: true,
      }));

    await notifySessionSubscribers(sessionId, { title: 'T', body: 'B', type: 'SCORE_RECORDED' });

    const row = await prisma.pushToken.findUnique({ where: { id: tokenId } });
    expect(row).not.toBeNull();
    expect(row!.isActive).toBe(true);
  });

  it('does not throw when the transport itself throws (FIX-7 discipline)', async () => {
    const device = `dev-throw-${RUN}`;
    await seedPlayer({ name: `p-throw-${RUN}`, deviceId: device });
    await seedToken({ token: `ExpoPushToken[throw-${RUN}]`, deviceId: device });

    fake.responder = () => {
      throw new Error('transport exploded');
    };

    await expect(
      notifySessionSubscribers(sessionId, { title: 'T', body: 'B', type: 'SCORE_RECORDED' }),
    ).resolves.toBe(0);
  });
});

describe('notificationHelper — AC 16 payload hygiene', () => {
  it('sends only the caller-supplied fields and never the token in the payload', async () => {
    const device = `dev-ac16-${RUN}`;
    const token = `ExpoPushToken[ac16-${RUN}]`;
    await seedPlayer({ name: `p-ac16-${RUN}`, deviceId: device });
    await seedToken({ token, deviceId: device });

    await notifySessionSubscribers(sessionId, {
      title: 'T',
      body: 'B',
      type: 'SCORE_RECORDED',
      data: { sessionId },
    });

    expect(fake.messages).toHaveLength(1);
    expect(fake.messages[0]).toEqual({ to: token, title: 'T', body: 'B', data: { sessionId } });
    // The message must carry no identity or token material beyond the address.
    expect(fake.messages[0]).not.toHaveProperty('userId');
    expect(fake.messages[0].data).not.toHaveProperty('token');
  });
});

describe('notificationHelper — notifyDevice (account identity)', () => {
  it('delivers to an account token and honours suppression', async () => {
    const user = await seedUser();
    await seedToken({ token: `ExpoPushToken[dev-acct-${RUN}]`, userId: user.id });

    await expect(
      notifyDevice(user.id, { title: 'T', body: 'B', type: 'FRIEND_REQUEST' }),
    ).resolves.toBe(true);
    expect(fake.tokensSent).toEqual([`ExpoPushToken[dev-acct-${RUN}]`]);

    // Now turn the master toggle off for the account and re-send: suppressed.
    await seedPreferences({ userId: user.id, data: { pushEnabled: false } });
    fake.batches = [];

    await expect(
      notifyDevice(user.id, { title: 'T', body: 'B', type: 'FRIEND_REQUEST' }),
    ).resolves.toBe(false);
    expect(fake.tokensSent).toEqual([]);
  });
});

describe('notificationHelper — notifyPlayer (session-scoped)', () => {
  it('applies the guest allow-list for a device-only player', async () => {
    const device = `dev-np-${RUN}`;
    const name = `p-np-${RUN}`;
    await seedPlayer({ name, deviceId: device });
    await seedToken({ token: `ExpoPushToken[np-${RUN}]`, deviceId: device });

    await expect(notifyPlayer(sessionId, name, { title: 'T', body: 'B', type: 'NEXT_UP' })).resolves.toBe(true);
    expect(fake.tokensSent).toEqual([`ExpoPushToken[np-${RUN}]`]);

    fake.batches = [];
    await expect(
      notifyPlayer(sessionId, name, { title: 'T', body: 'B', type: 'NEW_MESSAGE' }),
    ).resolves.toBe(false);
    expect(fake.tokensSent).toEqual([]);
  });
});
