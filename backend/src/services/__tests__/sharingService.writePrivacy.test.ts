/**
 * Story 6.8 — T01: write-path privacy guard (`shareEntity`).
 *
 * Regression pin for a pre-existing defect: both write-side guards derived the
 * privacy key as `` `${type}_share` ``, which yields `match_share` /
 * `achievement_share` — keys that do NOT exist. The lookup then returned
 * `undefined` and fell back to allowed, so `stats_share: 'private'` did not
 * block a `match` share. The guard must use the shared type→key mapping
 * (`PRIVACY_KEY_FOR_TYPE`), so it is pinned per-type, not just for `session`.
 *
 * Semantics under test (unchanged): only `'private'` blocks. `'friends'` and an
 * absent key are ALLOWED to create — the read path is what hides `'friends'`.
 */

const mockPlayerFindUnique = jest.fn();
const mockShareCreate = jest.fn();
const mockSessionFindUnique = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    mvpPlayer: { findUnique: mockPlayerFindUnique },
    share: { create: mockShareCreate },
    mvpSession: { findUnique: mockSessionFindUnique },
  })),
  Prisma: { DbNull: {}, JsonNull: {}, AnyNull: {} },
}));

import { sharingService } from '../sharingService';

const PRIVATE_MESSAGE = 'Sharing is disabled for this content type';

const shareDataFor = (type: 'session' | 'match' | 'achievement') => ({
  type,
  entityId: `entity-${type}`,
  platform: 'copy_link' as const,
});

describe('SharingService.shareEntity — write-path privacy guard (Story 6.8 T01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShareCreate.mockResolvedValue({
      id: 'share-1',
      type: 'session',
      entityId: 'entity',
      sharerId: 'p1',
      platform: 'copy_link',
      url: 'https://example.test/share',
      message: null,
      createdAt: new Date(),
      sharer: { id: 'p1', name: 'Player' },
    });
    // Only the `session` preview path hits the DB; match/achievement previews are static.
    mockSessionFindUnique.mockResolvedValue({
      name: 'Monday Badminton',
      location: 'Community Center',
      scheduledAt: new Date('2026-01-01T00:00:00Z'),
      skillLevel: '5',
      _count: { players: 0 },
    });
  });

  describe.each([
    ['session', 'session_share'],
    ['match', 'stats_share'],
    ['achievement', 'achievements_share'],
  ] as const)('%s shares (governing key: %s)', (type, key) => {
    it(`THROWS when ${key}='private'`, async () => {
      mockPlayerFindUnique.mockResolvedValue({ privacySettings: { [key]: 'private' } });

      await expect(sharingService.shareEntity('p1', shareDataFor(type))).rejects.toThrow(
        PRIVATE_MESSAGE,
      );
      // Blocked means blocked: nothing was persisted.
      expect(mockShareCreate).not.toHaveBeenCalled();
    });

    it(`allows when ${key}='friends' (read path hides it, write path does not)`, async () => {
      mockPlayerFindUnique.mockResolvedValue({ privacySettings: { [key]: 'friends' } });

      await expect(sharingService.shareEntity('p1', shareDataFor(type))).resolves.toBeDefined();
      expect(mockShareCreate).toHaveBeenCalledTimes(1);
    });

    it(`allows when ${key} is absent (falls back to the key's own default)`, async () => {
      mockPlayerFindUnique.mockResolvedValue({ privacySettings: {} });

      await expect(sharingService.shareEntity('p1', shareDataFor(type))).resolves.toBeDefined();
      expect(mockShareCreate).toHaveBeenCalledTimes(1);
    });

    it(`allows when privacySettings is NULL (default is never 'private')`, async () => {
      mockPlayerFindUnique.mockResolvedValue({ privacySettings: null });

      await expect(sharingService.shareEntity('p1', shareDataFor(type))).resolves.toBeDefined();
      expect(mockShareCreate).toHaveBeenCalledTimes(1);
    });
  });

  it("reads the REAL key for 'match' — `stats_share`, not `match_share`", async () => {
    // The old `${type}_share` produced `match_share`; setting THAT to private must
    // have no effect, while `stats_share: 'private'` must block. This documents
    // which key the guard actually consults.
    mockPlayerFindUnique.mockResolvedValue({ privacySettings: { match_share: 'private' } });
    await expect(sharingService.shareEntity('p1', shareDataFor('match'))).resolves.toBeDefined();

    jest.clearAllMocks();
    mockShareCreate.mockResolvedValue({ id: 'share-2', sharer: { id: 'p1', name: 'Player' } });
    mockPlayerFindUnique.mockResolvedValue({ privacySettings: { stats_share: 'private' } });
    await expect(sharingService.shareEntity('p1', shareDataFor('match'))).rejects.toThrow(
      PRIVATE_MESSAGE,
    );
  });

  it("reads the REAL key for 'achievement' — `achievements_share`, not `achievement_share`", async () => {
    mockPlayerFindUnique.mockResolvedValue({ privacySettings: { achievement_share: 'private' } });
    await expect(
      sharingService.shareEntity('p1', shareDataFor('achievement')),
    ).resolves.toBeDefined();

    jest.clearAllMocks();
    mockShareCreate.mockResolvedValue({ id: 'share-3', sharer: { id: 'p1', name: 'Player' } });
    mockPlayerFindUnique.mockResolvedValue({ privacySettings: { achievements_share: 'private' } });
    await expect(sharingService.shareEntity('p1', shareDataFor('achievement'))).rejects.toThrow(
      PRIVATE_MESSAGE,
    );
  });

  it('throws when the sharer does not exist', async () => {
    mockPlayerFindUnique.mockResolvedValue(null);

    await expect(sharingService.shareEntity('ghost', shareDataFor('session'))).rejects.toThrow(
      'Sharer not found',
    );
    expect(mockShareCreate).not.toHaveBeenCalled();
  });
});
