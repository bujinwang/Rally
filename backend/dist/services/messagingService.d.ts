export interface MessageData {
    threadId: string;
    senderId: string;
    content: string;
    messageType?: string;
}
export interface ThreadData {
    participants: string[];
    title?: string;
}
export declare class MessagingService {
    /**
     * Create a new message thread
     */
    createThread(data: ThreadData): Promise<any>;
    /**
     * Send a message
     */
    sendMessage(data: MessageData): Promise<{
        id: any;
        threadId: any;
        senderId: any;
        content: any;
        messageType: any;
        sentAt: Date;
        isRead: boolean;
        sender: {
            id: any;
            name: any;
        };
    } | null>;
    /**
     * Get messages for a thread
     */
    getThreadMessages(threadId: string, userId: string, limit?: number, offset?: number): Promise<{
        id: any;
        threadId: any;
        senderId: any;
        content: any;
        messageType: any;
        sentAt: Date;
        isRead: any;
        readAt: Date | null;
        sender: {
            id: any;
            name: any;
        };
    }[]>;
    /**
     * Get user threads
     */
    getUserThreads(userId: string): Promise<{
        id: any;
        participants: any;
        title: any;
        lastMessageAt: Date;
        lastMessage: {
            content: any;
            sentAt: Date;
            senderName: any;
        } | null;
    }[]>;
    /**
     * Mark messages as read
     */
    markMessagesAsRead(threadId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Get unread messages count for user
     */
    getUnreadCount(userId: string): Promise<number>;
    /**
     * Get unread count for a specific thread
     */
    getThreadUnreadCount(threadId: string, userId: string): Promise<number>;
    /**
     * Delete a message (soft delete by marking as deleted for the user)
     */
    deleteMessage(messageId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Leave a thread
     */
    leaveThread(threadId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Add participants to a thread
     */
    addParticipants(threadId: string, userId: string, newParticipants: string[]): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Get thread details
     */
    getThreadDetails(threadId: string, userId: string): Promise<{
        id: any;
        participants: any;
        title: any;
        lastMessageAt: Date;
        messageCount: number;
    }>;
    /**
     * Search messages in a thread
     */
    searchMessages(threadId: string, userId: string, query: string, limit?: number): Promise<{
        id: any;
        threadId: any;
        senderId: any;
        content: any;
        messageType: any;
        sentAt: Date;
        isRead: any;
        sender: {
            id: any;
            name: any;
        };
    }[]>;
}
export declare const messagingService: MessagingService;
//# sourceMappingURL=messagingService.d.ts.map