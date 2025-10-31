import { Request, Response, NextFunction } from 'express';
export declare const PERMISSION_MATRIX: {
    ORGANIZER: {
        canEditSession: boolean;
        canDeleteSession: boolean;
        canManagePlayers: boolean;
        canRemovePlayers: boolean;
        canAddPlayers: boolean;
        canUpdatePlayerStatus: boolean;
        canGeneratePairings: boolean;
        canModifyPairings: boolean;
    };
    PLAYER: {
        canEditSession: boolean;
        canDeleteSession: boolean;
        canManagePlayers: boolean;
        canRemovePlayers: boolean;
        canAddPlayers: boolean;
        canUpdatePlayerStatus: boolean;
        canGeneratePairings: boolean;
        canModifyPairings: boolean;
    };
};
export type PlayerRole = 'ORGANIZER' | 'PLAYER';
export type PermissionAction = 'edit_session' | 'delete_session' | 'manage_players' | 'remove_players' | 'add_players' | 'update_player_status' | 'generate_pairings' | 'modify_pairings';
export declare const createPermissionError: (requiredRole: PlayerRole, userRole: PlayerRole, action: PermissionAction) => {
    error: string;
    requiredRole: PlayerRole;
    userRole: PlayerRole;
    operation: PermissionAction;
    message: string;
};
export declare const hasPermission: (role: PlayerRole, action: PermissionAction) => boolean;
export declare const requireRole: (requiredRole: PlayerRole, action: PermissionAction) => (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const requireOrganizer: (action: PermissionAction) => (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const requireOrganizerOrSelf: (action: PermissionAction) => (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=permissions.d.ts.map