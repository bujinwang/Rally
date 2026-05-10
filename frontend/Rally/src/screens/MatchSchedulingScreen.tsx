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
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSession } from '../contexts/SessionContext';
import matchSchedulingApiService from '../services/matchSchedulingApi';
import { ScheduledMatch } from '../types/matchScheduling';

interface MatchCardProps {
  match: ScheduledMatch;
  onPress: (match: ScheduledMatch) => void;
  isOrganizer: boolean;
}

const MatchCard = ({ match, onPress, isOrganizer }: MatchCardProps) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED': return '#007AFF';
      case 'CONFIRMED': return '#28a745';
      case 'IN_PROGRESS': return '#ffc107';
      case 'COMPLETED': return '#6c757d';
      case 'CANCELLED': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getMatchTypeText = (type: string) => {
    return type === 'SINGLES' ? 'Singles' : 'Doubles';
  };

  return (
    <TouchableOpacity style={styles.matchCard} onPress={() => onPress(match)}>
      <View style={styles.matchHeader}>
        <Text style={styles.matchTitle}>{match.title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(match.status) }]}>
          <Text style={styles.statusText}>{match.status}</Text>
        </View>
      </View>

      <View style={styles.matchDetails}>
        <Text style={styles.matchTime}>{formatDate(match.scheduledAt)}</Text>
        <Text style={styles.matchDuration}>{match.duration} minutes</Text>
        {match.courtName && <Text style={styles.matchCourt}>Court: {match.courtName}</Text>}
        <Text style={styles.matchType}>{getMatchTypeText(match.matchType)}</Text>
      </View>

      <View style={styles.matchPlayers}>
        <Text style={styles.playersLabel}>Players:</Text>
        <Text style={styles.playersText}>
          {match.player1Id && 'Player 1'}
          {match.player2Id && ', Player 2'}
          {match.player3Id && ', Player 3'}
          {match.player4Id && ', Player 4'}
        </Text>
      </View>

      {match.description && (
        <Text style={styles.matchDescription} numberOfLines={2}>
          {match.description}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const MatchSchedulingScreen = () => {
  const navigation = useNavigation();
  const { session, currentUser, isOrganizer } = useSession();
  const [matches, setMatches] = useState<ScheduledMatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.id) {
      loadMatches();
    }
  }, [session?.id]);

  const loadMatches = async (showRefreshIndicator = false) => {
    if (!session?.id) return;

    if (showRefreshIndicator) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const sessionMatches = await matchSchedulingApiService.getSessionMatches(session.id);
      setMatches(sessionMatches);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matches');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleMatchPress = (match: ScheduledMatch) => {
    // Navigate to match details screen
    // TODO: Implement navigation to MatchDetails screen
    Alert.alert('Match Details', `Viewing details for: ${match.title}`);
  };

  const handleCreateMatch = () => {
    // TODO: Implement navigation to CreateMatch screen
    Alert.alert('Create Match', 'Match creation screen will be implemented next');
  };

  const handleRefresh = () => {
    loadMatches(true);
  };

  const getUpcomingMatches = () => {
    const now = new Date();
    return matches
      .filter(match => new Date(match.scheduledAt) > now)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  };

  const getPastMatches = () => {
    const now = new Date();
    return matches
      .filter(match => new Date(match.scheduledAt) <= now)
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  };

  const upcomingMatches = getUpcomingMatches();
  const pastMatches = getPastMatches();

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
        <Text style={styles.title}>Match Scheduling</Text>
        {isOrganizer && (
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreateMatch}
          >
            <Text style={styles.createButtonText}>+ New Match</Text>
          </TouchableOpacity>
        )}
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadMatches()}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        {isLoading && !isRefreshing ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading matches...</Text>
          </View>
        ) : (
          <>
            {/* Upcoming Matches Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Upcoming Matches ({upcomingMatches.length})
              </Text>
              {upcomingMatches.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    {isOrganizer
                      ? 'No upcoming matches scheduled. Tap "New Match" to create one.'
                      : 'No upcoming matches scheduled.'
                    }
                  </Text>
                </View>
              ) : (
                upcomingMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    onPress={handleMatchPress}
                    isOrganizer={isOrganizer}
                  />
                ))
              )}
            </View>

            {/* Past Matches Section */}
            {pastMatches.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Recent Matches ({pastMatches.length})
                </Text>
                {pastMatches.slice(0, 5).map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    onPress={handleMatchPress}
                    isOrganizer={isOrganizer}
                  />
                ))}
                {pastMatches.length > 5 && (
                  <TouchableOpacity style={styles.viewAllButton}>
                    <Text style={styles.viewAllText}>View All Past Matches</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  createButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#f8d7da',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f5c6cb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: '#721c24',
    fontSize: 14,
    flex: 1,
  },
  retryButton: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 16,
    color: '#666',
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
  emptyState: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  matchCard: {
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
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  matchTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  matchDetails: {
    marginBottom: 12,
  },
  matchTime: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
    marginBottom: 4,
  },
  matchDuration: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  matchCourt: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  matchType: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  matchPlayers: {
    marginBottom: 8,
  },
  playersLabel: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    marginBottom: 4,
  },
  playersText: {
    fontSize: 14,
    color: '#666',
  },
  matchDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  viewAllButton: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  viewAllText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default MatchSchedulingScreen;