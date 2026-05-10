import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { matchesApi, MatchSubmission, MatchResult } from '../services/matchesApi';
import { sessionApi } from '../services/sessionApi';
import { DEVICE_ID_KEY } from '../config/api';

type RootStackParamList = {
  SessionDetail: { sessionId: string; shareCode: string };
  MatchRecording: { sessionId: string; shareCode: string };
};

type MatchRecordingScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'MatchRecording'
>;

type MatchRecordingScreenRouteProp = RouteProp<
  RootStackParamList,
  'MatchRecording'
>;

interface Player {
  id: string;
  name: string;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
}

interface Session {
  id: string;
  name: string;
  players: Player[];
  ownerDeviceId?: string;
}

const MatchRecordingScreen: React.FC = () => {
  const navigation = useNavigation<MatchRecordingScreenNavigationProp>();
  const route = useRoute<MatchRecordingScreenRouteProp>();
  const { sessionId, shareCode } = route.params;
  const [deviceId, setDeviceId] = useState<string>('');

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPlayer1, setSelectedPlayer1] = useState<Player | null>(null);
  const [selectedPlayer2, setSelectedPlayer2] = useState<Player | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<Player | null>(null);
  const [scoreType, setScoreType] = useState<'2-0' | '2-1'>('2-0');
  const [matches, setMatches] = useState<MatchResult[]>([]);

  useEffect(() => {
    const initializeScreen = async () => {
      // Get device ID
      const storedDeviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (storedDeviceId) {
        setDeviceId(storedDeviceId);
      }

      loadSessionData();
      loadMatches();
    };

    initializeScreen();

    // Set up real-time listeners
    const cleanupMatchRecorded = matchesApi.addMatchListener('match_recorded', (data) => {
      console.log('Match recorded:', data);
      loadMatches(); // Refresh matches list
    });

    const cleanupMatchApproved = matchesApi.addMatchListener('match_approved', (data) => {
      console.log('Match approved:', data);
      loadMatches(); // Refresh matches list
    });

    return () => {
      cleanupMatchRecorded();
      cleanupMatchApproved();
    };
  }, [sessionId]);

  const loadSessionData = async () => {
    try {
      const sessionData = await sessionApi.getSessionByShareCode(shareCode);
      setSession(sessionData.data.session);
    } catch (error) {
      console.error('Error loading session:', error);
      Alert.alert('Error', 'Failed to load session data');
    } finally {
      setLoading(false);
    }
  };

  const loadMatches = async () => {
    try {
      const matchesData = await matchesApi.getSessionMatches(sessionId, deviceId);
      setMatches(matchesData.data.matches);
    } catch (error) {
      console.error('Error loading matches:', error);
    }
  };

  const handlePlayerSelect = (player: Player, position: 1 | 2) => {
    if (position === 1) {
      setSelectedPlayer1(player);
      if (selectedPlayer2?.id === player.id) {
        setSelectedPlayer2(null);
      }
    } else {
      setSelectedPlayer2(player);
      if (selectedPlayer1?.id === player.id) {
        setSelectedPlayer1(null);
      }
    }
    setSelectedWinner(null); // Reset winner when players change
  };

  const handleSubmitMatch = async () => {
    if (!selectedPlayer1 || !selectedPlayer2 || !selectedWinner) {
      Alert.alert('Error', 'Please select both players and a winner');
      return;
    }

    if (selectedPlayer1.id === selectedPlayer2.id) {
      Alert.alert('Error', 'Please select two different players');
      return;
    }

    setSubmitting(true);
    try {
      const matchData: MatchSubmission = {
        sessionId,
        player1Id: selectedPlayer1.id,
        player2Id: selectedPlayer2.id,
        winnerId: selectedWinner.id,
        scoreType,
        deviceId,
      };

      const result = await matchesApi.recordMatch(matchData);

      if (result.success) {
        Alert.alert(
          'Success',
          result.data.requiresApproval
            ? 'Match recorded and sent for approval'
            : 'Match recorded successfully'
        );

        // Reset form
        setSelectedPlayer1(null);
        setSelectedPlayer2(null);
        setSelectedWinner(null);
        setScoreType('2-0');

        // Refresh matches list
        loadMatches();
      }
    } catch (error) {
      console.error('Error submitting match:', error);
      Alert.alert('Error', 'Failed to record match. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getActivePlayers = () => {
    return session?.players.filter(p => p.status === 'ACTIVE') || [];
  };

  const isOrganizer = session?.ownerDeviceId === deviceId;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading session...</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load session</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={loadSessionData}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activePlayers = getActivePlayers();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Record Match Result</Text>
        <Text style={styles.subtitle}>{session.name}</Text>
      </View>

      {/* Player Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Players</Text>

        <View style={styles.playerSelection}>
          <View style={styles.playerSlot}>
            <Text style={styles.playerLabel}>Player 1:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {activePlayers.map((player) => (
                <TouchableOpacity
                  key={player.id}
                  style={[
                    styles.playerButton,
                    selectedPlayer1?.id === player.id && styles.selectedPlayerButton
                  ]}
                  onPress={() => handlePlayerSelect(player, 1)}
                >
                  <Text style={[
                    styles.playerButtonText,
                    selectedPlayer1?.id === player.id && styles.selectedPlayerButtonText
                  ]}>
                    {player.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.playerSlot}>
            <Text style={styles.playerLabel}>Player 2:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {activePlayers.map((player) => (
                <TouchableOpacity
                  key={player.id}
                  style={[
                    styles.playerButton,
                    selectedPlayer2?.id === player.id && styles.selectedPlayerButton
                  ]}
                  onPress={() => handlePlayerSelect(player, 2)}
                >
                  <Text style={[
                    styles.playerButtonText,
                    selectedPlayer2?.id === player.id && styles.selectedPlayerButtonText
                  ]}>
                    {player.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </View>

      {/* Winner Selection */}
      {(selectedPlayer1 && selectedPlayer2) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Winner</Text>
          <View style={styles.winnerSelection}>
            <TouchableOpacity
              style={[
                styles.winnerButton,
                selectedWinner?.id === selectedPlayer1.id && styles.selectedWinnerButton
              ]}
              onPress={() => setSelectedWinner(selectedPlayer1)}
            >
              <Text style={[
                styles.winnerButtonText,
                selectedWinner?.id === selectedPlayer1.id && styles.selectedWinnerButtonText
              ]}>
                {selectedPlayer1.name}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.winnerButton,
                selectedWinner?.id === selectedPlayer2.id && styles.selectedWinnerButton
              ]}
              onPress={() => setSelectedWinner(selectedPlayer2)}
            >
              <Text style={[
                styles.winnerButtonText,
                selectedWinner?.id === selectedPlayer2.id && styles.selectedWinnerButtonText
              ]}>
                {selectedPlayer2.name}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Score Type Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Score Type</Text>
        <View style={styles.scoreTypeSelection}>
          <TouchableOpacity
            style={[
              styles.scoreTypeButton,
              scoreType === '2-0' && styles.selectedScoreTypeButton
            ]}
            onPress={() => setScoreType('2-0')}
          >
            <Text style={[
              styles.scoreTypeButtonText,
              scoreType === '2-0' && styles.selectedScoreTypeButtonText
            ]}>
              2-0
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.scoreTypeButton,
              scoreType === '2-1' && styles.selectedScoreTypeButton
            ]}
            onPress={() => setScoreType('2-1')}
          >
            <Text style={[
              styles.scoreTypeButtonText,
              scoreType === '2-1' && styles.selectedScoreTypeButtonText
            ]}>
              2-1
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Submit Button */}
      <View style={styles.section}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            (!selectedPlayer1 || !selectedPlayer2 || !selectedWinner || submitting) && styles.disabledButton
          ]}
          onPress={handleSubmitMatch}
          disabled={!selectedPlayer1 || !selectedPlayer2 || !selectedWinner || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>
              Record Match
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Recent Matches */}
      {matches.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Matches</Text>
          {matches.slice(0, 5).map((match) => (
            <View key={match.id} style={styles.matchItem}>
              <Text style={styles.matchText}>
                {match.player1.name} vs {match.player2.name}
              </Text>
              <Text style={styles.matchWinner}>
                Winner: {match.winner.name} ({match.scoreType})
              </Text>
              <Text style={styles.matchTime}>
                {new Date(match.recordedAt).toLocaleTimeString()}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
  },
  section: {
    backgroundColor: '#FFFFFF',
    margin: 10,
    padding: 15,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 15,
  },
  playerSelection: {
    marginBottom: 10,
  },
  playerSlot: {
    marginBottom: 15,
  },
  playerLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333333',
    marginBottom: 8,
  },
  playerButton: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedPlayerButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  playerButtonText: {
    fontSize: 14,
    color: '#333333',
  },
  selectedPlayerButtonText: {
    color: '#FFFFFF',
  },
  winnerSelection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  winnerButton: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 120,
    alignItems: 'center',
  },
  selectedWinnerButton: {
    backgroundColor: '#28A745',
    borderColor: '#28A745',
  },
  winnerButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333333',
  },
  selectedWinnerButtonText: {
    color: '#FFFFFF',
  },
  scoreTypeSelection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  scoreTypeButton: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 80,
    alignItems: 'center',
  },
  selectedScoreTypeButton: {
    backgroundColor: '#17A2B8',
    borderColor: '#17A2B8',
  },
  scoreTypeButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333333',
  },
  selectedScoreTypeButtonText: {
    color: '#FFFFFF',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#CCCCCC',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  matchItem: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  matchText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333333',
  },
  matchWinner: {
    fontSize: 12,
    color: '#28A745',
    fontWeight: '500',
    marginTop: 2,
  },
  matchTime: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666666',
  },
  errorText: {
    fontSize: 18,
    color: '#DC3545',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default MatchRecordingScreen;