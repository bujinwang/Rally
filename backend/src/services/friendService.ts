import { prisma } from '../config/database';
import { FriendStatus, FriendRequestStatus } from '@prisma/client';

export interface SendFriendRequestData {
  senderId: string;
  receiverId: string;
  message?: string;
}

export interface FriendRequestWithDetails {
  id: string;
  senderId: string;
  receiverId: string;
  message: string | null;
  status: FriendRequestStatus;
  sentAt: Date;
  respondedAt: Date | null;
  sender: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  receiver: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export interface FriendWithDetails {
  id: string;
  playerId: string;
  friendId: string;
  status: FriendStatus;
  requestedAt: Date;
  acceptedAt: Date | null;
  friend: {
    id: string;
    name: string;
    avatarUrl: string | null;
    status: string;
  };
}

export interface FriendStats {
  totalFriends: number;
  pendingRequests: number;
  sentRequests: number;
  blockedUsers: number;
}

export class FriendService {
  /**
   * Send a friend request
   */
  static async sendFriendRequest(data: SendFriendRequestData): Promise<FriendRequestWithDetails> {
    const { senderId, receiverId, message } = data;

    // Look up players by ID (supports both MvpSession deviceId-based and User auth-based identity)
    const sender = await prisma.mvpPlayer.findUnique({ where: { id: senderId } });
    const receiver = await prisma.mvpPlayer.findUnique({ where: { id: receiverId } });

    if (!sender || !receiver) {
      throw new Error('Sender or receiver not found');
    }

    // Check if already friends
    const existingFriendship = await prisma.friend.findFirst({
      where: {
        OR: [
          { playerId: senderId, friendId: receiverId },
          { playerId: receiverId, friendId: senderId }
        ]
      }
    });

    if (existingFriendship) {
      if (existingFriendship.status === FriendStatus.BLOCKED) {
        throw new Error('Cannot send friend request to blocked user');
      }
      throw new Error('Friend request already exists or you are already friends');
    }

    // Check if request already exists
    const existingRequest = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId, receiverId, status: FriendRequestStatus.PENDING },
          { senderId: receiverId, receiverId: senderId, status: FriendRequestStatus.PENDING }
        ]
      }
    });

    if (existingRequest) {
      throw new Error('Friend request already sent');
    }

    // Create friend request
    const friendRequest = await prisma.friendRequest.create({
      data: {
        senderId,
        receiverId,
        message: message || null,
        status: FriendRequestStatus.PENDING
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            // avatarUrl: true // MvpPlayer doesn't have avatarUrl, need to link to User
          }
        },
        receiver: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });

    return {
      ...friendRequest,
      sender: { ...friendRequest.sender, avatarUrl: null },
      receiver: { ...friendRequest.receiver, avatarUrl: null }
    };
  }

  /**
   * Respond to a friend request (accept or decline)
   */
  static async respondToFriendRequest(
    requestId: string,
    userId: string,
    accept: boolean
  ): Promise<any> {
    // Find the request
    const friendRequest = await prisma.friendRequest.findUnique({
      where: { id: requestId }
    });

    if (!friendRequest) {
      throw new Error('Friend request not found');
    }

    // Verify user is the receiver
    if (friendRequest.receiverId !== userId) {
      throw new Error('You are not authorized to respond to this request');
    }

    // Check if already responded
    if (friendRequest.status !== FriendRequestStatus.PENDING) {
      throw new Error('Friend request has already been responded to');
    }

    if (accept) {
      // Accept: Update request and create friendship
      const [updatedRequest, friendship] = await prisma.$transaction([
        prisma.friendRequest.update({
          where: { id: requestId },
          data: {
            status: FriendRequestStatus.ACCEPTED,
            respondedAt: new Date()
          }
        }),
        prisma.friend.create({
          data: {
            playerId: friendRequest.senderId,
            friendId: friendRequest.receiverId,
            status: FriendStatus.ACCEPTED,
            acceptedAt: new Date()
          }
        })
      ]);

      return {
        success: true,
        message: 'Friend request accepted',
        friendship
      };
    } else {
      // Decline: Update request status
      const updatedRequest = await prisma.friendRequest.update({
        where: { id: requestId },
        data: {
          status: FriendRequestStatus.DECLINED,
          respondedAt: new Date()
        }
      });

      return {
        success: true,
        message: 'Friend request declined',
        request: updatedRequest
      };
    }
  }

  /**
   * Get friend requests (sent or received)
   */
  static async getFriendRequests(
    userId: string,
    type: 'sent' | 'received' = 'received'
  ): Promise<FriendRequestWithDetails[]> {
    const requests = await prisma.friendRequest.findMany({
      where: {
        ...(type === 'sent' ? { senderId: userId } : { receiverId: userId }),
        status: FriendRequestStatus.PENDING
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true
          }
        },
        receiver: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        sentAt: 'desc'
      }
    });

    return requests.map(req => ({
      ...req,
      sender: { ...req.sender, avatarUrl: null },
      receiver: { ...req.receiver, avatarUrl: null }
    }));
  }

  /**
   * Get user's friends list
   */
  static async getFriends(userId: string): Promise<FriendWithDetails[]> {
    const friendships = await prisma.friend.findMany({
      where: {
        OR: [
          { playerId: userId },
          { friendId: userId }
        ],
        status: FriendStatus.ACCEPTED
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            status: true
          }
        },
        friend: {
          select: {
            id: true,
            name: true,
            status: true
          }
        }
      }
    });

    // Map to FriendWithDetails, showing the other person as the "friend"
    return friendships.map(friendship => {
      const isPlayer = friendship.playerId === userId;
      const friendData = isPlayer ? friendship.friend : friendship.player;
      
      return {
        id: friendship.id,
        playerId: friendship.playerId,
        friendId: friendship.friendId,
        status: friendship.status,
        requestedAt: friendship.requestedAt,
        acceptedAt: friendship.acceptedAt,
        friend: {
          id: friendData.id,
          name: friendData.name,
          avatarUrl: null,
          status: friendData.status
        }
      };
    });
  }

  /**
   * Remove a friend
   */
  static async removeFriend(userId: string, friendId: string): Promise<any> {
    // Find the friendship (can be in either direction)
    const friendship = await prisma.friend.findFirst({
      where: {
        OR: [
          { playerId: userId, friendId: friendId },
          { playerId: friendId, friendId: userId }
        ]
      }
    });

    if (!friendship) {
      throw new Error('Friendship not found');
    }

    // Delete the friendship
    await prisma.friend.delete({
      where: { id: friendship.id }
    });

    return {
      success: true,
      message: 'Friend removed successfully'
    };
  }

  /**
   * Block a user
   */
  static async blockUser(userId: string, targetUserId: string): Promise<any> {
    // Remove existing friendship if any
    const existingFriendship = await prisma.friend.findFirst({
      where: {
        OR: [
          { playerId: userId, friendId: targetUserId },
          { playerId: targetUserId, friendId: userId }
        ]
      }
    });

    if (existingFriendship) {
      await prisma.friend.delete({
        where: { id: existingFriendship.id }
      });
    }

    // Cancel pending friend requests
    await prisma.friendRequest.updateMany({
      where: {
        OR: [
          { senderId: userId, receiverId: targetUserId, status: FriendRequestStatus.PENDING },
          { senderId: targetUserId, receiverId: userId, status: FriendRequestStatus.PENDING }
        ]
      },
      data: {
        status: FriendRequestStatus.CANCELLED
      }
    });

    // Create blocked relationship
    const blocked = await prisma.friend.create({
      data: {
        playerId: userId,
        friendId: targetUserId,
        status: FriendStatus.BLOCKED
      }
    });

    return {
      success: true,
      message: 'User blocked successfully',
      blocked
    };
  }

  /**
   * Unblock a user
   */
  static async unblockUser(userId: string, targetUserId: string): Promise<any> {
    const blocked = await prisma.friend.findFirst({
      where: {
        playerId: userId,
        friendId: targetUserId,
        status: FriendStatus.BLOCKED
      }
    });

    if (!blocked) {
      throw new Error('User is not blocked');
    }

    await prisma.friend.delete({
      where: { id: blocked.id }
    });

    return {
      success: true,
      message: 'User unblocked successfully'
    };
  }

  /**
   * Get blocked users list
   */
  static async getBlockedUsers(userId: string): Promise<any[]> {
    const blocked = await prisma.friend.findMany({
      where: {
        playerId: userId,
        status: FriendStatus.BLOCKED
      },
      include: {
        friend: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return blocked.map(b => ({
      id: b.id,
      userId: b.friendId,
      name: b.friend.name,
      avatarUrl: null,
      blockedAt: b.requestedAt
    }));
  }

  /**
   * Get friend statistics
   */
  static async getFriendStats(userId: string): Promise<FriendStats> {
    const [totalFriends, pendingRequests, sentRequests, blockedUsers] = await Promise.all([
      prisma.friend.count({
        where: {
          OR: [
            { playerId: userId },
            { friendId: userId }
          ],
          status: FriendStatus.ACCEPTED
        }
      }),
      prisma.friendRequest.count({
        where: {
          receiverId: userId,
          status: FriendRequestStatus.PENDING
        }
      }),
      prisma.friendRequest.count({
        where: {
          senderId: userId,
          status: FriendRequestStatus.PENDING
        }
      }),
      prisma.friend.count({
        where: {
          playerId: userId,
          status: FriendStatus.BLOCKED
        }
      })
    ]);

    return {
      totalFriends,
      pendingRequests,
      sentRequests,
      blockedUsers
    };
  }

  /**
   * Check if two users are friends
   */
  static async areFriends(userId: string, otherUserId: string): Promise<boolean> {
    const friendship = await prisma.friend.findFirst({
      where: {
        OR: [
          { playerId: userId, friendId: otherUserId },
          { playerId: otherUserId, friendId: userId }
        ],
        status: FriendStatus.ACCEPTED
      }
    });

    return !!friendship;
  }

  /**
   * Get friend suggestions (users who are not friends yet)
   * Based on mutual friends or sessions attended together
   */
  static async getFriendSuggestions(userId: string, limit: number = 10): Promise<any[]> {
    // Get current friends
    const currentFriends = await this.getFriends(userId);
    const friendIds = currentFriends.map(f => f.friend.id);

    // Get blocked users
    const blockedUsers = await this.getBlockedUsers(userId);
    const blockedIds = blockedUsers.map(b => b.userId);

    // Exclude current user, friends, and blocked users
    const excludeIds = [userId, ...friendIds, ...blockedIds];

    // Find users from same sessions (mutual session attendance)
    const suggestions = await prisma.mvpPlayer.findMany({
      where: {
        id: {
          notIn: excludeIds
        }
      },
      select: {
        id: true,
        name: true,
        gamesPlayed: true,
        wins: true,
        winRate: true
      },
      take: limit,
      orderBy: {
        gamesPlayed: 'desc' // Suggest active players
      }
    });

    // Calculate mutual friends for each suggestion
    const suggestionsWithMutuals = await Promise.all(
      suggestions.map(async (s) => {
        // Get friend IDs of the suggested user
        const suggestedUserFriends = await prisma.friend.findMany({
          where: {
            OR: [
              { playerId: s.id },
              { friendId: s.id }
            ],
            status: FriendStatus.ACCEPTED
          },
          select: {
            playerId: true,
            friendId: true
          }
        });

        const suggestedUserFriendIds = new Set(
          suggestedUserFriends.flatMap(f => [f.playerId, f.friendId]).filter(id => id !== s.id)
        );

        // Count how many of current user's friends are in suggested user's friends
        const mutualCount = friendIds.filter(id => suggestedUserFriendIds.has(id)).length;

        return {
          id: s.id,
          name: s.name,
          avatarUrl: null,
          mutualFriends: mutualCount,
          gamesPlayed: s.gamesPlayed,
          winRate: s.winRate
        };
      })
    );

    return suggestionsWithMutuals;
  }
}

export const friendsService = FriendService;
