import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';

interface Player {
  id: string;
  name: string;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
  gamesPlayed: number;
  wins: number;
  losses: number;
  priority?: number;
}

interface GameSuggestion {
  court: {
    id: string;
    name: string;
    isAvailable: boolean;
  };
  team1: [Player, Player];
  team2: [Player, Player];
  fairnessScore: number;
  fairnessReasons: string[];
}

interface RotationData {
  suggestedGames: GameSuggestion[];
  nextInLine: Player[];
  fairnessMetrics: {
    averageGamesPlayed: number;
    gameVariance: number;
  };
}

interface PairingGeneratorPanelProps {
  sessionShareCode: string;
  courtCount: number;
  activePlayers: Player[];
  isOrganizer: boolean;
  onGeneratePairings: () => Promise<RotationData>;
  onCreateGames: (games: GameSuggestion[]) => Promise<void>;
}

export const PairingGeneratorPanel: React.FC<PairingGeneratorPanelProps> = ({
  sessionShareCode,
  courtCount,
  activePlayers,
  isOrganizer,
  onGeneratePairings,
  onCreateGames
}) => {
  const [loading, setLoading] = useState(false);
  const [rotation, setRotation] = useState<RotationData | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  if (!isOrganizer) {
    return null;
  }

  const handleGeneratePairings = async () => {
    try {
      setLoading(true);
      const rotationData = await onGeneratePairings();
      setRotation(rotationData);
      setShowPreview(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to generate pairings. Please try again.');
      console.error('Generate pairings error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmGames = async () => {
    if (!rotation || rotation.suggestedGames.length === 0) {
      Alert.alert('Error', 'No games to create');
      return;
    }

    Alert.alert(
      'Confirm Games',
      `Create ${rotation.suggestedGames.length} game(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async () => {
            try {
              setLoading(true);
              await onCreateGames(rotation.suggestedGames);
              setRotation(null);
              setShowPreview(false);
              Alert.alert('Success', 'Games created successfully!');
            } catch (error) {
              Alert.alert('Error', 'Failed to create games. Please try again.');
              console.error('Create games error:', error);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const availablePlayers = activePlayers.filter(p => p.status === 'ACTIVE').length;
  const canGeneratePairings = availablePlayers >= 4;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎯 Game Pairing Generator</Text>

      {/* Status Info */}
      <View style={styles.statusBox}>
        <Text style={styles.statusText}>
          ✓ {availablePlayers} active players • {courtCount} court{courtCount !== 1 ? 's' : ''}
        </Text>
        {!canGeneratePairings && (
          <Text style={styles.warningText}>
            ⚠️ Need at least 4 active players
          </Text>
        )}
      </View>

      {/* Generate Button */}
      <TouchableOpacity
        style={[
          styles.generateButton,
          (!canGeneratePairings || loading) && styles.disabledButton
        ]}
        onPress={handleGeneratePairings}
        disabled={!canGeneratePairings || loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.generateButtonText}>
            🔄 Generate Fair Pairings
          </Text>
        )}
      </TouchableOpacity>

      {/* Preview */}
      {showPreview && rotation && (
        <View style={styles.previewContainer}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>
              Suggested Games ({rotation.suggestedGames.length})
            </Text>
            <TouchableOpacity
              onPress={() => setShowPreview(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Fairness Metrics */}
          <View style={styles.metricsBox}>
            <Text style={styles.metricsTitle}>Fairness Metrics:</Text>
            <Text style={styles.metricsText}>
              Avg Games: {rotation.fairnessMetrics.averageGamesPlayed.toFixed(1)}
            </Text>
            <Text style={styles.metricsText}>
              Balance: {(100 - rotation.fairnessMetrics.gameVariance * 10).toFixed(0)}%
            </Text>
          </View>

          {/* Game Suggestions */}
          <ScrollView style={styles.gamesScroll}>
            {rotation.suggestedGames.map((game, index) => (
              <View key={index} style={styles.gameCard}>
                <Text style={styles.courtName}>{game.court.name}</Text>
                
                {/* Team 1 */}
                <View style={styles.teamBox}>
                  <Text style={styles.teamLabel}>Team 1</Text>
                  <Text style={styles.playerText}>
                    {game.team1[0].name} & {game.team1[1].name}
                  </Text>
                  <Text style={styles.statsText}>
                    {game.team1[0].gamesPlayed + game.team1[1].gamesPlayed} combined games
                  </Text>
                </View>

                {/* VS */}
                <Text style={styles.vsText}>VS</Text>

                {/* Team 2 */}
                <View style={styles.teamBox}>
                  <Text style={styles.teamLabel}>Team 2</Text>
                  <Text style={styles.playerText}>
                    {game.team2[0].name} & {game.team2[1].name}
                  </Text>
                  <Text style={styles.statsText}>
                    {game.team2[0].gamesPlayed + game.team2[1].gamesPlayed} combined games
                  </Text>
                </View>

                {/* Fairness Score */}
                <View style={styles.fairnessBox}>
                  <Text style={styles.fairnessScore}>
                    Fairness: {game.fairnessScore.toFixed(0)}%
                  </Text>
                  {game.fairnessReasons.map((reason, i) => (
                    <Text key={i} style={styles.fairnessReason}>
                      • {reason}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Next in Line */}
          {rotation.nextInLine.length > 0 && (
            <View style={styles.nextInLineBox}>
              <Text style={styles.nextInLineTitle}>
                Next in Queue ({rotation.nextInLine.length}):
              </Text>
              <Text style={styles.nextInLineText}>
                {rotation.nextInLine.map(p => p.name).join(', ')}
              </Text>
            </View>
          )}

          {/* Confirm Button */}
          <TouchableOpacity
            style={styles.confirmButton}
            onPress={handleConfirmGames}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.confirmButtonText}>
                ✓ Create These Games
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 12,
  },
  statusBox: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  statusText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  warningText: {
    fontSize: 13,
    color: '#FF9800',
    marginTop: 4,
  },
  generateButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#BDBDBD',
  },
  generateButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  previewContainer: {
    marginTop: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#666',
  },
  metricsBox: {
    backgroundColor: '#F5F5F5',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  metricsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  metricsText: {
    fontSize: 12,
    color: '#333',
  },
  gamesScroll: {
    maxHeight: 400,
  },
  gameCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  courtName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 8,
  },
  teamBox: {
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  teamLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  playerText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  statsText: {
    fontSize: 12,
    color: '#999',
  },
  vsText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF9800',
    marginVertical: 4,
  },
  fairnessBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
  },
  fairnessScore: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 4,
  },
  fairnessReason: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  nextInLineBox: {
    backgroundColor: '#FFF3E0',
    borderRadius: 6,
    padding: 10,
    marginVertical: 12,
  },
  nextInLineTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F57C00',
    marginBottom: 4,
  },
  nextInLineText: {
    fontSize: 13,
    color: '#666',
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
