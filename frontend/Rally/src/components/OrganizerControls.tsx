import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, Modal } from 'react-native';

interface Player {
  id: string;
  name: string;
  deviceId: string;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
  role?: 'ORGANIZER' | 'PLAYER';
  gamesPlayed: number;
  wins: number;
  losses: number;
}

interface Session {
  id: string;
  shareCode: string;
  name: string;
  ownerDeviceId?: string;
  ownerName: string;
  maxPlayers: number;
  courtCount: number;
  location?: string;
  scheduledAt: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  players: Player[];
}

interface OrganizerControlsProps {
  session: Session;
  currentUserDeviceId: string;
  isOrganizer: boolean;
  onSessionUpdate: () => void;
  onSessionTerminate: () => void;
  onPlayerRemove: (playerId: string) => void;
  onPlayerAdd: (playerName: string) => void;
  onCourtCountUpdate: (courtCount: number) => void;
}

export const OrganizerControls: React.FC<OrganizerControlsProps> = ({
  session,
  currentUserDeviceId,
  isOrganizer,
  onSessionUpdate,
  onSessionTerminate,
  onPlayerRemove,
  onPlayerAdd,
  onCourtCountUpdate
}) => {
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [showCourtSettings, setShowCourtSettings] = useState(false);
  const [tempCourtCount, setTempCourtCount] = useState(session.courtCount || 1);

  if (!isOrganizer) {
    return null;
  }

  const handleAddPlayer = () => {
    if (!newPlayerName.trim()) {
      Alert.alert('Error', 'Please enter a player name');
      return;
    }

    // Check for duplicate names
    const existingPlayer = session.players.find(
      p => p.name.toLowerCase() === newPlayerName.toLowerCase()
    );
    
    if (existingPlayer) {
      Alert.alert('Error', 'A player with this name already exists');
      return;
    }

    onPlayerAdd(newPlayerName.trim());
    setNewPlayerName('');
    setShowAddPlayer(false);
  };

  const handleRemovePlayer = (player: Player) => {
    // Don't allow removing the organizer
    if (player.role === 'ORGANIZER' || player.name === session.ownerName) {
      Alert.alert('Error', 'Cannot remove the session organizer');
      return;
    }

    Alert.alert(
      'Remove Player',
      `Are you sure you want to remove ${player.name} from the session?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onPlayerRemove(player.id)
        }
      ]
    );
  };

  const handleTerminateSession = () => {
    Alert.alert(
      'Terminate Session',
      'Are you sure you want to terminate this session? All players will be notified.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Terminate',
          style: 'destructive',
          onPress: onSessionTerminate
        }
      ]
    );
  };

  const handleUpdateCourtCount = () => {
    if (tempCourtCount < 1 || tempCourtCount > 10) {
      Alert.alert('Error', 'Court count must be between 1 and 10');
      return;
    }

    onCourtCountUpdate(tempCourtCount);
    setShowCourtSettings(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⭐ Organizer Controls</Text>
      
      <View style={styles.buttonGroup}>
        {/* Add Player */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => setShowAddPlayer(true)}
        >
          <Text style={styles.buttonText}>➕ Add Player</Text>
        </TouchableOpacity>

        {/* Court Settings */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => setShowCourtSettings(true)}
        >
          <Text style={styles.buttonText}>🏸 Courts ({session.courtCount})</Text>
        </TouchableOpacity>

        {/* Terminate Session */}
        <TouchableOpacity
          style={[styles.button, styles.dangerButton]}
          onPress={handleTerminateSession}
        >
          <Text style={[styles.buttonText, styles.dangerButtonText]}>🛑 End Session</Text>
        </TouchableOpacity>
      </View>

      {/* Player List with Remove Buttons */}
      <View style={styles.playerList}>
        <Text style={styles.sectionTitle}>Players ({session.players.length}/{session.maxPlayers})</Text>
        {session.players.map(player => (
          <View key={player.id} style={styles.playerRow}>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>
                {player.role === 'ORGANIZER' ? '⭐ ' : ''}
                {player.name}
              </Text>
              <Text style={styles.playerStats}>
                {player.gamesPlayed} games • {player.wins}W/{player.losses}L • {player.status}
              </Text>
            </View>
            {player.role !== 'ORGANIZER' && player.name !== session.ownerName && (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemovePlayer(player)}
              >
                <Text style={styles.removeButtonText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      {/* Add Player Modal */}
      <Modal
        visible={showAddPlayer}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddPlayer(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Player</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter player name"
              value={newPlayerName}
              onChangeText={setNewPlayerName}
              autoFocus
              maxLength={100}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowAddPlayer(false);
                  setNewPlayerName('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleAddPlayer}
              >
                <Text style={styles.confirmButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Court Settings Modal */}
      <Modal
        visible={showCourtSettings}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCourtSettings(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Update Court Count</Text>
            <Text style={styles.modalDescription}>
              Set the number of available courts for this session
            </Text>
            <View style={styles.courtCountSelector}>
              <TouchableOpacity
                style={styles.countButton}
                onPress={() => setTempCourtCount(Math.max(1, tempCourtCount - 1))}
              >
                <Text style={styles.countButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.courtCountText}>{tempCourtCount}</Text>
              <TouchableOpacity
                style={styles.countButton}
                onPress={() => setTempCourtCount(Math.min(10, tempCourtCount + 1))}
              >
                <Text style={styles.countButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowCourtSettings(false);
                  setTempCourtCount(session.courtCount);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleUpdateCourtCount}
              >
                <Text style={styles.confirmButtonText}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF8DC',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 12,
  },
  buttonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    minWidth: '30%',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#FF5252',
  },
  dangerButtonText: {
    color: 'white',
  },
  playerList: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'white',
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  playerStats: {
    fontSize: 12,
    color: '#666',
  },
  removeButton: {
    backgroundColor: '#FF5252',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  courtCountSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 20,
  },
  countButton: {
    backgroundColor: '#2196F3',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  courtCountText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    minWidth: 60,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
