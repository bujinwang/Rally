import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { matchesApi, MatchSubmission } from '../services/matchesApi';
import DeviceService from '../services/deviceService';

interface Player {
  id: string;
  name: string;
}

const QuickScoreRecordingScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { sessionId, player1Id, player2Id } = route.params as {
    sessionId: string;
    player1Id: string;
    player2Id: string;
  };

  const [isLoading, setIsLoading] = useState(false);
  const [players, setPlayers] = useState<{ player1: Player; player2: Player } | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [selectedScoreType, setSelectedScoreType] = useState<'2-0' | '2-1' | null>(null);

  // Load player information
  useEffect(() => {
    loadPlayerInfo();
  }, [player1Id, player2Id]);

  const loadPlayerInfo = async () => {
    try {
      setIsLoading(true);

      // For MVP, create placeholder player objects
      // In production, fetch from API
      const player1: Player = {
        id: player1Id,
        name: `Player ${player1Id.slice(-4)}`
      };

      const player2: Player = {
        id: player2Id,
        name: `Player ${player2Id.slice(-4)}`
      };

      setPlayers({ player1, player2 });
    } catch (error) {
      console.error('Error loading player info:', error);
      Alert.alert('Error', 'Failed to load player information');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayerSelect = (playerId: string) => {
    setSelectedWinner(playerId);
  };

  const handleScoreTypeSelect = (scoreType: '2-0' | '2-1') => {
    setSelectedScoreType(scoreType);
  };

  const handleRecordMatch = async () => {
    if (!selectedWinner || !selectedScoreType || !players) {
      Alert.alert('Incomplete Selection', 'Please select both a winner and score type.');
      return;
    }

    try {
      setIsLoading(true);

      const deviceId = await DeviceService.getDeviceId();
      const matchData: MatchSubmission = {
        sessionId,
        player1Id: players.player1.id,
        player2Id: players.player2.id,
        winnerId: selectedWinner,
        scoreType: selectedScoreType,
        deviceId,
      };

      const result = await matchesApi.recordMatch(matchData);

      if (result.success) {
        const winnerName = selectedWinner === players.player1.id
          ? players.player1.name
          : players.player2.name;

        Alert.alert(
          'Match Recorded!',
          `${winnerName} won ${selectedScoreType}${result.data.requiresApproval ? ' (Pending approval)' : ''}`,
          [
            {
              text: 'Record Another',
              onPress: () => {
                // Reset form
                setSelectedWinner(null);
                setSelectedScoreType(null);
              },
            },
            {
              text: 'Done',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error recording match:', error);
      Alert.alert('Error', 'Failed to record match. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const canRecordMatch = selectedWinner && selectedScoreType && !isLoading;

  if (isLoading && !players) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading match setup...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!players) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#ff6b6b" />
          <Text style={styles.errorText}>Failed to load player information</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadPlayerInfo}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quick Score</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Match Info */}
      <View style={styles.matchInfo}>
        <Text style={styles.matchTitle}>
          {players.player1.name} vs {players.player2.name}
        </Text>
        <Text style={styles.matchSubtitle}>
          Select winner and score type
        </Text>
      </View>

      {/* Winner Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Who won?</Text>
        <View style={styles.playerSelection}>
          <TouchableOpacity
            style={[
              styles.playerButton,
              selectedWinner === players.player1.id && styles.selectedPlayerButton
            ]}
            onPress={() => handlePlayerSelect(players.player1.id)}
          >
            <Text style={[
              styles.playerButtonText,
              selectedWinner === players.player1.id && styles.selectedPlayerButtonText
            ]}>
              {players.player1.name}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.playerButton,
              selectedWinner === players.player2.id && styles.selectedPlayerButton
            ]}
            onPress={() => handlePlayerSelect(players.player2.id)}
          >
            <Text style={[
              styles.playerButtonText,
              selectedWinner === players.player2.id && styles.selectedPlayerButtonText
            ]}>
              {players.player2.name}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Score Type Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Score type?</Text>
        <View style={styles.scoreTypeSelection}>
          <TouchableOpacity
            style={[
              styles.scoreTypeButton,
              selectedScoreType === '2-0' && styles.selectedScoreTypeButton
            ]}
            onPress={() => handleScoreTypeSelect('2-0')}
          >
            <Text style={[
              styles.scoreTypeButtonText,
              selectedScoreType === '2-0' && styles.selectedScoreTypeButtonText
            ]}>
              2-0
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.scoreTypeButton,
              selectedScoreType === '2-1' && styles.selectedScoreTypeButton
            ]}
            onPress={() => handleScoreTypeSelect('2-1')}
          >
            <Text style={[
              styles.scoreTypeButtonText,
              selectedScoreType === '2-1' && styles.selectedScoreTypeButtonText
            ]}>
              2-1
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Record Match Button */}
      <View style={styles.recordButtonContainer}>
        <TouchableOpacity
          style={[
            styles.recordButton,
            !canRecordMatch && styles.disabledRecordButton
          ]}
          onPress={handleRecordMatch}
          disabled={!canRecordMatch}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.recordButtonText}>Record Match</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  headerRight: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  matchInfo: {
    backgroundColor: 'white',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  matchTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  matchSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    backgroundColor: 'white',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  playerSelection: {
    flexDirection: 'row',
    gap: 12,
  },
  playerButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  selectedPlayerButton: {
    borderColor: '#007AFF',
    backgroundColor: '#007AFF',
  },
  playerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  selectedPlayerButtonText: {
    color: 'white',
  },
  scoreTypeSelection: {
    flexDirection: 'row',
    gap: 12,
  },
  scoreTypeButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  selectedScoreTypeButton: {
    borderColor: '#4CAF50',
    backgroundColor: '#4CAF50',
  },
  scoreTypeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  selectedScoreTypeButtonText: {
    color: 'white',
  },
  recordButtonContainer: {
    margin: 16,
    marginTop: 0,
  },
  recordButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledRecordButton: {
    backgroundColor: '#ccc',
  },
  recordButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default QuickScoreRecordingScreen;