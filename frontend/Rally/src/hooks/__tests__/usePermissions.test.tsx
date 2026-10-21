import { renderHook } from '@testing-library/react';
import { SessionProvider } from '../../contexts/SessionContext';
import { usePermissions } from '../usePermissions';

// Mock the session context
const mockSessionContext = {
  session: {
    id: 'session-1',
    name: 'Test Session',
    shareCode: 'ABC123',
    players: [
      {
        id: 'player-1',
        name: 'Organizer',
        role: 'ORGANIZER',
        status: 'ACTIVE',
        deviceId: 'device-1'
      },
      {
        id: 'player-2',
        name: 'Player',
        role: 'PLAYER',
        status: 'ACTIVE',
        deviceId: 'device-2'
      }
    ]
  },
  currentUser: {
    id: 'player-1',
    name: 'Organizer',
    role: 'ORGANIZER',
    deviceId: 'device-1'
  },
  isLoading: false,
  error: null
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);

describe('usePermissions', () => {
  it('should return correct permissions for organizer', () => {
    const { result } = renderHook(() => usePermissions(), { wrapper });

    expect(result.current.isOrganizer).toBe(true);
    expect(result.current.canEditSession).toBe(true);
    expect(result.current.canDeleteSession).toBe(true);
    expect(result.current.canManagePlayers).toBe(true);
    expect(result.current.canAddPlayers).toBe(true);
    expect(result.current.canRemovePlayers).toBe(true);
    expect(result.current.canUpdateOwnStatus).toBe(true);
    expect(result.current.canUpdateAnyPlayerStatus).toBe(true);
    expect(result.current.canGeneratePairings).toBe(true);
    expect(result.current.canModifyPairings).toBe(true);
    expect(result.current.canTerminateSession).toBe(true);
    expect(result.current.canReactivateSession).toBe(true);
  });

  it('should return correct role display text', () => {
    const { result } = renderHook(() => usePermissions(), { wrapper });

    expect(result.current.getRoleDisplayText()).toBe('Organizer');
  });

  it('should check role correctly', () => {
    const { result } = renderHook(() => usePermissions(), { wrapper });

    expect(result.current.hasRole('ORGANIZER')).toBe(true);
    expect(result.current.hasRole('PLAYER')).toBe(false);
  });

  it('should check permissions correctly', () => {
    const { result } = renderHook(() => usePermissions(), { wrapper });

    expect(result.current.checkPermission('edit_session')).toBe(true);
    expect(result.current.checkPermission('add_players')).toBe(true);
    expect(result.current.checkPermission('invalid_permission')).toBe(false);
  });

  it('should return current user information', () => {
    const { result } = renderHook(() => usePermissions(), { wrapper });

    expect(result.current.currentUser).toEqual(mockSessionContext.currentUser);
    expect(result.current.userRole).toBe('ORGANIZER');
  });
});