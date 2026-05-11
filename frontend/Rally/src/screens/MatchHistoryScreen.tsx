// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  matchHistoryApi,
  MatchHistoryUtils,
  MatchRecord,
} from '../services/matchHistoryApi';
import { DEVICE_ID_KEY } from '../config/api';

export default function MatchHistoryScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [summary, setSummary] = useState({ totalMatches: 0, completedMatches: 0, inProgressMatches: 0, cancelledMatches: 0 });
  const [deviceId, setDeviceId] = useState('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'COMPLETED' | 'IN_PROGRESS'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'score' | 'session'>('date');

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    const storedDeviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (storedDeviceId) {
      setDeviceId(storedDeviceId);
      await loadMatches(storedDeviceId);
    } else {
      setLoading(false);
    }
  };

  const loadMatches = async (currentDeviceId?: string) => {
    try {
      setLoading(true);
      const id = currentDeviceId || deviceId;
      if (!id) return;

      const response = await matchHistoryApi.getMatchHistory({ deviceId: id });
      setMatches(response.data.matches);
      setSummary(response.data.summary);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load match history: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMatches();
    setRefreshing(false);
  };

  const filteredMatches = useMemo(() => {
    let result = MatchHistoryUtils.filterByStatus(matches, statusFilter);
    result = MatchHistoryUtils.filterByPlayer(result, searchQuery);
    result = MatchHistoryUtils.sortMatches(result, sortBy);
    return result;
  }, [matches, searchQuery, statusFilter, sortBy]);

  const uniquePlayers = useMemo(() => MatchHistoryUtils.getUniquePlayers(matches), [matches]);

  if (loading && matches.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading match history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber}>{summary.totalMatches}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNumber, { color: '#4CAF50' }]}>{summary.completedMatches}</Text>
          <Text style={styles.summaryLabel}>Completed</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNumber, { color: '#FF9800' }]}>{summary.inProgressMatches}</Text>
          <Text style={styles.summaryLabel}>In Progress</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNumber, { color: '#F44336' }]}>{summary.cancelledMatches}</Text>
          <Text style={styles.summaryLabel}>Cancelled</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder="Filter by player name..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Pills */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPills}>
          {(['all', 'COMPLETED', 'IN_PROGRESS'] as const).map((status) => (
            <TouchableOpacity
              key={status}
              style={[styles.filterPill, statusFilter === status && styles.filterPillActive]}
              onPress={() => setStatusFilter(status)}
            >
              <Text style={[styles.filterPillText, statusFilter === status && styles.filterPillTextActive]}>
                {status === 'all' ? 'All' : status === 'COMPLETED' ? 'Completed' : 'In Progress'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Sort Row */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort:</Text>
        {(['date', 'score', 'session'] as const).map((sort) => (
          <TouchableOpacity
            key={sort}
            style={[styles.sortPill, sortBy === sort && styles.sortPillActive]}
            onPress={() => setSortBy(sort)}
          >
            <Text style={[styles.sortPillText, sortBy === sort && styles.sortPillTextActive]}>
              {sort === 'date' ? 'Date' : sort === 'score' ? 'Score' : 'Session'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Match List */}
      <ScrollView
        style={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {filteredMatches.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="tennisball-outline" size={48} color="#ccc" />
            <Text style={styles.emptyTitle}>No matches found</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? 'Try a different player name' : 'Complete some games to see them here'}
            </Text>
          </View>
        ) : (
          filteredMatches.map((match) => (
            <MatchCard key={match.id} match={match} navigation={navigation} />
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function MatchCard({ match, navigation }: { match: MatchRecord; navigation: any }) {
  const isCompleted = match.status === 'COMPLETED';
  const team1Won = match.winnerTeam === 1;
  const team2Won = match.winnerTeam === 2;

  return (
    <TouchableOpacity
      style={styles.matchCard}
      onPress={() => {
        navigation.navigate('SessionDetail', {
          sessionId: match.sessionId,
          shareCode: '', // will be resolved by session detail
        });
      }}
      activeOpacity={0.7}
    >
      {/* Header: Session + Date */}
      <View style={styles.matchHeader}>
        <View style={styles.matchNumberBadge}>
          <Text style={styles.matchNumberText}>#{match.gameNumber}</Text>
        </View>
        <View style={styles.matchMeta}>
          <Text style={styles.sessionName} numberOfLines={1}>{match.sessionName}</Text>
          <Text style={styles.matchDate}>
            {new Date(match.sessionDate).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </View>
        {isCompleted ? (
          <View style={[styles.statusBadge, team1Won ? styles.winBadge : styles.lossBadge]}>
            <Ionicons
              name={team1Won ? 'trophy' : 'trophy-outline'}
              size={12}
              color="#fff"
            />
          </View>
        ) : (
          <View style={[styles.statusBadge, styles.pendingBadge]}>
            <Ionicons name="time-outline" size={12} color="#fff" />
          </View>
        )}
      </View>

      {/* Teams & Score */}
      <View style={styles.teamsRow}>
        <View style={[styles.teamBlock, team1Won && styles.winnerBlock]}>
          <Text style={styles.teamPlayer} numberOfLines={1}>{match.team1Player1}</Text>
          <Text style={styles.teamPlayer} numberOfLines={1}>{match.team1Player2}</Text>
          {isCompleted && (
            <Text style={[styles.teamScore, team1Won && styles.winnerScore]}>
              {match.team1Score}
            </Text>
          )}
        </View>

        <View style={styles.vsContainer}>
          <Text style={styles.vsText}>VS</Text>
        </View>

        <View style={[styles.teamBlock, team2Won && styles.winnerBlock]}>
          <Text style={styles.teamPlayer} numberOfLines={1}>{match.team2Player1}</Text>
          <Text style={styles.teamPlayer} numberOfLines={1}>{match.team2Player2}</Text>
          {isCompleted && (
            <Text style={[styles.teamScore, team2Won && styles.winnerScore]}>
              {match.team2Score}
            </Text>
          )}
        </View>
      </View>

      {/* Footer */}
      {match.courtName ? (
        <View style={styles.matchFooter}>
          <Ionicons name="location-outline" size={12} color="#999" />
          <Text style={styles.footerText}>{match.courtName}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
    fontWeight: '500',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  filterRow: {
    marginTop: 10,
    marginBottom: 4,
  },
  filterPills: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  filterPillActive: {
    backgroundColor: '#007AFF',
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  filterPillTextActive: {
    color: '#fff',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  sortLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    marginRight: 2,
  },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
  },
  sortPillActive: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  sortPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  sortPillTextActive: {
    color: '#007AFF',
  },
  list: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 4,
    textAlign: 'center',
  },
  matchCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  matchNumberBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    width: 32,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  matchNumberText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  matchMeta: {
    flex: 1,
  },
  sessionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  matchDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 1,
  },
  statusBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  winBadge: {
    backgroundColor: '#4CAF50',
  },
  lossBadge: {
    backgroundColor: '#F44336',
  },
  pendingBadge: {
    backgroundColor: '#FF9800',
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamBlock: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  winnerBlock: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  teamPlayer: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
  },
  teamScore: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 4,
  },
  winnerScore: {
    color: '#4CAF50',
  },
  vsContainer: {
    paddingHorizontal: 12,
  },
  vsText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ccc',
  },
  matchFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
  },
});
