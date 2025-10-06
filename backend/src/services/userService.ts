import { prisma } from '../config/database';
import { User, UserRole } from '@prisma/client';

export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  role: UserRole;
  stats: {
    totalSessions: number;
    sessionsHosted: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  isOwnProfile: boolean;
}

export interface UpdateProfileData {
  name?: string;
  phone?: string;
  bio?: string;
  location?: string;
  skillLevel?: string;
  preferredPlayStyle?: string;
}

export interface UserSettings {
  privacySettings: {
    profileVisibility: 'public' | 'friends' | 'private';
    showEmail: boolean;
    showPhone: boolean;
    showStats: boolean;
    showLocation: boolean;
  };
  notificationSettings: {
    friendRequests: boolean;
    messages: boolean;
    sessionInvites: boolean;
    matchResults: boolean;
    achievements: boolean;
  };
}

export class UserService {
  /**
   * Get user profile with statistics
   */
  static async getUserProfile(userId: string, currentUserId: string): Promise<UserProfile | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            ownedSessions: true,
            sessionPlayers: true
          }
        }
      }
    });

    if (!user) {
      return null;
    }

    const isOwnProfile = currentUserId === userId;

    // Get aggregated statistics from MvpPlayer entries
    const playerStats = await prisma.mvpPlayer.aggregate({
      where: { deviceId: userId },
      _sum: {
        gamesPlayed: true,
        wins: true,
        losses: true
      },
      _avg: {
        winRate: true
      }
    });

    const profile: UserProfile = {
      ...user,
      email: isOwnProfile ? user.email : undefined,
      phone: isOwnProfile ? user.phone : undefined,
      stats: {
        totalSessions: user._count.ownedSessions + user._count.sessionPlayers,
        sessionsHosted: user._count.ownedSessions,
        gamesPlayed: playerStats._sum.gamesPlayed || 0,
        wins: playerStats._sum.wins || 0,
        losses: playerStats._sum.losses || 0,
        winRate: playerStats._avg.winRate || 0
      },
      isOwnProfile
    };

    return profile;
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId: string, data: UpdateProfileData): Promise<User> {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        phone: data.phone
        // TODO: Add bio, location, skillLevel, preferredPlayStyle fields to User model
      }
    });

    return updatedUser;
  }

  /**
   * Update user avatar
   */
  static async updateAvatar(userId: string, avatarUrl: string): Promise<User> {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl }
    });

    return updatedUser;
  }

  /**
   * Delete user avatar
   */
  static async deleteAvatar(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null }
    });
  }

  /**
   * Search users by name or email
   */
  static async searchUsers(query: string, limit: number = 20): Promise<Partial<User>[]> {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        role: true
      },
      take: Math.min(limit, 50)
    });

    return users;
  }

  /**
   * Get user settings
   * TODO: Implement UserSettings model
   */
  static async getUserSettings(userId: string): Promise<UserSettings> {
    // For now, return default settings
    // In the future, fetch from UserSettings table
    return {
      privacySettings: {
        profileVisibility: 'public',
        showEmail: false,
        showPhone: false,
        showStats: true,
        showLocation: true
      },
      notificationSettings: {
        friendRequests: true,
        messages: true,
        sessionInvites: true,
        matchResults: true,
        achievements: true
      }
    };
  }

  /**
   * Update user settings
   * TODO: Implement UserSettings model
   */
  static async updateUserSettings(userId: string, settings: Partial<UserSettings>): Promise<UserSettings> {
    // For now, just return the settings
    // In the future, save to UserSettings table
    const currentSettings = await this.getUserSettings(userId);
    
    return {
      privacySettings: {
        ...currentSettings.privacySettings,
        ...settings.privacySettings
      },
      notificationSettings: {
        ...currentSettings.notificationSettings,
        ...settings.notificationSettings
      }
    };
  }

  /**
   * Link MvpPlayer to User account
   * This helps migrate existing players to authenticated users
   */
  static async linkMvpPlayerToUser(userId: string, deviceId: string, playerName: string): Promise<void> {
    // Find all MvpPlayers with matching deviceId and name
    const players = await prisma.mvpPlayer.findMany({
      where: {
        deviceId: deviceId,
        name: playerName
      }
    });

    // Update their deviceId to userId for future reference
    await prisma.mvpPlayer.updateMany({
      where: {
        deviceId: deviceId,
        name: playerName
      },
      data: {
        deviceId: userId // Link to user ID
      }
    });

    console.log(`Linked ${players.length} MvpPlayer records to User ${userId}`);
  }

  /**
   * Get user by email
   */
  static async getUserByEmail(email: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { email }
    });
  }

  /**
   * Check if user exists
   */
  static async userExists(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });

    return !!user;
  }
}
