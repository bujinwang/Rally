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
export declare class SharingService {
    /**
     * Share an entity (session, match, achievement)
     */
    shareEntity(sharerId: string, data: ShareData): Promise<{
        share: any;
        shareUrl: string;
        preview: {
            title: string;
            description: string;
            image: string;
            url: string;
        };
    }>;
    /**
     * Get community feed
     */
    getCommunityFeed(userId?: string, limit?: number, offset?: number): Promise<{
        shares: any;
        sessions: {
            status: import(".prisma/client").$Enums.SessionStatus;
            id: string;
            name: string;
            scheduledAt: Date;
            location: string | null;
            maxPlayers: number;
            courtCount: number;
            ownerName: string;
            ownerDeviceId: string | null;
            organizerSecretHash: string | null;
            organizerSecretUpdatedAt: Date | null;
            ownershipClaimedAt: Date | null;
            shareCode: string;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: any;
    }>;
    /**
     * Connect social account
     */
    connectSocialAccount(playerId: string, data: SocialConnectionData): Promise<any>;
    /**
     * Get player's social connections
     */
    getSocialConnections(playerId: string): Promise<any>;
    /**
     * Update privacy settings
     */
    updatePrivacySettings(playerId: string, settings: Record<string, string>): Promise<any>;
    /**
     * Get privacy settings
     */
    getPrivacySettings(playerId: string): Promise<any>;
    /**
     * Generate share URL
     */
    private generateShareUrl;
    /**
     * Generate social preview data
     */
    private generateSocialPreview;
    /**
     * Get share statistics
     */
    getShareStats(playerId: string): Promise<any>;
}
export declare const sharingService: SharingService;
//# sourceMappingURL=sharingService.d.ts.map