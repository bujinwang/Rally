import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../config/api';
import { userApi, SearchUser } from '../services/userApi';

interface NearbyPlayerResult {
  id: string;
  name: string;
  gamesPlayed: number;
  winRate: number;
}

type FilterTab = 'search' | 'nearby' | 'active';

export default function PlayerSearchScreen() {
  const [activeTab, setActiveTab] = useState<FilterTab>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [nearbyPlayers, setNearbyPlayers] = useState<NearbyPlayerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Load nearby players on mount
  useEffect(() => {
    if (activeTab === 'nearby') {
      loadNearbyPlayers();
    }
  }, [activeTab]);

  // Debounced search
  useEffect(() => {
    if (activeTab !== 'search' || searchQuery.trim().length < 2) {
      if (searchQuery.trim().length === 0) setSearchResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const results = await userApi.searchUsers(searchQuery, 30);
        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, activeTab]);

  const loadNearbyPlayers = async () => {
    try {
      setLoadingNearby(true);
      const response = await fetch(`${API_BASE_URL}/community/nearby?limit=50`);
      const result = await response.json();
      if (result.success) {
        setNearbyPlayers(result.data.players || []);
      }
    } catch (error) {
      console.error('Nearby players error:', error);
    } finally {
      setLoadingNearby(false);
    }
  };

  const getWinRateColor = (rate: number): string => {
    if (rate >= 0.6) return '#4CAF50';
    if (rate >= 0.4) return '#FF9800';
    if (rate > 0) return '#F44336';
    return '#999';
  };

  const getWinRateLabel = (rate: number): string => {
    if (rate >= 0.6) return 'Excellent';
    if (rate >= 0.4) return 'Good';
    if (rate > 0) return 'Developing';
    return 'New';
  };

  const renderSearchResult = ({ item }: { item: SearchUser }) => (
    <View style={styles.playerCard}>
      <View style={styles.avatarCircle}>
        <Ionicons name="person" size={22} color="#fff" />
      </View>
      <View style={styles.playerInfo}>
        <Text style={styles.playerName}>{item.name}</Text>
        <Text style={styles.playerRole}>{item.role || 'Player'}</Text>
      </View>
      <TouchableOpacity style={styles.viewButton}>
        <Text style={styles.viewButtonText}>View</Text>
      </TouchableOpacity>
    </View>
  );

  const renderNearbyPlayer = ({ item }: { item: NearbyPlayerResult }) => {
    const color = getWinRateColor(item.winRate);
    return (
      <View style={styles.playerCard}>
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={22} color="#fff" />
        </View>
        <View style={styles.playerInfo}>
          <Text style={styles.playerName}>{item.name}</Text>
          <Text style={styles.playerMeta}>{item.gamesPlayed} games played</Text>
        </View>
        <View style={[styles.winRateBadge, { backgroundColor: color + '20' }]}>
          <Text style={[styles.winRateText, { color }]}>
            {item.winRate > 0 ? `${(item.winRate * 100).toFixed(0)}%` : '—'}
          </Text>
          <Text style={[styles.winRateLabel, { color }]}>
            {getWinRateLabel(item.winRate)}
          </Text>
        </View>
      </View>
    );
  };

  const tabs: { key: FilterTab; label: string; icon: string }[] = [
    { key: 'search', label: 'Search', icon: 'search-outline' },
    { key: 'nearby', label: 'Nearby', icon: 'navigate-outline' },
    { key: 'active', label: 'Active', icon: 'flash-outline' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>👥 Find Players</Text>
        <Text style={styles.subtitle}>Connect with players in the community</Text>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {tabs.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Ionicons
                name={tab.icon as any}
                size={16}
                color={activeTab === tab.key ? '#007AFF' : '#888'}
              />
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search bar (search tab only) */}
        {activeTab === 'search' && (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search players by name..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              placeholderTextColor="#999"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#999" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Content */}
      {activeTab === 'search' ? (
        <FlatList
          data={searchResults}
          keyExtractor={item => item.id}
          renderItem={renderSearchResult}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name={searchQuery.length >= 2 ? 'search-outline' : 'people-outline'}
                size={64}
                color="#ccc"
              />
              <Text style={styles.emptyText}>
                {searchQuery.length >= 2 ? 'No players found' : 'Search for players'}
              </Text>
              <Text style={styles.emptySubtext}>
                {searchQuery.length >= 2
                  ? 'Try a different name'
                  : 'Type at least 2 characters to search'}
              </Text>
            </View>
          }
          ListHeaderComponent={
            searching ? (
              <View style={styles.searchingBar}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.searchingText}>Searching...</Text>
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        <FlatList
          data={nearbyPlayers}
          keyExtractor={item => item.id}
          renderItem={renderNearbyPlayer}
          refreshControl={
            <RefreshControl
              refreshing={loadingNearby}
              onRefresh={loadNearbyPlayers}
              tintColor="#007AFF"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="navigate-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>
                {activeTab === 'active' ? 'No active players' : 'No nearby players'}
              </Text>
              <Text style={styles.emptySubtext}>
                {activeTab === 'active'
                  ? 'Players in active sessions appear here'
                  : 'Players near you will appear here'}
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#212121', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#757575', marginBottom: 12 },
  tabRow: { flexDirection: 'row', marginBottom: 10, gap: 4 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    gap: 4,
  },
  tabActive: { backgroundColor: '#E3F2FD' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#888' },
  tabTextActive: { color: '#007AFF' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 4,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#333', padding: 0 },
  searchingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  searchingText: { fontSize: 13, color: '#007AFF' },
  listContent: { padding: 12, paddingBottom: 32 },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 16, fontWeight: '600', color: '#212121' },
  playerRole: { fontSize: 12, color: '#999', marginTop: 2 },
  playerMeta: { fontSize: 12, color: '#999', marginTop: 2 },
  viewButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#E3F2FD',
    borderRadius: 16,
  },
  viewButtonText: { color: '#007AFF', fontSize: 13, fontWeight: '600' },
  winRateBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
  },
  winRateText: { fontSize: 16, fontWeight: 'bold' },
  winRateLabel: { fontSize: 10, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#666', marginTop: 12 },
  emptySubtext: { fontSize: 14, color: '#999', marginTop: 4, textAlign: 'center' },
});
