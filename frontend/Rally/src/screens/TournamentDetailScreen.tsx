import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  TextInput,
  Switch,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import tournamentApi, {
  Tournament,
  TournamentStats,
  TournamentBracket,
  BracketMatch,
  TournamentApiError,
} from '../services/tournamentApi';
import TournamentBracketView from '../components/TournamentBracketView';

const { width } = Dimensions.get('window');

type DetailTab = 'details' | 'bracket';
type MatchActionMode = 'record' | 'correct';

/**
 * Map a thrown error onto an operator-facing message.
 *
 * The bracket endpoints return the standard envelope `{ success: false,
 * error: { code, message } }`; `TournamentApiError` preserves that `code`, so
 * the cases the story calls out are surfaced specifically rather than as a
 * generic failure:
 *   - 403 `FORBIDDEN` — not the organizer;
 *   - 400 `BRACKET_GENERATION_FAILED` — e.g. an unsupported non-power-of-two
 *     double-elimination field (the backend message is already actionable);
 *   - 404 `BRACKET_NOT_FOUND` — no bracket generated yet.
 */
function describeError(error: unknown): string {
  if (error instanceof TournamentApiError) {
    switch (error.code) {
      case 'FORBIDDEN':
        return 'Only the tournament organizer can do this.';
      case 'BRACKET_GENERATION_FAILED':
        return error.message || 'The bracket could not be generated for this format.';
      case 'BRACKET_NOT_FOUND':
        return 'No bracket has been generated for this tournament yet.';
      case 'DOWNSTREAM_COMPLETED':
        return (
          error.message ||
          'A later match is already completed. Enable cascade to correct it anyway.'
        );
      case 'MATCH_NOT_READY':
      case 'INVALID_WINNER':
        return error.message || 'This match cannot be updated yet.';
      default:
        return error.message || 'Something went wrong. Please try again.';
    }
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

const TournamentDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { tournamentId } = route.params as { tournamentId: string };

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  // Story 6.7 — Bracket tab state.
  const [activeTab, setActiveTab] = useState<DetailTab>('details');
  const [bracket, setBracket] = useState<TournamentBracket | null>(null);
  const [bracketLoading, setBracketLoading] = useState(false);
  const [bracketError, setBracketError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Record / correct modal state.
  const [actionMode, setActionMode] = useState<MatchActionMode | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<BracketMatch | null>(null);
  const [selectedWinnerId, setSelectedWinnerId] = useState<string | null>(null);
  const [scoreInput, setScoreInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [cascade, setCascade] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadTournamentData();
    loadBracket();
  }, [tournamentId]);

  const loadTournamentData = async () => {
    try {
      setLoading(true);
      const [tournamentData, statsData] = await Promise.all([
        tournamentApi.getTournamentById(tournamentId),
        tournamentApi.getTournamentStats(tournamentId),
      ]);
      setTournament(tournamentData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading tournament data:', error);
      Alert.alert('Error', 'Failed to load tournament details');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load the bracket. A missing bracket (404 `BRACKET_NOT_FOUND`) resolves to
   * `null` and renders the empty state; any other failure sets `bracketError`.
   */
  const loadBracket = async () => {
    try {
      setBracketLoading(true);
      setBracketError(null);
      const data = await tournamentApi.getBracket(tournamentId);
      setBracket(data);
    } catch (error) {
      console.error('Error loading bracket:', error);
      setBracketError(describeError(error));
    } finally {
      setBracketLoading(false);
    }
  };

  const handleGenerateBracket = () => {
    Alert.alert(
      'Generate bracket',
      'Generate and persist the bracket for this tournament? This seeds the draw from the registered players.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            try {
              setGenerating(true);
              await tournamentApi.generateBracket(tournamentId);
              await loadBracket();
              Alert.alert('Success', 'Bracket generated.');
            } catch (error) {
              Alert.alert('Could not generate bracket', describeError(error));
            } finally {
              setGenerating(false);
            }
          },
        },
      ]
    );
  };

  const openRecord = (match: BracketMatch) => {
    setSelectedMatch(match);
    setActionMode('record');
    setSelectedWinnerId(null);
    setScoreInput('');
  };

  const openCorrect = (match: BracketMatch) => {
    setSelectedMatch(match);
    setActionMode('correct');
    setSelectedWinnerId(null);
    setReasonInput('');
    setCascade(false);
  };

  const closeAction = () => {
    setActionMode(null);
    setSelectedMatch(null);
    setSelectedWinnerId(null);
    setScoreInput('');
    setReasonInput('');
    setCascade(false);
  };

  const submitAction = async () => {
    if (!selectedMatch || !selectedWinnerId) return;
    const mode = actionMode;

    if (mode === 'correct' && !reasonInput.trim()) {
      Alert.alert('Reason required', 'Please provide a reason for the correction.');
      return;
    }

    try {
      setSubmitting(true);
      if (mode === 'record') {
        await tournamentApi.recordResult(
          tournamentId,
          selectedMatch.id,
          selectedWinnerId,
          scoreInput.trim() || undefined
        );
      } else if (mode === 'correct') {
        await tournamentApi.correctResult(
          tournamentId,
          selectedMatch.id,
          selectedWinnerId,
          reasonInput.trim(),
          cascade
        );
      }
      closeAction();
      await loadBracket();
      Alert.alert('Success', mode === 'record' ? 'Result recorded.' : 'Result corrected.');
    } catch (error) {
      Alert.alert(
        mode === 'record' ? 'Could not record result' : 'Could not correct result',
        describeError(error)
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async () => {
    if (!tournament) return;

    Alert.alert(
      'Register for Tournament',
      `Register for "${tournament.name}"? ${tournament.entryFee > 0 ? `Entry fee: $${tournament.entryFee}` : 'Free entry'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Register',
          onPress: async () => {
            try {
              setRegistering(true);
              const DeviceService = require('../services/deviceService').default;
              const identity = await DeviceService.getIdentity();
              await tournamentApi.registerPlayer(tournamentId, {
                playerName: identity.lastUsedName || 'Player',
                email: undefined,
                phone: undefined,
                deviceId: identity.deviceId,
                skillLevel: 'intermediate',
              });
              Alert.alert('Success', 'Successfully registered for tournament!');
              loadTournamentData(); // Refresh data
            } catch (error: any) {
              console.error('Error registering:', error);
              Alert.alert('Registration Failed', error.message || 'Failed to register for tournament');
            } finally {
              setRegistering(false);
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'REGISTRATION_OPEN':
        return '#28a745';
      case 'IN_PROGRESS':
        return '#ffc107';
      case 'COMPLETED':
        return '#007AFF';
      case 'CANCELLED':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'REGISTRATION_OPEN':
        return 'Registration Open';
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'COMPLETED':
        return 'Completed';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: '#f8f9fa' }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={[styles.loadingText, { color: '#666' }]}>
            Loading tournament details...
          </Text>
        </View>
      </View>
    );
  }

  if (!tournament) {
    return (
      <View style={[styles.container, { backgroundColor: '#f8f9fa' }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#dc3545" />
          <Text style={[styles.errorTitle, { color: '#333' }]}>
            Tournament Not Found
          </Text>
          <Text style={[styles.errorSubtitle, { color: '#666' }]}>
            The tournament you're looking for doesn't exist or has been removed.
          </Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: '#007AFF' }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: '#f8f9fa' }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: '#007AFF' }]}>
        <View style={styles.headerContent}>
          <Text style={styles.tournamentName}>{tournament.name}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(tournament.status) }
            ]}
          >
            <Text style={styles.statusText}>
              {getStatusText(tournament.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.organizerText}>
          Organized by {tournament.organizerName}
        </Text>
      </View>

      {/* Tab switcher */}
      <View style={styles.tabBar}>
        {(['details', 'bracket'] as DetailTab[]).map((tab) => {
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabButton, active && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab)}
              accessibilityRole="button"
            >
              <Ionicons
                name={tab === 'details' ? 'information-circle-outline' : 'git-network-outline'}
                size={18}
                color={active ? '#007AFF' : '#666'}
              />
              <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>
                {tab === 'details' ? 'Details' : 'Bracket'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === 'details' && (
        <>
      {/* Tournament Info */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: '#333' }]}>
          Tournament Details
        </Text>

        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Ionicons name="calendar-outline" size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: '#666' }]}>Date</Text>
              <Text style={[styles.infoValue, { color: '#333' }]}>
                {formatDate(tournament.startDate)}
              </Text>
              {tournament.endDate && (
                <Text style={[styles.infoValue, { color: '#666' }]}>
                  to {formatDate(tournament.endDate)}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.infoItem}>
            <Ionicons name="location-outline" size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: '#666' }]}>Venue</Text>
              <Text style={[styles.infoValue, { color: '#333' }]}>
                {tournament.venueName || 'TBD'}
              </Text>
              {tournament.venueAddress && (
                <Text style={[styles.infoValue, { color: '#666' }]}>
                  {tournament.venueAddress}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.infoItem}>
            <Ionicons name="people-outline" size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: '#666' }]}>Players</Text>
              <Text style={[styles.infoValue, { color: '#333' }]}>
                {stats?.totalPlayers || 0} / {tournament.maxPlayers}
              </Text>
            </View>
          </View>

          <View style={styles.infoItem}>
            <Ionicons name="cash-outline" size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: '#666' }]}>Entry Fee</Text>
              <Text style={[styles.infoValue, { color: '#333' }]}>
                {tournament.entryFee > 0 ? `$${tournament.entryFee}` : 'Free'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Tournament Rules */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: '#333' }]}>
          Tournament Rules
        </Text>

        <View style={styles.rulesGrid}>
          <View style={styles.ruleItem}>
            <Text style={[styles.ruleLabel, { color: '#666' }]}>Format</Text>
            <Text style={[styles.ruleValue, { color: '#333' }]}>
              {tournament.matchFormat}
            </Text>
          </View>

          <View style={styles.ruleItem}>
            <Text style={[styles.ruleLabel, { color: '#666' }]}>Scoring</Text>
            <Text style={[styles.ruleValue, { color: '#333' }]}>
              {tournament.scoringSystem.replace('_', ' ')}
            </Text>
          </View>

          <View style={styles.ruleItem}>
            <Text style={[styles.ruleLabel, { color: '#666' }]}>Best of</Text>
            <Text style={[styles.ruleValue, { color: '#333' }]}>
              {tournament.bestOfGames} games
            </Text>
          </View>

          <View style={styles.ruleItem}>
            <Text style={[styles.ruleLabel, { color: '#666' }]}>Type</Text>
            <Text style={[styles.ruleValue, { color: '#333' }]}>
              {tournament.tournamentType.replace('_', ' ')}
            </Text>
          </View>
        </View>
      </View>

      {/* Statistics */}
      {stats && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: '#333' }]}>
            Tournament Statistics
          </Text>

          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#007AFF' }]}>
                {stats.totalMatches}
              </Text>
              <Text style={[styles.statLabel, { color: '#666' }]}>
                Total Matches
              </Text>
            </View>

            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#28a745' }]}>
                {stats.completedMatches}
              </Text>
              <Text style={[styles.statLabel, { color: '#666' }]}>
                Completed
              </Text>
            </View>

            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#ffc107' }]}>
                {Math.round(stats.tournamentProgress)}%
              </Text>
              <Text style={[styles.statLabel, { color: '#666' }]}>
                Progress
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Description */}
      {tournament.description && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: '#333' }]}>
            Description
          </Text>
          <Text style={[styles.description, { color: '#666' }]}>
            {tournament.description}
          </Text>
        </View>
      )}

      {/* Registration Button */}
      {tournament.status === 'REGISTRATION_OPEN' && (
        <View style={styles.registrationSection}>
          <TouchableOpacity
            style={[
              styles.registerButton,
              registering && { opacity: 0.6 },
              { backgroundColor: '#28a745' }
            ]}
            onPress={handleRegister}
            disabled={registering}
          >
            {registering ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="person-add" size={20} color="white" />
                <Text style={styles.registerButtonText}>
                  Register for Tournament
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
        </>
      )}

      {activeTab === 'bracket' && (
        <View style={styles.bracketTab}>
          {bracketLoading ? (
            <View style={styles.bracketState}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.bracketStateText}>Loading bracket…</Text>
            </View>
          ) : bracketError ? (
            <View style={styles.bracketState}>
              <Ionicons name="alert-circle-outline" size={48} color="#dc3545" />
              <Text style={styles.bracketStateText}>{bracketError}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={loadBracket}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : !bracket ? (
            <View style={styles.bracketState}>
              <Ionicons name="git-network-outline" size={56} color="#adb5bd" />
              <Text style={styles.bracketStateTitle}>No bracket yet</Text>
              <Text style={styles.bracketStateText}>
                Generate the bracket to seed the draw from the registered players.
              </Text>
              <TouchableOpacity
                style={[styles.generateButton, generating && { opacity: 0.6 }]}
                onPress={handleGenerateBracket}
                disabled={generating}
              >
                {generating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="sparkles-outline" size={18} color="#fff" />
                    <Text style={styles.generateButtonText}>Generate Bracket</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TournamentBracketView
                bracket={bracket}
                onRecordResult={openRecord}
                onCorrectResult={openCorrect}
              />
              <TouchableOpacity
                style={[styles.refreshButton, bracketLoading && { opacity: 0.6 }]}
                onPress={loadBracket}
                disabled={bracketLoading}
              >
                <Ionicons name="refresh-outline" size={16} color="#007AFF" />
                <Text style={styles.refreshButtonText}>Refresh bracket</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Record / correct modal */}
      <Modal
        visible={actionMode !== null}
        transparent
        animationType="slide"
        onRequestClose={closeAction}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {actionMode === 'record' ? 'Record result' : 'Correct result'}
            </Text>
            {selectedMatch && (
              <Text style={styles.modalSubtitle}>
                Round {selectedMatch.round} · Match {selectedMatch.match}
              </Text>
            )}

            <Text style={styles.modalLabel}>Winner</Text>
            {selectedMatch &&
              ([
                { id: selectedMatch.player1Id, name: selectedMatch.player1Name },
                { id: selectedMatch.player2Id, name: selectedMatch.player2Name },
              ] as Array<{ id: string | null; name?: string }>).map(
                (option, index) =>
                  option.id ? (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.winnerOption,
                        selectedWinnerId === option.id && styles.winnerOptionActive,
                      ]}
                      onPress={() => setSelectedWinnerId(option.id)}
                    >
                      <Ionicons
                        name={
                          selectedWinnerId === option.id
                            ? 'radio-button-on'
                            : 'radio-button-off'
                        }
                        size={20}
                        color={selectedWinnerId === option.id ? '#007AFF' : '#adb5bd'}
                      />
                      <Text style={styles.winnerOptionText}>
                        {option.name ?? `Player ${index + 1}`}
                      </Text>
                    </TouchableOpacity>
                  ) : null
              )}

            {actionMode === 'record' && (
              <>
                <Text style={styles.modalLabel}>Score (optional)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 21-19 21-15"
                  value={scoreInput}
                  onChangeText={setScoreInput}
                  autoCapitalize="none"
                />
              </>
            )}

            {actionMode === 'correct' && (
              <>
                <Text style={styles.modalLabel}>Reason</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Why is this result being corrected?"
                  value={reasonInput}
                  onChangeText={setReasonInput}
                />
                <View style={styles.cascadeRow}>
                  <Text style={styles.cascadeLabel}>Cascade to downstream matches</Text>
                  <Switch value={cascade} onValueChange={setCascade} />
                </View>
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={closeAction}
                disabled={submitting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalConfirm,
                  (!selectedWinnerId || submitting) && { opacity: 0.5 },
                ]}
                onPress={submitAction}
                disabled={!selectedWinnerId || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>
                    {actionMode === 'record' ? 'Save result' : 'Apply correction'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom padding */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  header: {
    padding: 20,
    paddingTop: 40,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tournamentName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  organizerText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  section: {
    backgroundColor: 'white',
    margin: 20,
    marginBottom: 0,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoItem: {
    width: (width - 80) / 2,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  infoContent: {
    marginLeft: 8,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  rulesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  ruleItem: {
    width: (width - 80) / 2,
    marginBottom: 16,
  },
  ruleLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    color: '#666',
    marginBottom: 4,
  },
  ruleValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
  },
  registrationSection: {
    padding: 20,
  },
  registerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  registerButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  // ── Tab switcher ──────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#007AFF',
  },
  tabButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
    marginLeft: 6,
  },
  tabButtonTextActive: {
    color: '#007AFF',
  },
  // ── Bracket tab ───────────────────────────────────────────────────────
  bracketTab: {
    padding: 16,
  },
  bracketState: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 32,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bracketStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginTop: 12,
  },
  bracketStateText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 20,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    marginTop: 16,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  refreshButtonText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },
  // ── Record / correct modal ────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#666',
    marginTop: 18,
    marginBottom: 8,
  },
  winnerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
    marginBottom: 8,
  },
  winnerOptionActive: {
    borderColor: '#007AFF',
    backgroundColor: '#f0f7ff',
  },
  winnerOptionText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 10,
    flex: 1,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
  },
  cascadeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  cascadeLabel: {
    fontSize: 15,
    color: '#333',
    flex: 1,
    marginRight: 12,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  modalCancel: {
    backgroundColor: '#e9ecef',
  },
  modalCancelText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  modalConfirm: {
    backgroundColor: '#007AFF',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default TournamentDetailScreen;