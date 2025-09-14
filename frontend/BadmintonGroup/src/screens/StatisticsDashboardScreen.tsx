import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

// Import types and services
import {
  PlayerStatistics,
  LeaderboardEntry,
  SessionStatistics,
} from '../types/statistics';
import { statisticsApi } from '../services/statisticsApi';
import { sessionApi } from '../services/sessionApi';

const { width } = Dimensions.get('window');

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  color: string;
  trend?: 'up' | 'down' | 'stable';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon, color, trend }) => {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return 'trending-up';
      case 'down': return 'trending-down';
      default: return 'remove';
    }
  };

  const getTrendColor = () => {
    switch (trend) {
      case 'up': return '#4CAF50';
      case 'down': return '#f44336';
      default: return '#9E9E9E';
    }
  };

  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={styles.statHeader}>
        <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
          <Ionicons name={icon as any} size={24} color={color} />
        </View>
        {trend && (
          <Ionicons
            name={getTrendIcon() as any}
            size={16}
            color={getTrendColor()}
            style={styles.trendIcon}
          />
        )}
      </View>

      <View style={styles.statContent}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statTitle}>{title}</Text>
        {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
};

const StatisticsDashboardScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { sessionId, playerId } = route.params as {
    sessionId?: string;
    playerId?: string;
  };

  // State management
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playerStats, setPlayerStats] = useState<PlayerStatistics | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [sessionStats, setSessionStats] = useState<SessionStatistics | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'detailed' | 'leaderboard'>('overview');

  // Load data
  useEffect(() => {
    loadData();
  }, [sessionId, playerId]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      // Load player statistics if playerId is provided
      if (playerId) {
        const stats = await statisticsApi.getPlayerStatistics(playerId, {
          sessionId,
          timeRange: 'all',
        });
        setPlayerStats(stats);
      }

      // Load leaderboard
      const board = await statisticsApi.getLeaderboard({
        sessionId,
        minMatches: 1,
      });
      setLeaderboard(board);

      // Load session statistics if sessionId is provided
      if (sessionId) {
        const sessionStatsData = await statisticsApi.getSessionStatistics(sessionId);
        setSessionStats(sessionStatsData);
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const formatPercentage = (value: number) => `${value.toFixed(1)}%`;
  const formatNumber = (value: number) => value.toString();

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading statistics...</Text>
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
        <Text style={styles.headerTitle}>Statistics Dashboard</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'overview' && styles.activeTab]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.tabText, activeTab === 'overview' && styles.activeTabText]}>
            Overview
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'detailed' && styles.activeTab]}
          onPress={() => setActiveTab('detailed')}
        >
          <Text style={[styles.tabText, activeTab === 'detailed' && styles.activeTabText]}>
            Detailed
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'leaderboard' && styles.activeTab]}
          onPress={() => setActiveTab('leaderboard')}
        >
          <Text style={[styles.tabText, activeTab === 'leaderboard' && styles.activeTabText]}>
            Leaderboard
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === 'overview' && (
          <View style={styles.tabContent}>
            {/* Player Statistics Cards */}
            {playerStats && (
              <View style={styles.statsGrid}>
                <StatCard
                  title="Win Rate"
                  value={formatPercentage(playerStats.winRate)}
                  subtitle={`${playerStats.wins}W - ${playerStats.losses}L`}
                  icon="trophy"
                  color="#4CAF50"
                  trend={playerStats.recentForm.length >= 3 ?
                    (playerStats.recentForm.slice(0, 3).filter(r => r === 'W').length >= 2 ? 'up' : 'down') :
                    'stable'
                  }
                />

                <StatCard
                  title="Matches Played"
                  value={formatNumber(playerStats.matchesPlayed)}
                  subtitle="Total games"
                  icon="game-controller"
                  color="#2196F3"
                />

                <StatCard
                  title="Current Streak"
                  value={formatNumber(playerStats.currentStreak)}
                  subtitle={playerStats.currentStreak > 0 ? 'wins' : 'losses'}
                  icon="flame"
                  color={playerStats.currentStreak > 0 ? "#FF9800" : "#f44336"}
                />

                <StatCard
                  title="Performance Rating"
                  value={formatNumber(playerStats.performanceRating)}
                  subtitle="ELO rating"
                  icon="star"
                  color="#9C27B0"
                />

                <StatCard
                  title="Set Win Rate"
                  value={formatPercentage(playerStats.setWinRate)}
                  subtitle={`${playerStats.setsWon}W - ${playerStats.setsLost}L`}
                  icon="stats-chart"
                  color="#FF5722"
                />

                <StatCard
                  title="Best Set Score"
                  value={formatNumber(playerStats.bestSetScore)}
                  subtitle="Points in a set"
                  icon="medal"
                  color="#607D8B"
                />
              </View>
            )}

            {/* Recent Form */}
            {playerStats && playerStats.recentForm.length > 0 && (
              <View style={styles.recentForm}>
                <Text style={styles.sectionTitle}>Recent Form</Text>
                <View style={styles.formIndicators}>
                  {playerStats.recentForm.map((result, index) => (
                    <View
                      key={index}
                      style={[
                        styles.formIndicator,
                        { backgroundColor: result === 'W' ? '#4CAF50' : '#f44336' }
                      ]}
                    >
                      <Text style={styles.formText}>{result}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.formDescription}>
                  Last {playerStats.recentForm.length} matches
                </Text>
              </View>
            )}

            {/* Session Statistics */}
            {sessionStats && (
              <View style={styles.sessionStats}>
                <Text style={styles.sectionTitle}>Session Overview</Text>
                <View style={styles.sessionGrid}>
                  <View style={styles.sessionStat}>
                    <Text style={styles.sessionStatValue}>{sessionStats.totalMatches}</Text>
                    <Text style={styles.sessionStatLabel}>Total Matches</Text>
                  </View>
                  <View style={styles.sessionStat}>
                    <Text style={styles.sessionStatValue}>{sessionStats.totalPlayers}</Text>
                    <Text style={styles.sessionStatLabel}>Players</Text>
                  </View>
                  <View style={styles.sessionStat}>
                    <Text style={styles.sessionStatValue}>
                      {sessionStats.averageMatchesPerPlayer.toFixed(1)}
                    </Text>
                    <Text style={styles.sessionStatLabel}>Avg per Player</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {activeTab === 'detailed' && playerStats && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Detailed Statistics</Text>

            <View style={styles.detailedStats}>
              {/* Basic Stats */}
              <View style={styles.statGroup}>
                <Text style={styles.groupTitle}>Match Statistics</Text>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Total Matches:</Text>
                  <Text style={styles.statValue}>{playerStats.matchesPlayed}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Wins:</Text>
                  <Text style={styles.statValue}>{playerStats.wins}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Losses:</Text>
                  <Text style={styles.statValue}>{playerStats.losses}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Win Rate:</Text>
                  <Text style={styles.statValue}>{formatPercentage(playerStats.winRate)}</Text>
                </View>
              </View>

              {/* Set Statistics */}
              <View style={styles.statGroup}>
                <Text style={styles.groupTitle}>Set Statistics</Text>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Sets Won:</Text>
                  <Text style={styles.statValue}>{playerStats.setsWon}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Sets Lost:</Text>
                  <Text style={styles.statValue}>{playerStats.setsLost}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Set Win Rate:</Text>
                  <Text style={styles.statValue}>{formatPercentage(playerStats.setWinRate)}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Avg Points per Set:</Text>
                  <Text style={styles.statValue}>{playerStats.averagePointsPerSet.toFixed(1)}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Best Set Score:</Text>
                  <Text style={styles.statValue}>{playerStats.bestSetScore}</Text>
                </View>
              </View>

              {/* Performance Stats */}
              <View style={styles.statGroup}>
                <Text style={styles.groupTitle}>Performance Metrics</Text>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Performance Rating:</Text>
                  <Text style={styles.statValue}>{playerStats.performanceRating}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Win Streak:</Text>
                  <Text style={styles.statValue}>{playerStats.winStreak}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Comeback Wins:</Text>
                  <Text style={styles.statValue}>{playerStats.comebackWins}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Dominant Wins:</Text>
                  <Text style={styles.statValue}>{playerStats.dominantWins}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'leaderboard' && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Leaderboard</Text>

            {leaderboard.length > 0 ? (
              <View style={styles.leaderboard}>
                {leaderboard.slice(0, 10).map((entry, index) => (
                  <View key={entry.playerId} style={styles.leaderboardRow}>
                    <View style={styles.rankContainer}>
                      <Text style={styles.rank}>{entry.rank}</Text>
                    </View>

                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName}>{entry.playerName}</Text>
                      <Text style={styles.playerStats}>
                        {formatPercentage(entry.winRate)} • {entry.matchesPlayed} matches
                      </Text>
                    </View>

                    <View style={styles.ratingContainer}>
                      <Text style={styles.rating}>{entry.performanceRating}</Text>
                      <Ionicons
                        name={
                          entry.trend === 'up' ? 'trending-up' :
                          entry.trend === 'down' ? 'trending-down' :
                          'remove'
                        }
                        size={16}
                        color={
                          entry.trend === 'up' ? '#4CAF50' :
                          entry.trend === 'down' ? '#f44336' :
                          '#9E9E9E'
                        }
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="trophy-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No leaderboard data available</Text>
                <Text style={styles.emptySubtext}>Play some matches to see rankings!</Text>
              </View>
            )}
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  tabContent: {
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    width: (width - 32 - 16) / 2, // Two cards per row with margin
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendIcon: {
    marginLeft: 8,
  },
  statContent: {
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  statTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  statSubtitle: {
    fontSize: 12,
    color: '#999',
  },
  recentForm: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  formIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  formIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  formText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  formDescription: {
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
  },
  sessionStats: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
  },
  sessionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  sessionStat: {
    alignItems: 'center',
  },
  sessionStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  sessionStatLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  detailedStats: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
  },
  statGroup: {
    marginBottom: 24,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  leaderboard: {
    backgroundColor: 'white',
    borderRadius: 8,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rankContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rank: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  playerStats: {
    fontSize: 12,
    color: '#666',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rating: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});

export default StatisticsDashboardScreen;