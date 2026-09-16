import { PrismaClient, Prisma } from '@prisma/client';
import { encodeCursor, decodeCursor } from '../utils/feedCursor';

const prisma = new PrismaClient();

/** Fixed size of the "recent public sessions" rail (bounded, non-paginated). */
const RECENT_SESSIONS_RAIL_LIMIT = 10;

/**
 * Build the "the sharer's governing privacy key is not `private`" relation
 * filter for one share type — mirroring the **write path** exactly.
 *
 * Read/write parity (Story 6.8 follow-up). The write path treats a missing key
 * as allowed: `privacyMiddleware.ts:23` and `shareEntity` both do
 * `settings[key] || 'public'`, and `getPrivacySettings` returns a full default
 * object when the column is `NULL`. So an **absent** governing key (or a `NULL`
 * `privacySettings`) means *public*. The naive single-key filter
 * `{ path: [key], not: 'private' }` does NOT honour that: Prisma compiles it to
 * a raw `<>` comparison, and SQL `NULL <> 'private'` is `NULL` (not `TRUE`), so
 * rows whose sharer never set the key were silently dropped — shares that the
 * write path had happily created.
 *
 * The second `OR` branch fixes it: `{ path: [key], equals: Prisma.DbNull }`
 * compiles to `(privacySettings #> ARRAY[key])::jsonb IS NULL`, which is `TRUE`
 * both when the key is absent and when the whole column is `NULL`. Together the
 * two branches are `(<key> <> 'private') OR (<key> IS NULL)`.
 *
 * Verified against the live database (Prisma 6.14 / PostgreSQL):
 *   absent key → visible,  key='public' → visible,
 *   key='private' → hidden,  NULL column → visible.
 * Explicit `'private'` stays hidden — the P0 guard is preserved.
 *
 * @param key - `session_share` | `stats_share` | `achievements_share`.
 * @returns A `MvpPlayerWhereInput` to use as the `sharer` relation filter.
 */
function privacyVisibilityFor(key: string): Prisma.MvpPlayerWhereInput {
  return {
    OR: [
      { privacySettings: { path: [key], not: 'private' } },
      { privacySettings: { path: [key], equals: Prisma.DbNull } },
    ],
  };
}

export interface ShareData {
  type: 'session' | 'match' | 'achievement';
  entityId: string;
  platform: 'twitter' | 'facebook' | 'whatsapp' | 'copy_link';
  message?: string;
}

export interface SocialConnectionData {
  provider: 'google' | 'facebook' | 'twitter';
  providerId: string;
  providerData?: any;
}

/** A single community-feed share row (explicit projection, Story 6.8 D1). */
export interface FeedShare {
  id: string;
  type: string;
  entityId: string;
  sharerId: string;
  platform: string;
  url: string;
  message: string | null;
  createdAt: Date;
  sharer: { id: string; name: string };
}

/** A single "recent public session" rail entry. */
export interface RecentSession {
  id: string;
  name: string;
  scheduledAt: Date;
  location: string | null;
  maxPlayers: number;
  skillLevel: string | null;
  _count: { players: number };
}

/** Shape returned by {@link SharingService.getCommunityFeed}. */
export interface CommunityFeedResult {
  shares: FeedShare[];
  sessions: RecentSession[];
  /** True collection size of the privacy-filtered set (not the page length). */
  total: number;
  /** Opaque keyset cursor for the next page, or `null` on the last page. */
  nextCursor: string | null;
}

export class SharingService {
  /**
   * Share an entity (session, match, achievement)
   */
  async shareEntity(sharerId: string, data: ShareData) {
    // Check privacy settings
    const sharer = await prisma.mvpPlayer.findUnique({
      where: { id: sharerId },
      select: { privacySettings: true }
    });

    if (!sharer) {
      throw new Error('Sharer not found');
    }

    // Check privacy settings for the share type
    const privacyKey = `${data.type}_share` as keyof typeof sharer.privacySettings;
    const privacySetting = sharer.privacySettings?.[privacyKey] || 'public';

    if (privacySetting === 'private' as any) {
      throw new Error('Sharing is disabled for this content type');
    }

    // Generate share URL
    const shareUrl = this.generateShareUrl(data.type, data.entityId);

    // Create share record
    const shareId = crypto.randomUUID();
    const share = await prisma.share.create({
      data: {
        id: shareId,
        type: data.type,
        entityId: data.entityId,
        sharerId,
        platform: data.platform,
        url: shareUrl,
        message: data.message
      },
      include: {
        sharer: {
          select: { id: true, name: true }
        }
      }
    });

    // Generate social preview data
    const preview = await this.generateSocialPreview(data.type, data.entityId);

    return {
      share,
      shareUrl,
      preview
    };
  }

