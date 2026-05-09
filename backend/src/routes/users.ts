import { Router, Request } from 'express';
import { prisma } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { upload, deleteFile } from '../utils/fileUpload';
import { validate } from '../utils/validation';
import Joi from 'joi';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Validation schemas
const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(100),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
  bio: Joi.string().max(500).allow('').allow(null),
  location: Joi.string().max(200).allow('').allow(null),
  skillLevel: Joi.string().valid('beginner', 'intermediate', 'advanced', 'professional').allow(null),
  preferredPlayStyle: Joi.string().max(100).allow('').allow(null)
});

const updateSettingsSchema = Joi.object({
  privacySettings: Joi.object({
    profileVisibility: Joi.string().valid('public', 'friends', 'private'),
    showEmail: Joi.boolean(),
    showPhone: Joi.boolean(),
    showStats: Joi.boolean(),
    showLocation: Joi.boolean()
  }),
  notificationSettings: Joi.object({
    friendRequests: Joi.boolean(),
    messages: Joi.boolean(),
    sessionInvites: Joi.boolean(),
    matchResults: Joi.boolean(),
    achievements: Joi.boolean()
  })
});

// Get user profile
router.get('/users/:userId/profile', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user?.id;

    // Fetch user with stats
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
        // Privacy-aware fields
        _count: {
          select: {
            ownedSessions: true,
            sessionPlayers: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check privacy settings
    const isOwnProfile = currentUserId === userId;

    // Fetch user's privacy settings
    const userSettingsRecord = await prisma.userSettings.findUnique({
      where: { userId }
    });

    const profileVisibility = userSettingsRecord?.profileVisibility || 'public';

    if (!isOwnProfile) {
      if (profileVisibility === 'private') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'This profile is private'
          },
          timestamp: new Date().toISOString()
        });
      }

      if (profileVisibility === 'friends') {
        // Check if current user is friends with the profile user
        const friendship = await prisma.friend.findFirst({
          where: {
            OR: [
              { playerId: currentUserId, friendId: userId },
              { playerId: userId, friendId: currentUserId }
            ],
            status: 'ACCEPTED'
          }
        });

        if (!friendship) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You must be friends to view this profile'
            },
            timestamp: new Date().toISOString()
          });
        }
      }
    }
    
    // Get aggregated statistics from MvpPlayer entries
    const playerStats = await prisma.mvpPlayer.aggregate({
      where: { deviceId: user.id }, // Assuming deviceId links to userId
      _sum: {
        gamesPlayed: true,
        wins: true,
        losses: true,
        matchesPlayed: true,
        matchWins: true,
        matchLosses: true
      },
      _avg: {
        winRate: true
      }
    });

    const profile = {
      ...user,
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

    // Hide sensitive info if not own profile
    if (!isOwnProfile) {
      const { email, phone, ...publicProfile } = profile;
      return res.json({
        success: true,
        data: { profile: publicProfile },
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: { profile },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch profile'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Update user profile
router.put('/users/:userId/profile', authenticateToken, validate(updateProfileSchema), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user?.id;

    // Check authorization
    if (currentUserId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only update your own profile'
        },
        timestamp: new Date().toISOString()
      });
    }

    const { name, phone, bio, location, skillLevel, preferredPlayStyle } = req.body;

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name || undefined,
        phone: phone || undefined,
        bio: bio || undefined,
        location: location || undefined,
        skillLevel: skillLevel || undefined,
        preferredPlayStyle: preferredPlayStyle || undefined
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        role: true,
        updatedAt: true
      }
    });

    res.json({
      success: true,
      data: { user: updatedUser },
      message: 'Profile updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update profile'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Upload user avatar
router.post('/users/:userId/avatar', authenticateToken, upload.single('avatar'), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user?.id;

    // Check authorization
    if (currentUserId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only update your own avatar'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No avatar file provided'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Get current user to delete old avatar
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true }
    });

    // Delete old avatar if exists
    if (user?.avatarUrl) {
      await deleteFile(user.avatarUrl);
    }

    // Update user with new avatar URL
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: {
        id: true,
        name: true,
        avatarUrl: true
      }
    });

    res.json({
      success: true,
      data: {
        user: updatedUser,
        avatarUrl
      },
      message: 'Avatar uploaded successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to upload avatar'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Delete user avatar
router.delete('/users/:userId/avatar', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user?.id;

    // Check authorization
    if (currentUserId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only delete your own avatar'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true }
    });

    if (!user?.avatarUrl) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No avatar to delete'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Delete avatar file
    await deleteFile(user.avatarUrl);

    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null }
    });

    res.json({
      success: true,
      message: 'Avatar deleted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Delete avatar error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete avatar'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Get user settings
router.get('/users/:userId/settings', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user?.id;

    // Check authorization
    if (currentUserId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only view your own settings'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Fetch from UserSettings table
    const userSettingsRecord = await prisma.userSettings.findUnique({
      where: { userId }
    });

    const settings = userSettingsRecord
      ? {
          privacySettings: {
            profileVisibility: userSettingsRecord.profileVisibility,
            showEmail: userSettingsRecord.showEmail,
            showPhone: userSettingsRecord.showPhone,
            showStats: userSettingsRecord.showStats,
            showLocation: userSettingsRecord.showLocation
          },
          notificationSettings: {
            friendRequests: userSettingsRecord.friendRequests,
            messages: userSettingsRecord.messages,
            sessionInvites: userSettingsRecord.sessionInvites,
            matchResults: userSettingsRecord.matchResults,
            achievements: userSettingsRecord.achievements
          }
        }
      : {
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

    res.json({
      success: true,
      data: { settings },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch settings'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Update user settings
router.put('/users/:userId/settings', authenticateToken, validate(updateSettingsSchema), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user?.id;

    // Check authorization
    if (currentUserId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only update your own settings'
        },
        timestamp: new Date().toISOString()
      });
    }

    const { privacySettings, notificationSettings } = req.body;

    // Save to UserSettings table using upsert
    await prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        ...(privacySettings ? {
          profileVisibility: privacySettings.profileVisibility,
          showEmail: privacySettings.showEmail,
          showPhone: privacySettings.showPhone,
          showStats: privacySettings.showStats,
          showLocation: privacySettings.showLocation
        } : {}),
        ...(notificationSettings ? {
          friendRequests: notificationSettings.friendRequests,
          messages: notificationSettings.messages,
          sessionInvites: notificationSettings.sessionInvites,
          matchResults: notificationSettings.matchResults,
          achievements: notificationSettings.achievements
        } : {})
      },
      update: {
        ...(privacySettings ? {
          profileVisibility: privacySettings.profileVisibility,
          showEmail: privacySettings.showEmail,
          showPhone: privacySettings.showPhone,
          showStats: privacySettings.showStats,
          showLocation: privacySettings.showLocation
        } : {}),
        ...(notificationSettings ? {
          friendRequests: notificationSettings.friendRequests,
          messages: notificationSettings.messages,
          sessionInvites: notificationSettings.sessionInvites,
          matchResults: notificationSettings.matchResults,
          achievements: notificationSettings.achievements
        } : {})
      }
    });

    const settings = {
      privacySettings: privacySettings || {},
      notificationSettings: notificationSettings || {}
    };

    res.json({
      success: true,
      data: { settings },
      message: 'Settings updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update settings'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Search users
router.get('/users/search', authenticateToken, async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Search query is required'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Search users by name or email
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        role: true
      },
      take: Math.min(Number(limit), 50)
    });

    res.json({
      success: true,
      data: { users, count: users.length },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to search users'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
