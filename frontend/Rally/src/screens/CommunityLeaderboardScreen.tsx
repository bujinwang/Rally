import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../config/api';

interface CommunityPlayer {
  rank: number;
  playerId: string;
  playerName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  matchesPlayed: number;
  matchWins: number;
  matchLosses: number;
  matchWinRate: number;
}

type SortOption = 'winRate' | 'matchWinRate' | 'wins' | 'gamesPlayed';

export default function CommunityLeaderboardScreen() {
  const [players, setPlayers] = useState<CommunityPlayer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('winRate');
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchLeaderboard = useCallback(async (isRefresh = false, append = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else if (!append) setLoading(true);
      else setLoadingMore(true);

      const currentOffset = append ? offset : 0;

      const response = await fetch(
        `${API_BASE_URL}/community/leaderboard?sortBy=${sortBy}&limit=25&offset=${currentOffset}`
      );
      const result = await response.json();

      if (result.success) {
        const newPlayers = result.data.leaderboard || [];
        if (append) {
          setPlayers(prev => [...prev, ...newPlayers]);
          setOffset(currentOffset + newPlayers.length);
        } else {
          setPlayers(newPlayers);
          setOffset(newPlayers.length);
        }
        setTotalCount(result.data.totalCount || 0);
      }
    } catch (error) {
      console.error('Fetch community leaderboard error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [sortBy, offset]);

  useEffect(() => {
    fetchLeaderboard();
  }, [sortBy]);

  const handleRefresh = () => fetchLeaderboard(true);

  const handleLoadMore = () => {
    if (!loadingMore && players.length < totalCount) {
      fetchLeaderboard(false, true);
    }
  };

  const getRankEmoji = (rank: number): string => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const sortOptions: { key: SortOption; label: string }[] = [
    { key: 'winRate', label: 'Win %' },
    { key: 'matchWinRate', label: 'Match %' },
    { key: 'wins', label: 'Wins' },
    { key: 'gamesPlayed', label: 'Games' },
  ];

  const renderPlayer = ({ item }: { item: CommunityPlayer }) => (
    <View style={[styles.playerCard, item.rank <= 3 && styles.topCard]}>
      <View style={styles.rankSection}>
        <Text style={[styles.rankText, item.rank <= 3 && styles.medalRank]}>
          {getRankEmoji(item.rank)}
        </Text>
      </View>
      <View style={styles.playerInfo}>
        <Text style={styles.playerName} numberOfLines={1}>{item.playerName}</Text>
        <Text style={styles.playerMeta}>
          {item.gamesPlayed} games · {item.matchesPlayed} matches
        </Text>
      </View>
      <View style={styles.statsSection}>
        {sortBy === 'winRate' && (
          <Text style={styles.statPrimary}>{(item.winRate * 100).toFixed(0)}%</Text>
        )}
        {sortBy === 'matchWinRate' && (
          <Text style={styles.statPrimary}>{(item.matchWinRate * 100).toFixed(0)}%</Text>
        )}
        {sortBy === 'wins' && (
          <Text style={styles.statPrimary}>{item.wins}</Text>
        )}
        {sortBy === 'gamesPlayed' && (
          <Text style={styles.statPrimary}>{item.gamesPlayed}</Text>
        )}
        <Text style={styles.recordText}>{item.wins}W - {item.losses}L</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading leaderboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🏆 Community Rankings</Text>
        <Text style={styles.subtitle}>{totalCount} ranked players</Text>

        {/* Sort buttons */}
        <View style={styles.sortRow}>
          {sortOptions.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.sortBtn, sortBy === opt.key && styles.sortBtnActive]}
              onPress={() => setSortBy(opt.key)}
            >
              <Text style={[styles.sortBtnText, sortBy === opt.key && styles.sortBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={players}
        keyExtractor={item => item.playerId}
        renderItem={renderPlayer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#007AFF" />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color="#007AFF" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="trophy-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No rankings yet</Text>
            <Text style={styles.emptySubtext}>Play games to appear on the leaderboard</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#212121', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#757575', marginBottom: 12 },
  sortRow: { flexDirection: 'row', gap: 8 },
  sortBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  sortBtnActive: { backgroundColor: '#007AFF' },
  sortBtnText: { fontSize: 13, fontWeight: '600', color: '#666' },
  sortBtnTextActive: { color: '#fff' },
  listContent: { padding: 12, paddingBottom: 32 },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  topCard: { borderColor: '#FFD700', borderWidth: 1.5 },
  rankSection: { width: 50, alignItems: 'center' },
  rankText: { fontSize: 14, fontWeight: '700', color: '#888' },
  medalRank: { fontSize: 22 },
  playerInfo: { flex: 1, marginLeft: 8 },
  playerName: { fontSize: 16, fontWeight: '600', color: '#212121' },
  playerMeta: { fontSize: 12, color: '#999', marginTop: 2 },
  statsSection: { alignItems: 'flex-end' },
  statPrimary: { fontSize: 20, fontWeight: 'bold', color: '#007AFF' },
  recordText: { fontSize: 12, color: '#888', marginTop: 2 },
  footer: { paddingVertical: 16, alignItems: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#666', marginTop: 12 },
  emptySubtext: { fontSize: 14, color: '#999', marginTop: 4 },
});