  /**
   * Get the community feed.
   *
   * Story 6.8 (T01) hardening — three defects fixed in place:
   *  1. **Per-type privacy (P0 leak).** A share is visible iff *its own* type's
   *     privacy key is not `private`: `session_share` for `type='session'`,
   *     `stats_share` for `type='match'`, `achievements_share` for
   *     `type='achievement'`. The old single-key (`session_share`) filter leaked
   *     `match`/`achievement` shares whose sharer had set the matching key to
   *     `private`. Prisma JSON `path` filters cannot be parameterised by a
   *     column, so the fix is one `findMany` with an `OR` of three
   *     `{ type, sharer }` branches (no raw SQL — see design D2).
   *     **Read/write parity:** an *absent* governing key (or a `NULL`
   *     `privacySettings`) is treated as *public* — visible — matching the write
   *     path's `settings[key] || 'public'` default. Explicit `'private'` stays
   *     hidden. See `privacyVisibilityFor`.
   *  2. **Real `total`.** `prisma.share.count` over the *same* privacy filter
   *     (never the page length), so it is the true collection size and is stable
   *     across pages. The cursor window is pagination, not filtering, and is
   *     deliberately excluded from `total`.
   *  3. **Bounded query + additive keyset pagination.** `limit`/`offset` behave
   *     exactly as before for the pinned frontend consumer; an optional opaque
   *     `cursor` switches to keyset `(createdAt DESC, id DESC)` and ignores
   *     `offset`. The response gains `nextCursor`.
   *
   * The recent-sessions rail is a fixed, bounded rail; `offset` is deliberately
   * NOT applied to it (design Q5).
   *
   * @param userId - Optional viewer id (reserved; the feed is public today).
   * @param limit - Page size. Callers should bound this (route schema: [1,50]).
   * @param offset - Offset pagination; ignored when `cursor` is supplied.
   * @param cursor - Optional opaque keyset cursor from a previous `nextCursor`.
   */
  async getCommunityFeed(
    userId?: string,
    limit: number = 20,
    offset: number = 0,
    cursor?: string
  ): Promise<CommunityFeedResult> {
    // ── D2: per-type privacy filter (the P0 fix) ─────────────────────────────
    // Each branch pairs a share `type` with the privacy key that governs it.
    // `privacyVisibilityFor` also makes an ABSENT key visible, matching the write
    // path (read/write parity — see the helper's docstring).
    const privacyWhere: Prisma.ShareWhereInput = {
      OR: [
        { type: 'session', sharer: privacyVisibilityFor('session_share') },
        { type: 'match', sharer: privacyVisibilityFor('stats_share') },
        { type: 'achievement', sharer: privacyVisibilityFor('achievements_share') },
      ],
    };

    // ── D3: optional keyset window on top of the privacy filter ──────────────
    const decoded = decodeCursor(cursor);
    const pageWhere: Prisma.ShareWhereInput = decoded
      ? {
          AND: [
            privacyWhere,
            {
              // Row-tuple `(createdAt, id) < (cursorCreatedAt, cursorId)` under a
              // `(createdAt DESC, id DESC)` ordering.
              OR: [
                { createdAt: { lt: decoded.createdAt } },
                { createdAt: decoded.createdAt, id: { lt: decoded.id } },
              ],
            },
          ],
        }
      : privacyWhere;

    // Explicit projection (D1): every Share scalar + the sharer's id/name.
    const shares = await prisma.share.findMany({
      where: pageWhere,
      select: {
        id: true,
        type: true,
        entityId: true,
        sharerId: true,
        platform: true,
        url: true,
        message: true,
        createdAt: true,
        sharer: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(decoded ? {} : { skip: offset }),
    });

    // ── Real total: the true size of the privacy-filtered set (G3) ───────────
    const total = await prisma.share.count({ where: privacyWhere });

    // Recent public sessions — a fixed, bounded rail (offset not applied).
    const recentSessions = await prisma.mvpSession.findMany({
      where: {
        visibility: 'public',
        status: 'ACTIVE'
      },
      select: {
        id: true,
        name: true,
        scheduledAt: true,
        location: true,
        maxPlayers: true,
        skillLevel: true,
        _count: {
          select: { players: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: RECENT_SESSIONS_RAIL_LIMIT
    });

    // A full page implies there may be more; a partial page is the last page.
    const lastShare = shares[shares.length - 1];
    const nextCursor =
      lastShare && shares.length === limit
        ? encodeCursor(lastShare.createdAt, lastShare.id)
        : null;

    return {
      shares,
      sessions: recentSessions,
      total,
      nextCursor,
    };
  }

  /**
   * Connect social account
   */
  async connectSocialAccount(playerId: string, data: SocialConnectionData) {
    // Check if connection already exists
    const existing = await prisma.socialConnection.findUnique({
      where: {
        playerId_provider: {
          playerId,
          provider: data.provider
        }
      }
    });

    if (existing) {
      throw new Error('Social account already connected');
    }

    const connection = await prisma.socialConnection.create({
      data: {
        playerId,
        provider: data.provider,
        providerId: data.providerId,
        providerData: data.providerData
      }
    });

    return connection;
  }

  /**
   * Get player's social connections
   */
  async getSocialConnections(playerId: string) {
    const connections = await prisma.socialConnection.findMany({
      where: { playerId },
      select: {
        id: true,
        provider: true,
        connectedAt: true,
        lastUsedAt: true
      }
    });

    return connections;
  }

  /**
   * Update privacy settings
   */
  async updatePrivacySettings(playerId: string, settings: Record<string, string>) {
    const updatedPlayer = await prisma.mvpPlayer.update({
      where: { id: playerId },
      data: {
        privacySettings: settings
      },
      select: { privacySettings: true }
    });

    return updatedPlayer.privacySettings;
  }

  /**
   * Get privacy settings
   */
  async getPrivacySettings(playerId: string) {
    const player = await prisma.mvpPlayer.findUnique({
      where: { id: playerId },
      select: { privacySettings: true }
    });

    return player?.privacySettings || {
      session_share: 'public',
      stats_share: 'friends',
      achievements_share: 'public'
    };
  }

  /**
   * Generate share URL
   */
  private generateShareUrl(type: string, entityId: string): string {
    const baseUrl = process.env.FRONTEND_URL || 'https://badminton-group.com';
    return `${baseUrl}/share/${type}/${entityId}`;
  }

  /**
   * Generate social preview data
   */
  private async generateSocialPreview(type: string, entityId: string) {
    switch (type) {
      case 'session':
        const session = await prisma.mvpSession.findUnique({
          where: { id: entityId },
          select: {
            name: true,
            location: true,
            scheduledAt: true,
            skillLevel: true,
            _count: { select: { players: true } }
          }
        });

        if (!session) throw new Error('Session not found');

        return {
          title: session.name,
          description: `Join badminton session at ${session.location} on ${session.scheduledAt.toDateString()}`,
          image: `${process.env.FRONTEND_URL}/images/session-preview.jpg`,
          url: this.generateShareUrl(type, entityId)
        };

      case 'match':
        // Similar logic for match
        return {
          title: 'Badminton Match Result',
          description: 'Check out this exciting match result!',
          image: `${process.env.FRONTEND_URL}/images/match-preview.jpg`,
          url: this.generateShareUrl(type, entityId)
        };

      case 'achievement':
        // Similar logic for achievement
        return {
          title: 'Achievement Unlocked!',
          description: 'New badminton achievement unlocked',
          image: `${process.env.FRONTEND_URL}/images/achievement-preview.jpg`,
          url: this.generateShareUrl(type, entityId)
        };

      default:
        throw new Error('Invalid share type');
    }
  }

  /**
   * Get share statistics
   */
  async getShareStats(playerId: string) {
    const stats = await prisma.share.groupBy({
      by: ['platform', 'type'],
      where: { sharerId: playerId },
      _count: true
    });

    return stats;
  }
}

export const sharingService = new SharingService();