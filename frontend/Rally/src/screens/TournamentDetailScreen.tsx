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
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import tournamentApi, { Tournament, TournamentStats } from '../services/tournamentApi';

const { width } = Dimensions.get('window');

const TournamentDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { tournamentId } = route.params as { tournamentId: string };

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    loadTournamentData();
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
              await tournamentApi.registerPlayer(tournamentId, {
                playerName: 'Player', // In MVP, we'll use a default name
                email: undefined,
                phone: undefined,
                deviceId: 'device_' + Date.now(), // Generate a simple device ID
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
});

export default TournamentDetailScreen;