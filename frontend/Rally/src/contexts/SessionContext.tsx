import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { mvpApiService, MvpSession, MvpPlayer } from '../services/mvpApiService';

// Types for session management
export interface SessionUser {
  id: string;
  name: string;
  role: 'ORGANIZER' | 'PLAYER';
}

export interface SessionContextType {
  // Session data
  session: MvpSession | null;
  currentUser: SessionUser | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  createSession: (sessionData: {
    name?: string;
    scheduledAt: string;
    location?: string;
    ownerName: string;
    ownerDeviceId?: string;
  }) => Promise<void>;

  joinSession: (shareCode: string, playerData: {
    name: string;
    deviceId?: string;
  }) => Promise<void>;

  loadSession: (shareCode: string) => Promise<void>;
  leaveSession: () => void;

  // Permission helpers
  isOrganizer: boolean;
  canEditSession: boolean;
  canManagePlayers: boolean;
  canUpdatePlayerStatus: (playerId: string) => boolean;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

interface SessionProviderProps {
  children: ReactNode;
}

export const SessionProvider: React.FC<SessionProviderProps> = ({ children }) => {
  const [session, setSession] = useState<MvpSession | null>(null);
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to determine the current user from the server-computed signals.
  // `players[].isYou` is derived server-side from the presented identity, so we
  // never compare a leaked `deviceId` here (design §4.2).
  const determineCurrentUser = (sessionData: MvpSession): SessionUser | null => {
    const player = sessionData.players.find((p) => p.isYou);
    if (!player) return null;

    return {
      id: player.id,
      name: player.name,
      role: player.role,
    };
  };

  // Create a new session
  const createSession = async (sessionData: {
    name?: string;
    scheduledAt: string;
    location?: string;
    ownerName: string;
    ownerDeviceId?: string;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await mvpApiService.createMvpSession(sessionData);

      if (response.success && response.data) {
        const newSession = response.data.session;
        setSession(newSession);

        // Set current user as organizer
        const organizerUser: SessionUser = {
          id: newSession.players[0].id, // Organizer is always first player
          name: newSession.ownerName,
          role: 'ORGANIZER',
        };
        setCurrentUser(organizerUser);
      } else {
        setError(response.error?.message || 'Failed to create session');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setIsLoading(false);
    }
  };

  // Join an existing session
  const joinSession = async (shareCode: string, playerData: {
    name: string;
    deviceId?: string;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await mvpApiService.joinSession(shareCode, playerData);

      if (response.success) {
        // Reload session data to get updated player list with roles
        await loadSession(shareCode);
      } else {
        setError(response.error?.message || 'Failed to join session');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join session');
    } finally {
      setIsLoading(false);
    }
  };

  // Load session data
  const loadSession = async (shareCode: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await mvpApiService.getSessionByShareCode(shareCode);

      if (response.success && response.data) {
        const sessionData = response.data.session;
        setSession(sessionData);

        // Self-identification comes from the server-computed `players[].isYou`
        // signal (see `determineCurrentUser`), not a locally-stored device id.
        const user = determineCurrentUser(sessionData);
        setCurrentUser(user);
      } else {
        setError(response.error?.message || 'Failed to load session');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setIsLoading(false);
    }
  };

  // Leave session
  const leaveSession = () => {
    setSession(null);
    setCurrentUser(null);
    setError(null);
  };

  // Permission helpers
  const isOrganizer = currentUser?.role === 'ORGANIZER';

  const canEditSession = isOrganizer;

  const canManagePlayers = isOrganizer;

  const canUpdatePlayerStatus = (playerId: string): boolean => {
    if (!currentUser) return false;

    // Organizers can update any player's status
    if (isOrganizer) return true;

    // Players can only update their own status
    return currentUser.id === playerId;
  };

  const value: SessionContextType = {
    session,
    currentUser,
    isLoading,
    error,
    createSession,
    joinSession,
    loadSession,
    leaveSession,
    isOrganizer,
    canEditSession,
    canManagePlayers,
    canUpdatePlayerStatus
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};

// Hook to use session context
export const useSession = (): SessionContextType => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};

export default SessionContext;