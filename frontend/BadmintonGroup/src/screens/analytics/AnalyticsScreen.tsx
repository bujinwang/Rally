import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { AnalyticsDashboardData, LeaderboardEntry } from '../../types/analytics';
import { getAnalyticsDashboard, refreshPlayerAnalytics } from '../../services/analyticsApi';

const AnalyticsScreen: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<AnalyticsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Mock current user ID (replace with actual auth)
  const currentPlayerId = 'player-123';

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      const response = await getAnalyticsDashboard(currentPlayerId);

      if (response.success && response.data) {
        setDashboardData(response.data);
      } else {
        Alert.alert('Error', response.error || 'Failed to load analytics data');
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
      Alert.alert('Error', 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await refreshPlayerAnalytics(currentPlayerId);
      await loadAnalyticsData();
    } catch (error) {
      console.error('Error refreshing analytics:', error);
      Alert.alert('Error', 'Failed to refresh analytics data');
    } finally {
      setRefreshing(false);
    }
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  const formatPercentage = (num: number): string => {
    return `${num.toFixed(1)}%`;
  };

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Analytics...</Text>
      </View>
    );
  }

  if (!dashboardData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load analytics data</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadAnalyticsData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { playerAnalytics, leaderboard, systemAnalytics, performanceTrends } = dashboardData;

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Analytics Dashboard</Text>
        <TouchableOpacity
          style={[styles.refreshButton, refreshing && styles.refreshButtonDisabled]}
          onPress={handleRefresh}
          disabled={refreshing}
        >
          <Text style={styles.refreshButtonText}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Player Analytics */}
      {playerAnalytics && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Performance</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatNumber(playerAnalytics.totalMatches)}</Text>
              <Text style={styles.statLabel}>Total Matches</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatPercentage(playerAnalytics.winRate)}</Text>
              <Text style={styles.statLabel}>Win Rate</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statValue}>{playerAnalytics.currentStreak > 0 ? `+${playerAnalytics.currentStreak}` : playerAnalytics.currentStreak.toString()}</Text>
              <Text style={styles.statLabel}>Current Streak</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statValue}>{playerAnalytics.skillRating.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Skill Rating</Text>
            </View>
          </View>

          <View style={styles.additionalStats}>
            <View style={styles.statRow}>
              <Text style={styles.statRowLabel}>Sessions Played:</Text>
              <Text style={styles.statRowValue}>{formatNumber(playerAnalytics.sessionsPlayed)}</Text>
            </View>

            <View style={styles.statRow}>
              <Text style={styles.statRowLabel}>Tournaments Entered:</Text>
              <Text style={styles.statRowValue}>{formatNumber(playerAnalytics.tournamentsEntered)}</Text>
            </View>

            <View style={styles.statRow}>
              <Text style={styles.statRowLabel}>Hours Played:</Text>
              <Text style={styles.statRowValue}>{formatDuration(playerAnalytics.hoursPlayed)}</Text>
            </View>

            <View style={styles.statRow}>
              <Text style={styles.statRowLabel}>Achievements Unlocked:</Text>
              <Text style={styles.statRowValue}>{formatNumber(playerAnalytics.achievementsUnlocked)}</Text>
            </View>

            <View style={styles.statRow}>
              <Text style={styles.statRowLabel}>Friends:</Text>
              <Text style={styles.statRowValue}>{formatNumber(playerAnalytics.friendsCount)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Leaderboard */}
      {leaderboard && leaderboard.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Leaderboard</Text>

          {leaderboard.slice(0, 10).map((entry: LeaderboardEntry, index: number) => (
            <View key={entry.playerName} style={styles.leaderboardItem}>
              <View style={styles.rankContainer}>
                <Text style={[
                  styles.rank,
                  entry.playerName === playerAnalytics?.playerName && styles.currentPlayerRank
                ]}>
                  #{entry.rank}
                </Text>
              </View>

              <View style={styles.playerInfo}>
                <Text style={[
                  styles.playerName,
                  entry.playerName === playerAnalytics?.playerName && styles.currentPlayerName
                ]}>
                  {entry.playerName}
                </Text>
                <Text style={styles.playerStats}>
                  {formatPercentage(entry.winRate)} WR • {entry.totalMatches} matches
                </Text>
              </View>

              <View style={styles.skillRating}>
                <Text style={styles.skillRatingText}>{entry.skillRating.toFixed(0)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* System Analytics */}
      {systemAnalytics && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Community Stats</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatNumber(systemAnalytics.totalActiveUsers)}</Text>
              <Text style={styles.statLabel}>Active Users</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatNumber(systemAnalytics.totalSessions)}</Text>
              <Text style={styles.statLabel}>Active Sessions</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatNumber(systemAnalytics.totalMatchesToday)}</Text>
              <Text style={styles.statLabel}>Matches Today</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatNumber(systemAnalytics.achievementsUnlocked)}</Text>
              <Text style={styles.statLabel}>Achievements Today</Text>
            </View>
          </View>
        </View>
      )}

      {/* Performance Trends */}
      {performanceTrends && performanceTrends.dailyPerformance.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Performance (Last 30 Days)</Text>

          <View style={styles.trendsSummary}>
            <View style={styles.trendStat}>
              <Text style={styles.trendValue}>
                {performanceTrends.dailyPerformance.reduce((sum, day) => sum + day.wins, 0)}
              </Text>
              <Text style={styles.trendLabel}>Wins</Text>
            </View>

            <View style={styles.trendStat}>
              <Text style={styles.trendValue}>
                {performanceTrends.dailyPerformance.reduce((sum, day) => sum + day.losses, 0)}
              </Text>
              <Text style={styles.trendLabel}>Losses</Text>
            </View>

            <View style={styles.trendStat}>
              <Text style={styles.trendValue}>
                {formatPercentage(
                  performanceTrends.dailyPerformance.reduce((sum, day) => sum + day.winRate, 0) /
                  performanceTrends.dailyPerformance.length
                )}
              </Text>
              <Text style={styles.trendLabel}>Avg Win Rate</Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  refreshButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
  },
  refreshButtonDisabled: {
    backgroundColor: '#ccc',
  },
  refreshButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    backgroundColor: 'white',
    margin: 10,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  additionalStats: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 15,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statRowLabel: {
    fontSize: 14,
    color: '#666',
  },
  statRowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
  },
  rank: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
  },
  currentPlayerRank: {
    color: '#007AFF',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  currentPlayerName: {
    color: '#007AFF',
  },
  playerStats: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  skillRating: {
    alignItems: 'center',
  },
  skillRatingText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  trendsSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  trendStat: {
    alignItems: 'center',
  },
  trendValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  trendLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
});

export default AnalyticsScreen;