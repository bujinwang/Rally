import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { rankingApi, RankingEntry } from '../services/rankingApi';

interface RouteParams {
  sessionId?: string;
  mode?: 'session' | 'global';
}

const RankingScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params as RouteParams;

  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'session' | 'global'>(params?.mode || 'global');
  const [minMatches, setMinMatches] = useState(0);

  useEffect(() => {
    loadRankings();
  }, [mode, minMatches, params?.sessionId]);

  const loadRankings = async () => {
    try {
      setLoading(true);
      setError(null);

      let data: RankingEntry[];
      if (mode === 'session' && params?.sessionId) {
        data = await rankingApi.getSessionRankings(params.sessionId, minMatches);
      } else {
        data = await rankingApi.getGlobalRankings(minMatches, 100);
      }

      setRankings(data);
    } catch (err) {
      console.error('Error loading rankings:', err);
      setError('Failed to load rankings');
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `${rank}`;
  };

  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'up': return '📈';
      case 'down': return '📉';
      case 'stable': return '➡️';
      default: return '➡️';
    }
  };

  const renderRankingItem = ({ item, index }: { item: RankingEntry; index: number }) => (
    <TouchableOpacity
      style={styles.rankingItem}
      onPress={() => {
        // Navigate to player profile or statistics
        Alert.alert('Player Details', `View ${item.name}'s profile?`);
      }}
    >
      <View style={styles.rankContainer}>
        <Text style={styles.rankText}>{getRankIcon(item.ranking)}</Text>
        <Text style={styles.trendIcon}>{getTrendIcon(item.trend)}</Text>
      </View>

      <View style={styles.playerInfo}>
        <Text style={styles.playerName}>{item.name}</Text>
        <Text style={styles.playerStats}>
          {item.matchesPlayed} matches • {item.winRate.toFixed(1)}% win rate
        </Text>
      </View>

      <View style={styles.pointsContainer}>
        <Text style={styles.pointsText}>{item.rankingPoints}</Text>
        <Text style={styles.pointsLabel}>points</Text>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="trophy-outline" size={64} color="#ccc" />
      <Text style={styles.emptyTitle}>No Rankings Yet</Text>
      <Text style={styles.emptyText}>
        Rankings will appear after players complete matches
      </Text>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.errorContainer}>
      <Ionicons name="alert-circle-outline" size={64} color="#ff6b6b" />
      <Text style={styles.errorTitle}>Unable to Load Rankings</Text>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={loadRankings}>
        <Text style={styles.retryText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading rankings...</Text>
      </View>
    );
  }

  if (error) {
    return renderErrorState();
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {mode === 'session' ? 'Session Rankings' : 'Global Rankings'}
        </Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={loadRankings}
        >
          <Ionicons name="refresh" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Mode Toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'global' && styles.modeButtonActive]}
          onPress={() => setMode('global')}
        >
          <Text style={[styles.modeButtonText, mode === 'global' && styles.modeButtonTextActive]}>
            Global
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'session' && styles.modeButtonActive]}
          onPress={() => setMode('session')}
          disabled={!params?.sessionId}
        >
          <Text style={[
            styles.modeButtonText,
            mode === 'session' && styles.modeButtonTextActive,
            !params?.sessionId && styles.modeButtonTextDisabled
          ]}>
            Session
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        <Text style={styles.filterLabel}>Minimum Matches:</Text>
        <View style={styles.filterButtons}>
          {[0, 5, 10, 20].map((matches) => (
            <TouchableOpacity
              key={matches}
              style={[styles.filterButton, minMatches === matches && styles.filterButtonActive]}
              onPress={() => setMinMatches(matches)}
            >
              <Text style={[styles.filterButtonText, minMatches === matches && styles.filterButtonTextActive]}>
                {matches === 0 ? 'All' : matches}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Rankings List */}
      {rankings.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={rankings}
          keyExtractor={(item) => item.id}
          renderItem={renderRankingItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
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
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  refreshButton: {
    padding: 5,
  },
  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginVertical: 10,
    backgroundColor: '#e9ecef',
    borderRadius: 8,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  modeButtonActive: {
    backgroundColor: '#007AFF',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  modeButtonTextDisabled: {
    color: '#ccc',
  },
  filters: {
    marginHorizontal: 20,
    marginBottom: 10,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  listContainer: {
    padding: 20,
  },
  rankingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  rankContainer: {
    width: 50,
    alignItems: 'center',
  },
  rankText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  trendIcon: {
    fontSize: 14,
    marginTop: 2,
  },
  playerInfo: {
    flex: 1,
    marginLeft: 12,
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
  pointsContainer: {
    alignItems: 'flex-end',
  },
  pointsText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  pointsLabel: {
    fontSize: 10,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default RankingScreen;