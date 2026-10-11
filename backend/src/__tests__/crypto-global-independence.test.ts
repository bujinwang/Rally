/**
 * Hermetic Node 18 reproduction — runtime guard.
 *
 * The bug
 * -------
 * Node 18 (the base image in `backend/Dockerfile`, both stages:
 * `FROM node:18-alpine`) has **no** `globalThis.crypto`. A service that calls
 * `crypto.randomUUID()` against that global therefore throws
 * `ReferenceError: crypto is not defined` in production, while passing on
 * Node 20+ where the global exists. That is a portability bug, not a test
 * artifact.
 *
 * Why a runtime guard
 * -------------------
 * We cannot install Node 18 locally, so we reproduce its condition hermetically
 * on whatever Node the suite runs on: we **delete `globalThis.crypto`**, then
 * exercise the affected code path. If a service depends on the global it throws;
 * if it imports the built-in module (the fix) it works — and we additionally
 * assert the imported module's `randomUUID` was the thing that ran.
 *
 * On Node 18 itself the removal is a no-op (the property is already absent) and
 * the tests still hold, so this file is green on the whole CI matrix.
 */
const mockPrisma: Record<string, any> = {
  $queryRaw: jest.fn(async () => [] as unknown[]),
  mvpPlayer: { findUnique: jest.fn(async () => ({ privacySettings: null })) },
  mvpSession: { findUnique: jest.fn(async () => null) },
  share: { create: jest.fn(async () => ({})) },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(function (this: any) {
    Object.assign(this, mockPrisma);
    return this;
  }),
  Prisma: {},
}));

/** The real CommonJS crypto module — the very object the services import. */
const nodeCrypto: typeof import('crypto') = require('crypto');

/** Original descriptor of the (accessor) `globalThis.crypto`, captured once. */
const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

