import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { usePermissions } from '../hooks/usePermissions';
import { OrganizerOnly, CanEditSession, CanManagePlayers, CanUpdatePlayerStatus } from './PermissionGuard';

interface SessionControlsProps {
  onEditSession?: () => void;
  onTerminateSession?: () => void;
  onAddPlayer?: () => void;
  onRemovePlayer?: (playerId: string) => void;
  onUpdatePlayerStatus?: (playerId: string, status: string) => void;
  players?: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}

export const SessionControls: React.FC<SessionControlsProps> = ({
  onEditSession,
  onTerminateSession,
  onAddPlayer,
  onRemovePlayer,
  onUpdatePlayerStatus,
  players = []
}) => {
  const { isOrganizer, canEditSession, canManagePlayers, getRoleDisplayText } = usePermissions();

  return (
    <View style={styles.container}>
      {/* Role Indicator */}
      <View style={styles.roleIndicator}>
        <Text style={styles.roleText}>
          You are: {getRoleDisplayText()}
        </Text>
      </View>

      {/* Organizer-only controls */}
      <OrganizerOnly>
        <View style={styles.organizerControls}>
          <Text style={styles.sectionTitle}>Organizer Controls</Text>

          <TouchableOpacity
            style={styles.button}
            onPress={onEditSession}
            disabled={!canEditSession}
          >
            <Text style={styles.buttonText}>Edit Session</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.dangerButton]}
            onPress={onTerminateSession}
          >
            <Text style={styles.buttonText}>Terminate Session</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.button}
            onPress={onAddPlayer}
            disabled={!canManagePlayers}
          >
            <Text style={styles.buttonText}>Add Player</Text>
          </TouchableOpacity>
        </View>
      </OrganizerOnly>

      {/* Player management section - visible to all but with different permissions */}
      <CanManagePlayers>
        <View style={styles.playerManagement}>
          <Text style={styles.sectionTitle}>Player Management</Text>

          {players.map(player => (
            <View key={player.id} style={styles.playerRow}>
              <Text style={styles.playerName}>{player.name}</Text>
              <Text style={styles.playerStatus}>{player.status}</Text>

              {/* Remove player button - organizer only */}
              <OrganizerOnly>
                <TouchableOpacity
                  style={[styles.smallButton, styles.dangerButton]}
                  onPress={() => onRemovePlayer?.(player.id)}
                >
                  <Text style={styles.smallButtonText}>Remove</Text>
                </TouchableOpacity>
              </OrganizerOnly>

              {/* Update status button - organizer or self */}
              <CanUpdatePlayerStatus playerId={player.id}>
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={() => onUpdatePlayerStatus?.(player.id, 'ACTIVE')}
                >
                  <Text style={styles.smallButtonText}>
                    {player.status === 'ACTIVE' ? 'Set Rest' : 'Set Active'}
                  </Text>
                </TouchableOpacity>
              </CanUpdatePlayerStatus>
            </View>
          ))}
        </View>
      </CanManagePlayers>

      {/* Session info - visible to all */}
      <View style={styles.sessionInfo}>
        <Text style={styles.sectionTitle}>Session Information</Text>
        <Text style={styles.infoText}>
          Total Players: {players.length}
        </Text>
        <Text style={styles.infoText}>
          Active Players: {players.filter(p => p.status === 'ACTIVE').length}
        </Text>
        <Text style={styles.infoText}>
          Resting Players: {players.filter(p => p.status === 'RESTING').length}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  roleIndicator: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  roleText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  organizerControls: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  playerManagement: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sessionInfo: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  button: {
    backgroundColor: '#1976d2',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
    alignItems: 'center',
  },
  dangerButton: {
    backgroundColor: '#d32f2f',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
    marginBottom: 8,
  },
  playerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
  },
  playerStatus: {
    fontSize: 14,
    color: '#666',
    marginRight: 12,
  },
  smallButton: {
    backgroundColor: '#1976d2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 8,
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
});