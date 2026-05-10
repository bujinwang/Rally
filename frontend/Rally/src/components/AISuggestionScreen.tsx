import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import pairingApiService, {
  AIPairingSuggestion,
  AIPairingResult,
  PairingExplanation
} from '../services/pairingApi';

interface Player {
  id: string;
  name: string;
  skillLevel?: number;
}

interface AISuggestionScreenProps {
  sessionId: string;
  players: Player[];
  onAcceptSuggestion: (suggestion: AIPairingSuggestion) => void;
  onManualOverride: () => void;
  onClose: () => void;
}

const AISuggestionScreen: React.FC<AISuggestionScreenProps> = ({
  sessionId,
  players,
  onAcceptSuggestion,
  onManualOverride,
  onClose,
}) => {
  const [suggestions, setSuggestions] = useState<AIPairingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSuggestion, setSelectedSuggestion] = useState<AIPairingSuggestion | null>(null);
  const [explanation, setExplanation] = useState<PairingExplanation | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState<string | null>(null);

  useEffect(() => {
    generateSuggestions();
  }, [sessionId, players]);

  const generateSuggestions = async () => {
    try {
      setLoading(true);
      const playerIds = players.map(p => p.id);
      const result: AIPairingResult = await pairingApiService.generateAISuggestions(sessionId, playerIds, {
        maxSuggestions: 5,
        includeHistoricalData: true,
        preferenceWeight: 0.3
      });
      setSuggestions(result.suggestions);
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
      Alert.alert('Error', 'Failed to generate AI suggestions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionPress = async (suggestion: AIPairingSuggestion) => {
    setSelectedSuggestion(suggestion);
    try {
      const explanationData = await pairingApiService.getPairingExplanation(suggestion.pairing.join('-'));
      setExplanation(explanationData);
      setShowExplanation(true);
    } catch (error) {
      console.error('Error getting explanation:', error);
      // Show suggestion without explanation
      setShowExplanation(true);
    }
  };

  const handleAcceptSuggestion = (suggestion: AIPairingSuggestion) => {
    Alert.alert(
      'Accept AI Suggestion',
      `Accept this pairing: ${getPlayerNames(suggestion.pairing)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: () => {
            onAcceptSuggestion(suggestion);
            onClose();
          }
        }
      ]
    );
  };

  const handleFeedback = async (suggestion: AIPairingSuggestion, rating: number) => {
    try {
      setFeedbackLoading(suggestion.pairing.join('-'));
      await pairingApiService.submitPairingFeedback({
        sessionId,
        playerId: suggestion.pairing[0],
        partnerId: suggestion.pairing[1],
        feedback: rating,
        aiSuggested: true
      });
      Alert.alert('Thank you!', 'Your feedback helps improve future suggestions.');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      Alert.alert('Error', 'Failed to submit feedback. Please try again.');
    } finally {
      setFeedbackLoading(null);
    }
  };

  const getPlayerNames = (pairing: [string, string]): string => {
    const player1 = players.find(p => p.id === pairing[0]);
    const player2 = players.find(p => p.id === pairing[1]);
    return `${player1?.name || 'Unknown'} & ${player2?.name || 'Unknown'}`;
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return '#28a745'; // Green
    if (confidence >= 0.6) return '#ffc107'; // Yellow
    return '#dc3545'; // Red
  };

  const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Generating AI suggestions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🤖 AI Pairing Suggestions</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {suggestions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No suggestions available</Text>
            <Text style={styles.emptySubtext}>Try with more players or different preferences</Text>
          </View>
        ) : (
          suggestions.map((suggestion, index) => (
            <TouchableOpacity
              key={index}
              style={styles.suggestionCard}
              onPress={() => handleSuggestionPress(suggestion)}
            >
              <View style={styles.suggestionHeader}>
                <Text style={styles.pairingText}>
                  {getPlayerNames(suggestion.pairing)}
                </Text>
                <View style={[styles.confidenceBadge, { backgroundColor: getConfidenceColor(suggestion.confidence) }]}>
                  <Text style={styles.confidenceText}>
                    {getConfidenceLabel(suggestion.confidence)} ({Math.round(suggestion.confidence * 100)}%)
                  </Text>
                </View>
              </View>

              <Text style={styles.reasonText} numberOfLines={2}>
                {suggestion.reason}
              </Text>

              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => handleAcceptSuggestion(suggestion)}
                >
                  <Text style={styles.acceptButtonText}>Accept</Text>
                </TouchableOpacity>

                <View style={styles.feedbackButtons}>
                  {[1, 2, 3, 4, 5].map(rating => (
                    <TouchableOpacity
                      key={rating}
                      style={[
                        styles.feedbackButton,
                        feedbackLoading === suggestion.pairing.join('-') && styles.feedbackButtonDisabled
                      ]}
                      onPress={() => handleFeedback(suggestion, rating)}
                      disabled={feedbackLoading === suggestion.pairing.join('-')}
                    >
                      <Text style={styles.feedbackButtonText}>{rating}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.manualButton}
          onPress={onManualOverride}
        >
          <Text style={styles.manualButtonText}>Manual Pairing</Text>
        </TouchableOpacity>
      </View>

      {/* Explanation Modal */}
      <Modal
        visible={showExplanation}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowExplanation(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pairing Explanation</Text>
              <TouchableOpacity onPress={() => setShowExplanation(false)}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedSuggestion && (
              <ScrollView style={styles.modalBody}>
                <Text style={styles.modalPairing}>
                  {getPlayerNames(selectedSuggestion.pairing)}
                </Text>

                <Text style={styles.modalConfidence}>
                  Confidence: {Math.round(selectedSuggestion.confidence * 100)}%
                </Text>

                <Text style={styles.modalReason}>
                  {selectedSuggestion.reason}
                </Text>

                {explanation && (
                  <View style={styles.explanationDetails}>
                    <Text style={styles.explanationTitle}>Detailed Analysis:</Text>

                    <View style={styles.factorItem}>
                      <Text style={styles.factorLabel}>Skill Compatibility:</Text>
                      <Text style={styles.factorValue}>
                        {explanation.factors.skillCompatibility}
                      </Text>
                    </View>

                    <View style={styles.factorItem}>
                      <Text style={styles.factorLabel}>Historical Performance:</Text>
                      <Text style={styles.factorValue}>
                        {explanation.factors.historicalPerformance}
                      </Text>
                    </View>

                    <View style={styles.factorItem}>
                      <Text style={styles.factorLabel}>Preference Alignment:</Text>
                      <Text style={styles.factorValue}>
                        {explanation.factors.preferenceAlignment}
                      </Text>
                    </View>

                    {explanation.alternatives.length > 0 && (
                      <View style={styles.alternatives}>
                        <Text style={styles.alternativesTitle}>Alternatives:</Text>
                        {explanation.alternatives.map((alt, index) => (
                          <Text key={index} style={styles.alternativeText}>• {alt}</Text>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalAcceptButton}
                onPress={() => {
                  if (selectedSuggestion) {
                    handleAcceptSuggestion(selectedSuggestion);
                  }
                }}
              >
                <Text style={styles.modalAcceptButtonText}>Accept This Pairing</Text>
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
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6c757d',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6c757d',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#6c757d',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#adb5bd',
    textAlign: 'center',
  },
  suggestionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pairingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    flex: 1,
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  confidenceText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  reasonText: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 12,
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  feedbackButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  feedbackButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedbackButtonDisabled: {
    opacity: 0.5,
  },
  feedbackButtonText: {
    fontSize: 14,
    color: '#495057',
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  manualButton: {
    backgroundColor: '#6c757d',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  manualButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
  },
  modalBody: {
    padding: 16,
    maxHeight: 300,
  },
  modalPairing: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 8,
  },
  modalConfidence: {
    fontSize: 14,
    color: '#28a745',
    marginBottom: 12,
  },
  modalReason: {
    fontSize: 14,
    color: '#495057',
    lineHeight: 20,
    marginBottom: 16,
  },
  explanationDetails: {
    marginTop: 16,
  },
  explanationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 12,
  },
  factorItem: {
    marginBottom: 8,
  },
  factorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
  },
  factorValue: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 2,
  },
  alternatives: {
    marginTop: 16,
  },
  alternativesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
  },
  alternativeText: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 4,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  modalAcceptButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalAcceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AISuggestionScreen;