/** Replace `globalThis.crypto` with an explicit `undefined` (Node 18's state). */
function removeGlobalCrypto(): void {
  Object.defineProperty(globalThis, 'crypto', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

/** Restore the original accessor (or delete the property if there was none). */
function restoreGlobalCrypto(): void {
  if (originalCryptoDescriptor) {
    Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
  } else {
    delete (globalThis as { crypto?: unknown }).crypto;
  }
}

/**
 * Run `run()` with `globalThis.crypto` removed, then assert the path did not
 * depend on it:
 *   1. the imported crypto module's `randomUUID` must have been invoked
 *      (positive proof the fix is what ran — if the global had been used, the
 *      call would have thrown before reaching it, leaving 0 calls), and
 *   2. any error thrown must be a downstream domain error — never a
 *      `ReferenceError`, and never one mentioning crypto.
 */
async function expectIndependentOfGlobalCrypto(run: () => Promise<unknown>): Promise<void> {
  const spy = jest.spyOn(nodeCrypto, 'randomUUID');
  removeGlobalCrypto();
  let caught: unknown;
  try {
    await run();
  } catch (err) {
    caught = err;
  } finally {
    restoreGlobalCrypto();
  }
  const calls = spy.mock.calls.length;
  spy.mockRestore();

  expect(calls).toBeGreaterThan(0);
  if (caught !== undefined) {
    expect(caught).not.toBeInstanceOf(ReferenceError);
    const message = caught instanceof Error ? caught.message : String(caught);
    expect(message).not.toMatch(/crypto/i);
  }
}

describe('services are independent of the WebCrypto global (Node 18 reproduction)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$queryRaw.mockReset();
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.mvpPlayer.findUnique.mockReset();
    mockPrisma.mvpPlayer.findUnique.mockResolvedValue({ privacySettings: null });
    mockPrisma.mvpSession.findUnique.mockReset();
    mockPrisma.mvpSession.findUnique.mockResolvedValue(null);
    mockPrisma.share.create.mockReset();
    mockPrisma.share.create.mockResolvedValue({});
  });

  it('the reproduction is real: the global is genuinely gone while we run', () => {
    const before = (globalThis as { crypto?: unknown }).crypto;
    removeGlobalCrypto();
    // This is the exact Node 18 condition. If it ever stops holding, the tests
    // below would pass vacuously, so we assert it explicitly.
    expect((globalThis as { crypto?: unknown }).crypto).toBeUndefined();
    restoreGlobalCrypto();
    expect((globalThis as { crypto?: unknown }).crypto).toBe(before);
  });

  it('messagingService.createThread — thread id (line 35)', async () => {
    const { MessagingService } = require('../services/messagingService');
    const service = new MessagingService();
    await expectIndependentOfGlobalCrypto(() =>
      service.createThread({ participants: ['a', 'b'] }),
    );
  });

  it('messagingService.sendMessage — message id (line 64)', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([{ id: 't1' }]) // thread exists
      .mockResolvedValueOnce(undefined) // INSERT message
      .mockResolvedValueOnce(undefined) // UPDATE thread
      .mockResolvedValueOnce([{ id: 'm1', threadId: 't1', senderId: 'a', content: 'hi', messageType: 'TEXT', sentAt: new Date(), isRead: false, sender_name: 'Alice' }]);
    const { MessagingService } = require('../services/messagingService');
    const service = new MessagingService();
    await expectIndependentOfGlobalCrypto(() =>
      service.sendMessage({ threadId: 't1', senderId: 'a', content: 'hi' }),
    );
  });

  it('friendsService.sendFriendRequest — request id (line 45)', async () => {
    const { FriendsService } = require('../services/friendsService');
    const service = new FriendsService();
    await expectIndependentOfGlobalCrypto(() =>
      service.sendFriendRequest({ senderId: 'u1', receiverId: 'u2' }),
    );
  });

  it('friendsService.respondToFriendRequest — friendship id (line 96)', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'r1', sender_id: 'u1', receiver_id: 'u2' }]) // pending request
      .mockResolvedValueOnce(undefined) // UPDATE status
      .mockResolvedValueOnce(undefined) // INSERT friendship
      .mockResolvedValueOnce([{ id: 'r1', sender_id: 'u1', receiver_id: 'u2', message: null, status: 'ACCEPTED', sent_at: new Date(), responded_at: new Date(), sender_name: 'Alice', receiver_name: 'Bob' }]);
    const { FriendsService } = require('../services/friendsService');
    const service = new FriendsService();
    await expectIndependentOfGlobalCrypto(() =>
      service.respondToFriendRequest('r1', 'u1', 'u2', true),
    );
  });

  it('friendsService.blockUser — friendship id (line 233)', async () => {
    const { FriendsService } = require('../services/friendsService');
    const service = new FriendsService();
    await expectIndependentOfGlobalCrypto(() => service.blockUser('u1', 'u2'));
  });

  it('challengesService.createChallenge — challenge id (line 43)', async () => {
    const { ChallengesService } = require('../services/challengesService');
    const service = new ChallengesService();
    await expectIndependentOfGlobalCrypto(() =>
      service.createChallenge({ challengerId: 'u1', challengedId: 'u2' }),
    );
  });

  it('achievementService.createAchievement — achievement id (line 503)', async () => {
    const { AchievementService } = require('../services/achievementService');
    const service = new AchievementService();
    // Reaches the randomUUID at line 503; the subsequent lookup legitimately
    // throws "Achievement not found" against the empty stub, which the helper
    // tolerates (it is a domain error, not a missing-global error).
    await expectIndependentOfGlobalCrypto(() =>
      service.createAchievement({
        name: 'First Win',
        description: 'Win your first match',
        category: 'MILESTONE',
        triggerType: 'MATCH_WON',
        triggerValue: { count: 1 },
      } as any),
    );
  });

  it('achievementService.createBadge — badge id (line 517)', async () => {
    const { AchievementService } = require('../services/achievementService');
    const service = new AchievementService();
    await expectIndependentOfGlobalCrypto(() =>
      service.createBadge({
        name: 'Champion',
        description: 'Reach the top',
        icon: 'trophy',
      } as any),
    );
  });

  it('sharingService.shareEntity — share id (line 170)', async () => {
    const { SharingService } = require('../services/sharingService');
    const service = new SharingService();
    // type 'match' → privacy key stats_share defaults to 'friends' (not
    // 'private', so the share proceeds) and generateSocialPreview('match')
    // returns a static object without hitting Prisma.
    await expectIndependentOfGlobalCrypto(() =>
      service.shareEntity('sharer-1', { type: 'match', entityId: 'e1', platform: 'web' } as any),
    );
  });
});
