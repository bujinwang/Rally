import { MvpSession } from '@prisma/client';
export interface CreateSessionData {
    name: string;
    scheduledAt: Date;
    location?: string;
    maxPlayers?: number;
    ownerName: string;
    ownerDeviceId?: string;
    skillLevel?: string;
    cost?: number;
    description?: string;
    courtCount?: number;
    latitude?: number;
    longitude?: number;
    courtType?: string;
    visibility?: string;
    maxDuration?: number;
    isRecurring?: boolean;
    recurrencePattern?: string;
}
export interface UpdateSessionData {
    name?: string;
    location?: string;
    maxPlayers?: number;
    skillLevel?: string;
    cost?: number;
    description?: string;
    courtCount?: number;
    latitude?: number;
    longitude?: number;
    courtType?: string;
    visibility?: string;
    maxDuration?: number;
    isRecurring?: boolean;
    recurrencePattern?: string;
}
export declare class MvpSessionService {
    /**
     * Create a new MVP session
     */
    static createSession(data: CreateSessionData): Promise<MvpSession>;
    /**
     * Get session by share code with optional player inclusion
     */
    static getSessionByShareCode(shareCode: string, includePlayers?: boolean): Promise<MvpSession | null>;
    /**
     * Get all active sessions
     */
    static getActiveSessions(limit?: number, offset?: number): Promise<MvpSession[]>;
    /**
     * Update session details
     */
    static updateSession(shareCode: string, data: UpdateSessionData, ownerDeviceId?: string): Promise<MvpSession>;
    /**
     * Terminate session (set to CANCELLED)
     */
    static terminateSession(shareCode: string, ownerDeviceId: string): Promise<MvpSession>;
    /**
     * Reactivate terminated session
     */
    static reactivateSession(shareCode: string, ownerDeviceId: string): Promise<MvpSession>;
    /**
     * Get sessions owned by a specific device
     */
    static getSessionsByOwner(deviceId: string): Promise<MvpSession[]>;
    /**
     * Generate a unique 6-character share code
     */
    private static generateShareCode;
}
//# sourceMappingURL=mvpSessionService.d.ts.map