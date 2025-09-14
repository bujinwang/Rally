import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSession } from '../../contexts/SessionContext';
import socketService from '../../services/socketService';
import pairingApiService, { Pairing, PairingResult } from '../../services/pairingApi';

interface Player {
  id: string;
  name: string;
  gamesPlayed: number;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
}

interface Court {
  id: string;
  name: string;
  players: Player[];
  maxPlayers: number;
}

const CourtCard = ({
  court,
  onPlayerRemove
}: {
  court: Court;
  onPlayerRemove: (courtId: string, playerId: string) => void;
}) => (
  <View style={styles.courtCard}>
    <Text style={styles.courtName}>{court.name}</Text>
    <View style={styles.courtPlayers}>
      {court.players.map((player) => (
        <TouchableOpacity
          key={player.id}
          style={styles.playerChip}
          onPress={() => onPlayerRemove(court.id, player.id)}
        >
          <Text style={styles.playerChipText}>{player.name}</Text>
          <Text style={styles.removeText}>×</Text>
        </TouchableOpacity>
      ))}
      {Array.from({ length: court.maxPlayers - court.players.length }).map((_, index) => (
        <View key={`empty-${index}`} style={[styles.playerChip, styles.emptySlot]}>
          <Text style={styles.emptySlotText}>空位</Text>
        </View>
      ))}
    </View>
  </View>
);

const PlayerCard = ({
  player,
  onAddToCourt
}: {
  player: Player;
  onAddToCourt: (player: Player) => void;
}) => (
  <TouchableOpacity
    style={styles.playerCard}
    onPress={() => onAddToCourt(player)}
  >
    <Text style={styles.playerName}>{player.name}</Text>
    <Text style={styles.playerGames}>{player.gamesPlayed} 局</Text>
  </TouchableOpacity>
);

const PairingScreen = () => {
  const navigation = useNavigation();
  const { session, currentUser, isOrganizer } = useSession();
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [fairnessScore, setFairnessScore] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convert pairings to courts format for UI
  const courts: Court[] = pairings.map((pairing, index) => ({
    id: pairing.id,
    name: `Court ${pairing.court}`,
    players: pairing.players.map(p => ({
      id: p.id,
      name: p.name,
      gamesPlayed: 0, // Will be populated from session data
      status: 'ACTIVE' as const
    })),
    maxPlayers: 2
  }));

  // Load pairings on component mount
  useEffect(() => {
    if (session?.id) {
      loadPairings();
      setupSocketListeners();
    }

    return () => {
      cleanupSocketListeners();
    };
  }, [session?.id]);

  const loadPairings = async () => {
    if (!session?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await pairingApiService.getPairings(session.id);
      setPairings(result.pairings);
      setFairnessScore(result.fairnessScore);

      // Update available players from session data
      const sessionPlayers = session.players || [];
      const activePlayers = sessionPlayers.filter(p => p.status === 'ACTIVE');
      setAvailablePlayers(activePlayers.map(p => ({
        id: p.id,
        name: p.name,
        gamesPlayed: p.gamesPlayed || 0,
        status: p.status
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pairings');
    } finally {
      setIsLoading(false);
    }
  };

  const setupSocketListeners = () => {
    socketService.on('pairings_updated', handlePairingsUpdate);
    socketService.on('pairing_adjusted', handlePairingAdjustment);
  };

  const cleanupSocketListeners = () => {
    socketService.off('pairings_updated', handlePairingsUpdate);
    socketService.off('pairing_adjusted', handlePairingAdjustment);
  };

  const handlePairingsUpdate = (data: any) => {
    if (data.sessionId === session?.id) {
      setPairings(data.pairings);
      setFairnessScore(data.fairnessScore);
    }
  };

  const handlePairingAdjustment = (data: any) => {
    if (data.sessionId === session?.id) {
      // Refresh pairings to get updated data
      loadPairings();
    }
  };

  const generatePairings = async (algorithm: 'fair' | 'random' | 'skill_based' = 'fair') => {
    if (!session?.id || !isOrganizer) {
      Alert.alert('Error', 'Only organizers can generate pairings');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await pairingApiService.generatePairings(session.id, algorithm);
      setPairings(result.pairings);
      setFairnessScore(result.fairnessScore);

      if (result.oddPlayerOut) {
        Alert.alert('Notice', `Player ${result.oddPlayerOut} is sitting out this round`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate pairings');
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to generate pairings');
    } finally {
      setIsLoading(false);
    }
  };

  const clearPairings = async () => {
    if (!session?.id || !isOrganizer) {
      Alert.alert('Error', 'Only organizers can clear pairings');
      return;
    }

    Alert.alert(
      'Clear Pairings',
      'Are you sure you want to clear all pairings?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              await pairingApiService.clearPairings(session.id);
              setPairings([]);
              setFairnessScore(0);
              await loadPairings(); // Refresh to get updated available players
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to clear pairings');
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to clear pairings');
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const adjustPairing = async (pairingId: string, players: { id: string; name: string }[]) => {
    if (!session?.id || !isOrganizer) {
      Alert.alert('Error', 'Only organizers can adjust pairings');
      return;
    }

    setIsLoading(true);
    try {
      await pairingApiService.adjustPairing(session.id, pairingId, { players });
      await loadPairings(); // Refresh to get updated pairings
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to adjust pairing');
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to adjust pairing');
    } finally {
      setIsLoading(false);
    }
  };

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>No active session found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Pairing Management</Text>
        <View style={styles.fairnessContainer}>
          <Text style={styles.fairnessText}>Fairness: {fairnessScore}%</Text>
        </View>
        {isOrganizer && (
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={[styles.autoButton, isLoading && styles.disabledButton]}
              onPress={() => generatePairings('fair')}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.autoButtonText}>Generate Fair</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.resetButton, isLoading && styles.disabledButton]}
              onPress={clearPairings}
              disabled={isLoading}
            >
              <Text style={styles.resetButtonText}>Clear All</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Courts Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Courts ({courts.length})</Text>
          {courts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {isOrganizer ? 'Tap "Generate Fair" to create pairings' : 'Waiting for organizer to generate pairings'}
              </Text>
            </View>
          ) : (
            courts.map((court) => (
              <CourtCard
                key={court.id}
                court={court}
                onPlayerRemove={(courtId, playerId) => {
                  // For now, just show that manual adjustments would go here
                  Alert.alert('Manual Adjustment', 'Manual pairing adjustments will be implemented in the next update');
                }}
              />
            ))
          )}
        </View>

        {/* Available Players Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Players ({availablePlayers.length})</Text>
          {availablePlayers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>All players are currently paired or unavailable</Text>
            </View>
          ) : (
            <View style={styles.playersGrid}>
              {availablePlayers.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  onAddToCourt={() => {
                    // For now, just show that manual additions would go here
                    Alert.alert('Manual Addition', 'Manual player additions will be implemented in the next update');
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  fairnessContainer: {
    marginBottom: 12,
  },
  fairnessText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'center',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  autoButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
  },
  autoButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  resetButton: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
  },
  resetButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorContainer: {
    backgroundColor: '#f8d7da',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f5c6cb',
  },
  errorText: {
    color: '#721c24',
    fontSize: 14,
    textAlign: 'center',
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  courtCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  courtName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  courtPlayers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  playerChip: {
    backgroundColor: '#007AFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playerChipText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  removeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptySlot: {
    backgroundColor: '#f0f0f0',
  },
  emptySlotText: {
    color: '#999',
    fontSize: 12,
  },
  playersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  playerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  playerGames: {
    fontSize: 12,
    color: '#666',
  },
});

export default PairingScreen;