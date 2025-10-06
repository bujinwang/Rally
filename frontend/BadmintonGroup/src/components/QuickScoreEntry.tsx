import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert } from 'react-native';

interface Match {
  id: string;
  matchNumber: number;
  team1Player1: string;
  team1Player2: string;
  team2Player1: string;
  team2Player2: string;
  courtName?: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
}

interface QuickScoreEntryProps {
  match: Match;
  visible: boolean;
  onClose: () => void;
  onSubmitScore: (matchId: string, team1Score: number, team2Score: number) => Promise<void>;
  recordedBy: string;
}

export const QuickScoreEntry: React.FC<QuickScoreEntryProps> = ({
  match,
  visible,
  onClose,
  onSubmitScore,
  recordedBy
}) => {
  const [team1Score, setTeam1Score] = useState<number | null>(null);
  const [team2Score, setTeam2Score] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const scoreOptions = [0, 1, 2];

  const handleSubmit = async () => {
    if (team1Score === null || team2Score === null) {
      Alert.alert('Error', 'Please select scores for both teams');
      return;
    }

    // Validate: must be 2-0 or 2-1
    if (team1Score + team2Score !== 2) {
      Alert.alert('Invalid Score', 'Match score must be 2-0 or 2-1 (best of 3 games)');
      return;
    }

    try {
      setSubmitting(true);
      await onSubmitScore(match.id, team1Score, team2Score);
      Alert.alert('Success', 'Score recorded successfully!');
      resetAndClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to record score. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setTeam1Score(null);
    setTeam2Score(null);
    onClose();
  };

  const isValidScore = (t1: number | null, t2: number | null): boolean => {
    if (t1 === null || t2 === null) return false;
    return t1 + t2 === 2;
  };

  const getScoreDisplay = (): string => {
    if (team1Score === null || team2Score === null) return '--';
    return `${team1Score}-${team2Score}`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={resetAndClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Record Match Score</Text>
            <TouchableOpacity onPress={resetAndClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Match Info */}
          <View style={styles.matchInfo}>
            <Text style={styles.matchNumber}>Match #{match.matchNumber}</Text>
            {match.courtName && (
              <Text style={styles.courtName}>{match.courtName}</Text>
            )}
          </View>

          {/* Team 1 */}
          <View style={styles.teamSection}>
            <Text style={styles.teamLabel}>Team 1</Text>
            <View style={styles.teamPlayers}>
              <Text style={styles.playerName}>{match.team1Player1}</Text>
              <Text style={styles.playerName}>{match.team1Player2}</Text>
            </View>
            
            <View style={styles.scoreButtons}>
              {scoreOptions.map(score => (
                <TouchableOpacity
                  key={`team1-${score}`}
                  style={[
                    styles.scoreButton,
                    team1Score === score && styles.scoreButtonSelected
                  ]}
                  onPress={() => setTeam1Score(score)}
                  disabled={submitting}
                >
                  <Text style={[
                    styles.scoreButtonText,
                    team1Score === score && styles.scoreButtonTextSelected
                  ]}>
                    {score}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* VS Divider */}
          <View style={styles.divider}>
            <Text style={styles.vsText}>VS</Text>
          </View>

          {/* Team 2 */}
          <View style={styles.teamSection}>
            <Text style={styles.teamLabel}>Team 2</Text>
            <View style={styles.teamPlayers}>
              <Text style={styles.playerName}>{match.team2Player1}</Text>
              <Text style={styles.playerName}>{match.team2Player2}</Text>
            </View>
            
            <View style={styles.scoreButtons}>
              {scoreOptions.map(score => (
                <TouchableOpacity
                  key={`team2-${score}`}
                  style={[
                    styles.scoreButton,
                    team2Score === score && styles.scoreButtonSelected
                  ]}
                  onPress={() => setTeam2Score(score)}
                  disabled={submitting}
                >
                  <Text style={[
                    styles.scoreButtonText,
                    team2Score === score && styles.scoreButtonTextSelected
                  ]}>
                    {score}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Score Preview */}
          <View style={styles.scorePreview}>
            <Text style={styles.scorePreviewLabel}>Final Score:</Text>
            <Text style={[
              styles.scorePreviewText,
              isValidScore(team1Score, team2Score) && styles.scorePreviewValid
            ]}>
              {getScoreDisplay()}
            </Text>
          </View>

          {/* Validation Message */}
          {team1Score !== null && team2Score !== null && !isValidScore(team1Score, team2Score) && (
            <Text style={styles.validationError}>
              ⚠️ Score must be 2-0 or 2-1 (best of 3)
            </Text>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={resetAndClose}
              disabled={submitting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.submitButton,
                (!isValidScore(team1Score, team2Score) || submitting) && styles.submitButtonDisabled
              ]}
              onPress={handleSubmit}
              disabled={!isValidScore(team1Score, team2Score) || submitting}
            >
              <Text style={styles.submitButtonText}>
                {submitting ? 'Recording...' : 'Record Score'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Recorded By */}
          <Text style={styles.recordedBy}>
            Recorded by: {recordedBy}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 450,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
  },
  matchInfo: {
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  matchNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
    marginBottom: 4,
  },
  courtName: {
    fontSize: 14,
    color: '#666',
  },
  teamSection: {
    marginBottom: 16,
  },
  teamLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  teamPlayers: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  playerName: {
    fontSize: 15,
    color: '#333',
    marginBottom: 4,
  },
  scoreButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  scoreButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  scoreButtonSelected: {
    backgroundColor: '#2196F3',
    borderColor: '#1976D2',
  },
  scoreButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#666',
  },
  scoreButtonTextSelected: {
    color: 'white',
  },
  divider: {
    alignItems: 'center',
    marginVertical: 12,
  },
  vsText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF9800',
  },
  scorePreview: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 16,
    gap: 12,
  },
  scorePreviewLabel: {
    fontSize: 16,
    color: '#666',
  },
  scorePreviewText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#999',
  },
  scorePreviewValid: {
    color: '#4CAF50',
  },
  validationError: {
    textAlign: 'center',
    color: '#FF5252',
    fontSize: 14,
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
  },
  submitButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  recordedBy: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    marginTop: 12,
  },
});
