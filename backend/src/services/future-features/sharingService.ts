import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

    if (privacySetting === 'private') {
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
   * Get community feed
   */
  async getCommunityFeed(userId?: string, limit: number = 20, offset: number = 0) {
    // Get recent shares with privacy filtering
    const shares = await prisma.share.findMany({
      where: {
        sharer: {
          privacySettings: {
            path: ['session_share'],
            not: 'private'
          }
        }
      },
      include: {
        sharer: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });

    // Get recent sessions for community feed
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
      take: 10
    });

    return {
      shares,
      sessions: recentSessions,
      total: shares.length
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