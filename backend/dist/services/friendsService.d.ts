export interface FriendRequestData {
    senderId: string;
    receiverId: string;
    message?: string;
}
export interface FriendData {
    playerId: string;
    friendId: string;
}
export declare class FriendsService {
    /**
     * Send a friend request
     */
    sendFriendRequest(data: FriendRequestData): Promise<{
        id: any;
        senderId: any;
        receiverId: any;
        message: any;
        status: any;
        sentAt: Date;
        sender: {
            id: any;
            name: any;
        };
        receiver: {
            id: any;
            name: any;
        };
    } | null>;
    /**
     * Respond to a friend request
     */
    respondToFriendRequest(requestId: string, senderId: string, receiverId: string, accept: boolean): Promise<{
        id: any;
        senderId: any;
        receiverId: any;
        message: any;
        status: any;
        sentAt: Date;
        respondedAt: Date | null;
        sender: {
            id: any;
            name: any;
        };
        receiver: {
            id: any;
            name: any;
        };
    } | null>;
    /**
     * Get friend requests for a user
     */
    getFriendRequests(userId: string, type?: 'sent' | 'received'): Promise<{
        id: any;
        senderId: any;
        receiverId: any;
        message: any;
        status: any;
        sentAt: Date;
        respondedAt: Date | null;
        sender: {
            id: any;
            name: any;
        };
        receiver: {
            id: any;
            name: any;
        };
    }[]>;
    /**
     * Get friends list for a user
     */
    getFriends(userId: string): Promise<{
        id: any;
        friendId: any;
        friendName: any;
        sessionId: any;
        friendshipSince: Date | null;
    }[]>;
    /**
     * Remove a friend
     */
    removeFriend(userId: string, friendId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Block a user
     */
    blockUser(userId: string, targetUserId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Unblock a user
     */
    unblockUser(userId: string, targetUserId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Get blocked users
     */
    getBlockedUsers(userId: string): Promise<{
        id: any;
        userId: any;
        userName: any;
        blockedAt: Date | null;
    }[]>;
    /**
     * Check if two users are friends
     */
    areFriends(userId1: string, userId2: string): Promise<boolean>;
    /**
     * Get friend statistics
     */
    getFriendStats(userId: string): Promise<{
        friendsCount: number;
        pendingRequestsCount: number;
        sentRequestsCount: number;
    }>;
}
export declare const friendsService: FriendsService;
//# sourceMappingURL=friendsService.d.ts.map