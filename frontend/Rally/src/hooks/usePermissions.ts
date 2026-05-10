import { useSession } from '../contexts/SessionContext';

// Permission hook for components
export const usePermissions = () => {
  const { currentUser, isOrganizer, canEditSession, canManagePlayers, canUpdatePlayerStatus } = useSession();

  // Helper functions for common permission checks
  const canEditSessionDetails = () => canEditSession;

  const canDeleteSession = () => isOrganizer;

  const canAddPlayers = () => isOrganizer;

  const canRemovePlayers = () => isOrganizer;

  const canUpdateOwnStatus = () => !!currentUser;

  const canUpdateAnyPlayerStatus = () => isOrganizer;

  const canGeneratePairings = () => isOrganizer;

  const canModifyPairings = () => isOrganizer;

  const canTerminateSession = () => isOrganizer;

  const canReactivateSession = () => isOrganizer;

  // Check if current user can perform specific actions
  const checkPermission = (action: string, targetPlayerId?: string): boolean => {
    switch (action) {
      case 'edit_session':
        return canEditSessionDetails();
      case 'delete_session':
        return canDeleteSession();
      case 'add_players':
        return canAddPlayers();
      case 'remove_players':
        return canRemovePlayers();
      case 'update_player_status':
        if (targetPlayerId && currentUser) {
          return canUpdatePlayerStatus(targetPlayerId);
        }
        return canUpdateOwnStatus();
      case 'generate_pairings':
        return canGeneratePairings();
      case 'modify_pairings':
        return canModifyPairings();
      case 'terminate_session':
        return canTerminateSession();
      case 'reactivate_session':
        return canReactivateSession();
      default:
        return false;
    }
  };

  // Get user role display text
  const getRoleDisplayText = (): string => {
    if (!currentUser) return 'Not joined';
    return currentUser.role === 'ORGANIZER' ? 'Organizer' : 'Player';
  };

  // Check if user has a specific role
  const hasRole = (role: 'ORGANIZER' | 'PLAYER'): boolean => {
    return currentUser?.role === role;
  };

  return {
    // Basic permission checks
    isOrganizer,
    canEditSession: canEditSessionDetails(),
    canDeleteSession: canDeleteSession(),
    canManagePlayers: canManagePlayers,
    canAddPlayers: canAddPlayers(),
    canRemovePlayers: canRemovePlayers(),
    canUpdateOwnStatus: canUpdateOwnStatus(),
    canUpdateAnyPlayerStatus: canUpdateAnyPlayerStatus(),
    canGeneratePairings: canGeneratePairings(),
    canModifyPairings: canModifyPairings(),
    canTerminateSession: canTerminateSession(),
    canReactivateSession: canReactivateSession(),

    // Utility functions
    checkPermission,
    getRoleDisplayText,
    hasRole,

    // User info
    currentUser,
    userRole: currentUser?.role || null
  };
};