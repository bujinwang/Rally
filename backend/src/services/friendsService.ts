import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface FriendRequestData {
  senderId: string;
  receiverId: string;
  message?: string;
}

export interface FriendData {
  playerId: string;
  friendId: string;
}

export class FriendsService {
  /**
   * Send a friend request
   */
  async sendFriendRequest(data: FriendRequestData) {
    // Check if users are already friends
    const existingFriendship = await prisma.$queryRaw`
      SELECT * FROM friends
      WHERE (player_id = ${data.senderId} AND friend_id = ${data.receiverId})
         OR (player_id = ${data.receiverId} AND friend_id = ${data.senderId})
    ` as any[];

    if (existingFriendship.length > 0) {
      throw new Error('Users are already friends or have a pending request');
    }

    // Check for existing pending request
    const existingRequest = await prisma.$queryRaw`
      SELECT * FROM friend_requests
      WHERE ((sender_id = ${data.senderId} AND receiver_id = ${data.receiverId})
         OR (sender_id = ${data.receiverId} AND receiver_id = ${data.senderId}))
        AND status = 'PENDING'
    ` as any[];

    if (existingRequest.length > 0) {
      throw new Error('There is already a pending friend request between these users');
    }

    // Create friend request
    const requestId = crypto.randomUUID();
    await prisma.$queryRaw`
      INSERT INTO friend_requests (id, sender_id, receiver_id, message, status, sent_at)
      VALUES (${requestId}, ${data.senderId}, ${data.receiverId}, ${data.message || null}, 'PENDING', NOW())
    `;

    // Get the created request with user details
    const friendRequest = await prisma.$queryRaw`
      SELECT fr.*, s.name as sender_name, r.name as receiver_name
      FROM friend_requests fr
      JOIN mvp_players s ON fr.sender_id = s.id
      JOIN mvp_players r ON fr.receiver_id = r.id
      WHERE fr.id = ${requestId}
    ` as any[];

    return friendRequest[0] ? {
      id: friendRequest[0].id,
      senderId: friendRequest[0].sender_id,
      receiverId: friendRequest[0].receiver_id,
      message: friendRequest[0].message,
      status: friendRequest[0].status,
      sentAt: new Date(friendRequest[0].sent_at),
      sender: { id: friendRequest[0].sender_id, name: friendRequest[0].sender_name },
      receiver: { id: friendRequest[0].receiver_id, name: friendRequest[0].receiver_name }
    } : null;
  }

  /**
   * Respond to a friend request
   */
  async respondToFriendRequest(requestId: string, senderId: string, receiverId: string, accept: boolean) {
    const requestResult = await prisma.$queryRaw`
      SELECT * FROM friend_requests
      WHERE id = ${requestId} AND sender_id = ${senderId} AND receiver_id = ${receiverId} AND status = 'PENDING'
    ` as any[];

    if (requestResult.length === 0) {
      throw new Error('Friend request not found or already processed');
    }

    const newStatus = accept ? 'ACCEPTED' : 'DECLINED';

    // Update the friend request
    await prisma.$queryRaw`
      UPDATE friend_requests
      SET status = ${newStatus}, responded_at = NOW()
      WHERE id = ${requestId}
    `;

    // If accepted, create friendship
    if (accept) {
      const friendshipId = crypto.randomUUID();
      await prisma.$queryRaw`
        INSERT INTO friends (id, player_id, friend_id, status, accepted_at)
        VALUES (${friendshipId}, ${senderId}, ${receiverId}, 'ACCEPTED', NOW())
      `;
    }

    // Get updated request with user details
    const updatedRequestResult = await prisma.$queryRaw`
      SELECT fr.*, s.name as sender_name, r.name as receiver_name
      FROM friend_requests fr
      JOIN mvp_players s ON fr.sender_id = s.id
      JOIN mvp_players r ON fr.receiver_id = r.id
      WHERE fr.id = ${requestId}
    ` as any[];

    return updatedRequestResult[0] ? {
      id: updatedRequestResult[0].id,
      senderId: updatedRequestResult[0].sender_id,
      receiverId: updatedRequestResult[0].receiver_id,
      message: updatedRequestResult[0].message,
      status: updatedRequestResult[0].status,
      sentAt: new Date(updatedRequestResult[0].sent_at),
      respondedAt: updatedRequestResult[0].responded_at ? new Date(updatedRequestResult[0].responded_at) : null,
      sender: { id: updatedRequestResult[0].sender_id, name: updatedRequestResult[0].sender_name },
      receiver: { id: updatedRequestResult[0].receiver_id, name: updatedRequestResult[0].receiver_name }
    } : null;
  }

  /**
   * Get friend requests for a user
   */
  async getFriendRequests(userId: string, type: 'sent' | 'received' = 'received') {
    const whereClause = type === 'sent'
      ? `fr.sender_id = '${userId}'`
      : `fr.receiver_id = '${userId}'`;

    const requests = await prisma.$queryRaw`
      SELECT fr.*, s.name as sender_name, r.name as receiver_name
      FROM friend_requests fr
      JOIN mvp_players s ON fr.sender_id = s.id
      JOIN mvp_players r ON fr.receiver_id = r.id
      WHERE ${whereClause}
      ORDER BY fr.sent_at DESC
    ` as any[];

    return requests.map(row => ({
      id: row.id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      message: row.message,
      status: row.status,
      sentAt: new Date(row.sent_at),
      respondedAt: row.responded_at ? new Date(row.responded_at) : null,
      sender: { id: row.sender_id, name: row.sender_name },
      receiver: { id: row.receiver_id, name: row.receiver_name }
    }));
  }

