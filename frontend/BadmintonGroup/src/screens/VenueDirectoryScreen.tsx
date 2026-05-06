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

interface VenueEntry {
  name: string;
  address: string;
  sessionCount: number;
  upcomingSessions: number;
  latitude?: number;
  longitude?: number;
}

export default function VenueDirectoryScreen() {
  const [venues, setVenues] = useState<VenueEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchVenues = useCallback(async (isRefresh = false, append = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else if (!append) setLoading(true);
      else setLoadingMore(true);

      const currentOffset = append ? offset : 0;
      const response = await fetch(
        `${API_BASE_URL}/community/venues?limit=25&offset=${currentOffset}`
      );
      const result = await response.json();

      if (result.success) {
        const newVenues = result.data.venues || [];
        if (append) {
          setVenues(prev => [...prev, ...newVenues]);
          setOffset(currentOffset + newVenues.length);
        } else {
          setVenues(newVenues);
          setOffset(newVenues.length);
        }
        setTotalCount(result.data.totalCount || 0);
      }
    } catch (error) {
      console.error('Fetch venues error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [offset]);

  useEffect(() => { fetchVenues(); }, []);

  const handleRefresh = () => fetchVenues(true);
  const handleLoadMore = () => {
    if (!loadingMore && venues.length < totalCount) {
      fetchVenues(false, true);
    }
  };

  const renderVenue = ({ item, index }: { item: VenueEntry; index: number }) => (
    <View style={styles.venueCard}>
      <View style={styles.venueIcon}>
        <Ionicons name="location" size={28} color="#007AFF" />
      </View>
      <View style={styles.venueInfo}>
        <Text style={styles.venueName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.venueAddress} numberOfLines={1}>{item.address}</Text>
        <View style={styles.venueStats}>
          <View style={styles.statTag}>
            <Ionicons name="calendar-outline" size={12} color="#007AFF" />
            <Text style={styles.statTagText}>{item.upcomingSessions} upcoming</Text>
          </View>
          <View style={styles.statTag}>
            <Ionicons name="stats-chart-outline" size={12} color="#4CAF50" />
            <Text style={styles.statTagText}>{item.sessionCount} total</Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#ccc" />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading venues...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📍 Venue Directory</Text>
        <Text style={styles.subtitle}>{totalCount} venues with upcoming sessions</Text>
      </View>

      <FlatList
        data={venues}
        keyExtractor={(item, idx) => `${item.name}-${idx}`}
        renderItem={renderVenue}
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
            <Ionicons name="business-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No venues yet</Text>
            <Text style={styles.emptySubtext}>Venues appear when sessions are scheduled</Text>
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
  subtitle: { fontSize: 14, color: '#757575' },
  listContent: { padding: 12, paddingBottom: 32 },
  venueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  venueIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  venueInfo: { flex: 1 },
  venueName: { fontSize: 16, fontWeight: '600', color: '#212121', marginBottom: 2 },
  venueAddress: { fontSize: 13, color: '#757575', marginBottom: 6 },
  venueStats: { flexDirection: 'row', gap: 8 },
  statTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  statTagText: { fontSize: 11, color: '#666' },
  footer: { paddingVertical: 16, alignItems: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#666', marginTop: 12 },
  emptySubtext: { fontSize: 14, color: '#999', marginTop: 4 },
});
