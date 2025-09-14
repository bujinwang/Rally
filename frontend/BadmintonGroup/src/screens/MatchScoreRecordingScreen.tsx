import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

// Import types and services
import {
  DetailedMatchData,
  MatchSet,
  MatchRecordingState,
} from '../types/statistics';
import { statisticsApi } from '../services/statisticsApi';
import { sessionApi } from '../services/sessionApi';

const { width } = Dimensions.get('window');

interface Player {
  id: string;
  name: string;
}

const MatchScoreRecordingScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { sessionId, player1Id, player2Id } = route.params as {
    sessionId: string;
    player1Id: string;
    player2Id: string;
  };

  // State management
  const [isLoading, setIsLoading] = useState(false);
  const [players, setPlayers] = useState<{ player1: Player; player2: Player } | null>(null);
  const [recordingState, setRecordingState] = useState<MatchRecordingState>({
    currentSet: 1,
    player1Score: 0,
    player2Score: 0,
    sets: [],
    isRecording: false,
  });

  const [scoringSystem, setScoringSystem] = useState<'21_POINT' | '15_POINT' | '11_POINT'>('21_POINT');
  const [bestOfGames, setBestOfGames] = useState<1 | 3 | 5>(3);

  // Load player information
  useEffect(() => {
    loadPlayerInfo();
  }, [player1Id, player2Id]);

  const loadPlayerInfo = async () => {
    try {
      setIsLoading(true);

      // For now, create placeholder player objects
      // In a real implementation, you'd fetch player details from the API
      const player1: Player = {
        id: player1Id,
        name: `Player ${player1Id.slice(-4)}` // Use last 4 chars as display name
      };

      const player2: Player = {
        id: player2Id,
        name: `Player ${player2Id.slice(-4)}` // Use last 4 chars as display name
      };

      setPlayers({ player1, player2 });
    } catch (error) {
      console.error('Error loading player info:', error);
      Alert.alert('Error', 'Failed to load player information');
    } finally {
      setIsLoading(false);
    }
  };

  // Score increment/decrement functions
  const incrementScore = (player: 'player1' | 'player2') => {
    setRecordingState(prev => ({
      ...prev,
      [`${player}Score`]: prev[`${player}Score`] + 1,
    }));
  };

  const decrementScore = (player: 'player1' | 'player2') => {
    setRecordingState(prev => ({
      ...prev,
      [`${player}Score`]: Math.max(0, prev[`${player}Score`] - 1),
    }));
  };

  // Check if current set is complete
  const isSetComplete = () => {
    const maxPoints = scoringSystem === '21_POINT' ? 21 : scoringSystem === '15_POINT' ? 15 : 11;
    const winMargin = 2;

    const p1Score = recordingState.player1Score;
    const p2Score = recordingState.player2Score;

    // Check if someone reached max points with win margin
    if (p1Score >= maxPoints && p1Score - p2Score >= winMargin) return true;
    if (p2Score >= maxPoints && p2Score - p1Score >= winMargin) return true;

    return false;
  };

  // Complete current set
  const completeSet = () => {
    if (!isSetComplete()) {
      Alert.alert('Set Not Complete', 'Neither player has reached the winning score yet.');
      return;
    }

    const winnerId = recordingState.player1Score > recordingState.player2Score
      ? players!.player1.id
      : players!.player2.id;

    const newSet: MatchSet = {
      setNumber: recordingState.currentSet,
      player1Score: recordingState.player1Score,
      player2Score: recordingState.player2Score,
      winnerId,
    };

    setRecordingState(prev => ({
      ...prev,
      sets: [...prev.sets, newSet],
      currentSet: prev.currentSet + 1,
      player1Score: 0,
      player2Score: 0,
    }));
  };

  // Check if match is complete
  const isMatchComplete = () => {
    const setsWonByPlayer1 = recordingState.sets.filter(set => set.winnerId === players!.player1.id).length;
    const setsWonByPlayer2 = recordingState.sets.filter(set => set.winnerId === players!.player2.id).length;

    const setsToWin = Math.ceil(bestOfGames / 2);
    return setsWonByPlayer1 >= setsToWin || setsWonByPlayer2 >= setsToWin;
  };

  // Complete match
  const completeMatch = async () => {
    if (!isMatchComplete()) {
      Alert.alert('Match Not Complete', `Need to win ${Math.ceil(bestOfGames / 2)} sets to complete the match.`);
      return;
    }

    try {
      setIsLoading(true);

      const matchData: DetailedMatchData = {
        sessionId,
        player1Id: players!.player1.id,
        player2Id: players!.player2.id,
        sets: recordingState.sets,
        scoringSystem,
        bestOfGames,
      };

      // Get device ID (simplified - in real app this would come from device fingerprinting)
      const deviceId = 'device-123'; // TODO: Get from device fingerprinting service

      const result = await statisticsApi.recordDetailedMatch(matchData, deviceId);

      Alert.alert(
        'Match Recorded!',
        'The match has been successfully recorded.',
        [
          {
            text: 'View Statistics',
            onPress: () => navigation.navigate('StatisticsDashboard' as never),
          },
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error recording match:', error);
      Alert.alert('Error', 'Failed to record match. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Undo last set
  const undoLastSet = () => {
    if (recordingState.sets.length === 0) return;

    const lastSet = recordingState.sets[recordingState.sets.length - 1];

    setRecordingState(prev => ({
      ...prev,
      sets: prev.sets.slice(0, -1),
      currentSet: prev.currentSet - 1,
      player1Score: lastSet.player1Score,
      player2Score: lastSet.player2Score,
    }));
  };

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

  const setsWonByPlayer1 = recordingState.sets.filter(set => set.winnerId === players.player1.id).length;
  const setsWonByPlayer2 = recordingState.sets.filter(set => set.winnerId === players.player2.id).length;

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
        <Text style={styles.headerTitle}>Score Recording</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Match Info */}
        <View style={styles.matchInfo}>
          <Text style={styles.matchTitle}>
            {players.player1.name} vs {players.player2.name}
          </Text>
          <Text style={styles.matchSubtitle}>
            Best of {bestOfGames} • {scoringSystem.replace('_', ' ')}
          </Text>
        </View>

        {/* Current Score */}
        <View style={styles.scoreContainer}>
          {/* Player 1 */}
          <View style={styles.playerSection}>
            <Text style={styles.playerName}>{players.player1.name}</Text>
            <Text style={styles.setsWon}>{setsWonByPlayer1}</Text>
            <Text style={styles.currentScore}>{recordingState.player1Score}</Text>

            <View style={styles.scoreControls}>
              <TouchableOpacity
                style={[styles.scoreButton, styles.minusButton]}
                onPress={() => decrementScore('player1')}
              >
                <Ionicons name="remove" size={24} color="white" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.scoreButton, styles.plusButton]}
                onPress={() => incrementScore('player1')}
              >
                <Ionicons name="add" size={24} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          {/* VS */}
          <View style={styles.vsContainer}>
            <Text style={styles.vsText}>VS</Text>
            <Text style={styles.setNumber}>Set {recordingState.currentSet}</Text>
          </View>

          {/* Player 2 */}
          <View style={styles.playerSection}>
            <Text style={styles.playerName}>{players.player2.name}</Text>
            <Text style={styles.setsWon}>{setsWonByPlayer2}</Text>
            <Text style={styles.currentScore}>{recordingState.player2Score}</Text>

            <View style={styles.scoreControls}>
              <TouchableOpacity
                style={[styles.scoreButton, styles.minusButton]}
                onPress={() => decrementScore('player2')}
              >
                <Ionicons name="remove" size={24} color="white" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.scoreButton, styles.plusButton]}
                onPress={() => incrementScore('player2')}
              >
                <Ionicons name="add" size={24} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.completeSetButton]}
            onPress={completeSet}
            disabled={!isSetComplete()}
          >
            <Text style={styles.actionButtonText}>Complete Set</Text>
          </TouchableOpacity>

          {recordingState.sets.length > 0 && (
            <TouchableOpacity
              style={[styles.actionButton, styles.undoButton]}
              onPress={undoLastSet}
            >
              <Text style={styles.undoButtonText}>Undo Last Set</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Completed Sets */}
        {recordingState.sets.length > 0 && (
          <View style={styles.completedSets}>
            <Text style={styles.sectionTitle}>Completed Sets</Text>
            {recordingState.sets.map((set, index) => (
              <View key={index} style={styles.setRow}>
                <Text style={styles.setText}>
                  Set {set.setNumber}: {set.player1Score}-{set.player2Score}
                </Text>
                <Text style={styles.winnerText}>
                  Winner: {set.winnerId === players.player1.id ? players.player1.name : players.player2.name}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Complete Match Button */}
        {isMatchComplete() && (
          <View style={styles.completeMatchContainer}>
            <TouchableOpacity
              style={[styles.actionButton, styles.completeMatchButton]}
              onPress={completeMatch}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.completeMatchButtonText}>Complete Match</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
  content: {
    flex: 1,
    padding: 16,
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
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
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
  scoreContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  playerSection: {
    flex: 1,
    alignItems: 'center',
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  setsWon: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 8,
  },
  currentScore: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  scoreControls: {
    flexDirection: 'row',
    gap: 12,
  },
  scoreButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  minusButton: {
    backgroundColor: '#ff6b6b',
  },
  plusButton: {
    backgroundColor: '#4CAF50',
  },
  vsContainer: {
    alignItems: 'center',
    marginHorizontal: 16,
  },
  vsText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 4,
  },
  setNumber: {
    fontSize: 14,
    color: '#666',
  },
  actionContainer: {
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  completeSetButton: {
    backgroundColor: '#4CAF50',
  },
  undoButton: {
    backgroundColor: '#ff9800',
  },
  undoButtonText: {
    color: 'white',
    fontSize: 14,
  },
  completedSets: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  setText: {
    fontSize: 16,
    color: '#333',
  },
  winnerText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  completeMatchContainer: {
    marginTop: 16,
  },
  completeMatchButton: {
    backgroundColor: '#9C27B0',
    paddingVertical: 16,
  },
  completeMatchButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default MatchScoreRecordingScreen;