  /**
   * Get friends list for a user
   */
  async getFriends(userId: string) {
    const friendships = await prisma.$queryRaw`
      SELECT f.*, p.name as player_name, p.session_id as player_session,
             fr.name as friend_name, fr.session_id as friend_session
      FROM friends f
      JOIN mvp_players p ON f.player_id = p.id
      JOIN mvp_players fr ON f.friend_id = fr.id
      WHERE (f.player_id = ${userId} OR f.friend_id = ${userId})
        AND f.status = 'ACCEPTED'
    ` as any[];

    // Transform to get the friend details
    const friends = friendships.map((friendship: any) => {
      const isPlayer = friendship.player_id === userId;
      const friend = isPlayer ? {
        id: friendship.friend_id,
        name: friendship.friend_name,
        sessionId: friendship.friend_session
      } : {
        id: friendship.player_id,
        name: friendship.player_name,
        sessionId: friendship.player_session
      };

      return {
        id: friendship.id,
        friendId: friend.id,
        friendName: friend.name,
        sessionId: friend.sessionId,
        friendshipSince: friendship.accepted_at ? new Date(friendship.accepted_at) : null
      };
    });

    return friends;
  }

  /**
   * Remove a friend
   */
  async removeFriend(userId: string, friendId: string) {
    const friendshipResult = await prisma.$queryRaw`
      SELECT * FROM friends
      WHERE (player_id = ${userId} AND friend_id = ${friendId})
         OR (player_id = ${friendId} AND friend_id = ${userId})
    ` as any[];

    if (friendshipResult.length === 0) {
      throw new Error('Friendship not found');
    }

    await prisma.$queryRaw`
      DELETE FROM friends WHERE id = ${friendshipResult[0].id}
    `;

    return { success: true, message: 'Friend removed successfully' };
  }

  /**
   * Block a user
   */
  async blockUser(userId: string, targetUserId: string) {
    // First, remove any existing friendship
    const existingFriendship = await prisma.$queryRaw`
      SELECT * FROM friends
      WHERE (player_id = ${userId} AND friend_id = ${targetUserId})
         OR (player_id = ${targetUserId} AND friend_id = ${userId})
    ` as any[];

    if (existingFriendship.length > 0) {
      await prisma.$queryRaw`
        DELETE FROM friends WHERE id = ${existingFriendship[0].id}
      `;
    }

    // Create blocked friendship
    const friendshipId = crypto.randomUUID();
    await prisma.$queryRaw`
      INSERT INTO friends (id, player_id, friend_id, status)
      VALUES (${friendshipId}, ${userId}, ${targetUserId}, 'BLOCKED')
    `;

    return { success: true, message: 'User blocked successfully' };
  }

  /**
   * Unblock a user
   */
  async unblockUser(userId: string, targetUserId: string) {
    const blockedFriendship = await prisma.$queryRaw`
      SELECT * FROM friends
      WHERE player_id = ${userId} AND friend_id = ${targetUserId} AND status = 'BLOCKED'
    ` as any[];

    if (blockedFriendship.length === 0) {
      throw new Error('User is not blocked');
    }

    await prisma.$queryRaw`
      DELETE FROM friends WHERE id = ${blockedFriendship[0].id}
    `;

    return { success: true, message: 'User unblocked successfully' };
  }

  /**
   * Get blocked users
   */
  async getBlockedUsers(userId: string) {
    const blockedUsers = await prisma.$queryRaw`
      SELECT f.*, p.name
      FROM friends f
      JOIN mvp_players p ON f.friend_id = p.id
      WHERE f.player_id = ${userId} AND f.status = 'BLOCKED'
    ` as any[];

    return blockedUsers.map((blocked: any) => ({
      id: blocked.id,
      userId: blocked.friend_id,
      userName: blocked.name,
      blockedAt: blocked.requested_at ? new Date(blocked.requested_at) : null
    }));
  }

  /**
   * Check if two users are friends
   */
  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    const friendship = await prisma.$queryRaw`
      SELECT * FROM friends
      WHERE ((player_id = ${userId1} AND friend_id = ${userId2})
         OR (player_id = ${userId2} AND friend_id = ${userId1}))
        AND status = 'ACCEPTED'
    ` as any[];

    return friendship.length > 0;
  }

  /**
   * Get friend statistics
   */
  async getFriendStats(userId: string) {
    const [friendsCountResult, pendingRequestsResult, sentRequestsResult] = await Promise.all([
      prisma.$queryRaw`SELECT COUNT(*) as count FROM friends WHERE (player_id = ${userId} OR friend_id = ${userId}) AND status = 'ACCEPTED'`,
      prisma.$queryRaw`SELECT COUNT(*) as count FROM friend_requests WHERE receiver_id = ${userId} AND status = 'PENDING'`,
      prisma.$queryRaw`SELECT COUNT(*) as count FROM friend_requests WHERE sender_id = ${userId} AND status = 'PENDING'`
    ]);

    const friendsCount = Array.isArray(friendsCountResult) ? parseInt((friendsCountResult[0] as any).count) || 0 : 0;
    const pendingRequestsCount = Array.isArray(pendingRequestsResult) ? parseInt((pendingRequestsResult[0] as any).count) || 0 : 0;
    const sentRequestsCount = Array.isArray(sentRequestsResult) ? parseInt((sentRequestsResult[0] as any).count) || 0 : 0;

    return {
      friendsCount,
      pendingRequestsCount,
      sentRequestsCount
    };
  }
}

export const friendsService = new FriendsService();