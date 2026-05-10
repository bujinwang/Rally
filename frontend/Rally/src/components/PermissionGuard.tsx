import React, { ReactNode } from 'react';
import { usePermissions } from '../hooks/usePermissions';

interface PermissionGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  requireRole?: 'ORGANIZER' | 'PLAYER';
  requirePermission?: string;
  targetPlayerId?: string;
}

/**
 * PermissionGuard component for conditional rendering based on user permissions
 *
 * @param children - Content to render if permission check passes
 * @param fallback - Content to render if permission check fails (optional)
 * @param requireRole - Specific role required (optional)
 * @param requirePermission - Specific permission action required (optional)
 * @param targetPlayerId - Player ID for permission checks involving specific players (optional)
 */
export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  children,
  fallback = null,
  requireRole,
  requirePermission,
  targetPlayerId
}) => {
  const { hasRole, checkPermission } = usePermissions();

  // Check role requirement
  if (requireRole && !hasRole(requireRole)) {
    return <>{fallback}</>;
  }

  // Check specific permission requirement
  if (requirePermission && !checkPermission(requirePermission, targetPlayerId)) {
    return <>{fallback}</>;
  }

  // All checks passed, render children
  return <>{children}</>;
};

// Convenience components for common permission patterns
export const OrganizerOnly: React.FC<{ children: ReactNode; fallback?: ReactNode }> = ({
  children,
  fallback = null
}) => (
  <PermissionGuard requireRole="ORGANIZER" fallback={fallback}>
    {children}
  </PermissionGuard>
);

export const PlayerOnly: React.FC<{ children: ReactNode; fallback?: ReactNode }> = ({
  children,
  fallback = null
}) => (
  <PermissionGuard requireRole="PLAYER" fallback={fallback}>
    {children}
  </PermissionGuard>
);

export const CanEditSession: React.FC<{ children: ReactNode; fallback?: ReactNode }> = ({
  children,
  fallback = null
}) => (
  <PermissionGuard requirePermission="edit_session" fallback={fallback}>
    {children}
  </PermissionGuard>
);

export const CanManagePlayers: React.FC<{ children: ReactNode; fallback?: ReactNode }> = ({
  children,
  fallback = null
}) => (
  <PermissionGuard requirePermission="manage_players" fallback={fallback}>
    {children}
  </PermissionGuard>
);

export const CanUpdatePlayerStatus: React.FC<{
  children: ReactNode;
  playerId: string;
  fallback?: ReactNode;
}> = ({
  children,
  playerId,
  fallback = null
}) => (
  <PermissionGuard
    requirePermission="update_player_status"
    targetPlayerId={playerId}
    fallback={fallback}
  >
    {children}
  </PermissionGuard>
);