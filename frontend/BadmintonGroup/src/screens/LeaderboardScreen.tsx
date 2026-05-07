import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';

const API_BASE_URL = 'http://localhost:3001/api/v1';

interface LeaderboardPlayer {
  rank: number;
  name: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  matchesPlayed: number;
  matchWins: number;
  matchLosses: number;
  matchWinRate: number;
  totalSetsWon: number;
  totalSetsLost: number;
}

type SortOption = 'winRate' | 'matchWinRate' | 'wins';

export const LeaderboardScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { shareCode } = route.params as { shareCode: string };

  const [leaderboard, setLeaderboard] = useState<LeaderboardPlayer[]>([]);
  const [sessionName, setSessionName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('winRate');

  useEffect(() => {
    fetchLeaderboard();
  }, [shareCode, sortBy]);

  const fetchLeaderboard = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await fetch(
        `${API_BASE_URL}/scoring/${shareCode}/leaderboard?sortBy=${sortBy}`
      );
      const data = await response.json();

      if (data.success) {
        setLeaderboard(data.data.leaderboard);
        setSessionName(data.data.sessionName);
      }
    } catch (error) {
      console.error('Fetch leaderboard error:', error);
      Alert.alert('Error', 'Failed to load leaderboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchLeaderboard(true);
  };

  const handleSortChange = (newSort: SortOption) => {
    setSortBy(newSort);
  };

  const getRankEmoji = (rank: number): string => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `${rank}`;
  };

  const renderPlayer = ({ item }: { item: LeaderboardPlayer }) => (
    <View style={[
      styles.playerCard,
      item.rank <= 3 && styles.topThreeCard
    ]}>
      {/* Rank */}
      <View style={styles.rankSection}>
        <Text style={[
          styles.rankText,
          item.rank === 1 && styles.firstPlace,
          item.rank === 2 && styles.secondPlace,
          item.rank === 3 && styles.thirdPlace
        ]}>
          {getRankEmoji(item.rank)}
        </Text>
      </View>

      {/* Player Info */}
      <View style={styles.playerInfo}>
        <Text style={styles.playerName}>{item.name}</Text>
        <Text style={styles.gamesPlayed}>
          {item.gamesPlayed} game{item.gamesPlayed !== 1 ? 's' : ''} • 
          {item.matchesPlayed} match{item.matchesPlayed !== 1 ? 'es' : ''}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsSection}>
        {sortBy === 'winRate' && (
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {(item.winRate * 100).toFixed(0)}%
            </Text>
            <Text style={styles.statLabel}>Win Rate</Text>
          </View>
        )}
        
        {sortBy === 'matchWinRate' && (
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {(item.matchWinRate * 100).toFixed(0)}%
            </Text>
            <Text style={styles.statLabel}>Match Win %</Text>
          </View>
        )}
        
        {sortBy === 'wins' && (
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{item.wins}</Text>
            <Text style={styles.statLabel}>Wins</Text>
          </View>
        )}

        <View style={styles.recordBox}>
          <Text style={styles.recordText}>
            {item.wins}W - {item.losses}L
          </Text>
          <Text style={styles.recordSubtext}>
            Sets: {item.totalSetsWon}-{item.totalSetsLost}
          </Text>
        </View>
      </View>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.sessionTitle}>{sessionName}</Text>
      <Text style={styles.subtitle}>Leaderboard</Text>

      {/* Sort Options */}
      <View style={styles.sortContainer}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        <View style={styles.sortButtons}>
          <TouchableOpacity
            style={[
              styles.sortButton,
              sortBy === 'winRate' && styles.sortButtonActive
            ]}
            onPress={() => handleSortChange('winRate')}
          >
            <Text style={[
              styles.sortButtonText,
              sortBy === 'winRate' && styles.sortButtonTextActive
            ]}>
              Game Win %
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sortButton,
              sortBy === 'matchWinRate' && styles.sortButtonActive
            ]}
            onPress={() => handleSortChange('matchWinRate')}
          >
            <Text style={[
              styles.sortButtonText,
              sortBy === 'matchWinRate' && styles.sortButtonTextActive
            ]}>
              Match Win %
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sortButton,
              sortBy === 'wins' && styles.sortButtonActive
            ]}
            onPress={() => handleSortChange('wins')}
          >
            <Text style={[
              styles.sortButtonText,
              sortBy === 'wins' && styles.sortButtonTextActive
            ]}>
              Total Wins
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading leaderboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={leaderboard}
        renderItem={renderPlayer}
        keyExtractor={(item) => `${item.rank}-${item.name}`}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#2196F3']}
          />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No players yet</Text>
            <Text style={styles.emptySubtext}>
              Play some games to see rankings
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  listContent: {
    padding: 16,
  },
  header: {
    marginBottom: 20,
  },
  sessionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 16,
  },
  sortContainer: {
    marginTop: 16,
  },
  sortLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  sortButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  sortButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  sortButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#1976D2',
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  sortButtonTextActive: {
    color: 'white',
  },
  playerCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  topThreeCard: {
    borderWidth: 2,
    borderColor: '#FFD700',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  rankSection: {
    width: 50,
    alignItems: 'center',
  },
  rankText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#666',
  },
  firstPlace: {
    fontSize: 32,
  },
  secondPlace: {
    fontSize: 28,
  },
  thirdPlace: {
    fontSize: 26,
  },
  playerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  playerName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  gamesPlayed: {
    fontSize: 13,
    color: '#666',
  },
  statsSection: {
    alignItems: 'flex-end',
  },
  statItem: {
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
  },
  recordBox: {
    backgroundColor: '#F5F5F5',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  recordText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  recordSubtext: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
});

export default LeaderboardScreen;
