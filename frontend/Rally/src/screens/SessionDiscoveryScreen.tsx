// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import discoveryApi, { DiscoveryResult, DiscoveryFilters } from '../services/discoveryApi';
import SessionFilters from '../components/SessionFilters';
import SessionCard from '../components/SessionCard';
import { useLocation } from '../hooks/useLocation';
import { SPORTS, SPORT_LIST, SportKey, getPreferredSport, setPreferredSport } from '../config/sports';

const SessionDiscoveryScreen: React.FC = () => {
  const navigation = useNavigation();
  const { location, requestLocationPermission } = useLocation();

  const [sessions, setSessions] = useState<DiscoveryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState<DiscoveryFilters>({
    sport: getPreferredSport(),
    limit: 20,
    offset: 0,
  });
  const [activeSport, setActiveSport] = useState<SportKey>(getPreferredSport());
  const [viewMode, setViewMode] = useState<'discover' | 'recommended' | 'nearby'>('discover');
  const [searchQuery, setSearchQuery] = useState('');
  const [recommended, setRecommended] = useState<any[]>([]);
  const [nearby, setNearby] = useState<any[]>([]);
  const [deviceId, setDeviceId] = useState('');

  // Real-time discovery state
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState(false);

  // Load sessions with current filters
  const loadSessions = useCallback(async (newFilters?: DiscoveryFilters, append: boolean = false) => {
    try {
      setLoading(true);
      const searchFilters = { ...filters, ...newFilters };

      // Add location if available
      if (location) {
        searchFilters.latitude = location.latitude;
        searchFilters.longitude = location.longitude;
        searchFilters.radius = searchFilters.radius || 50; // Default 50km radius
      }

      const result = await discoveryApi.discoverSessions(searchFilters);

      if (append) {
        setSessions(prev => [...prev, ...result.sessions]);
      } else {
        setSessions(result.sessions);
      }

      setTotalCount(result.totalCount);
      setFilters(searchFilters);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      Alert.alert('Error', 'Failed to load sessions. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters, location]);

  // Load personalized recommendations
  const loadRecommended = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`http://localhost:3001/api/v1/sessions/discovery/recommended/${deviceId}?latitude=${location?.latitude || ''}&longitude=${location?.longitude || ''}&limit=10`);
      const data = await res.json();
      if (data.success) setRecommended(data.data);
    } catch (e) {
      console.warn('Recommendations failed:', e);
    } finally {
      setLoading(false);
    }
  }, [deviceId, location]);

  // Load nearby sessions
  const loadNearby = useCallback(async () => {
    try {
      setLoading(true);
      if (!location) return;
      const res = await fetch(`http://localhost:3001/api/v1/sessions/discovery/nearby?latitude=${location.latitude}&longitude=${location.longitude}&radius=10`);
      const data = await res.json();
      if (data.success) setNearby(data.data.sessions || []);
    } catch (e) {
      console.warn('Nearby failed:', e);
    } finally {
      setLoading(false);
    }
  }, [location]);

  // Initialize real-time discovery updates
  useEffect(() => {
    const init = async () => {
      try {
        const id = await require('../services/sessionApi').default.getDeviceId();
        setDeviceId(id);
      } catch {}
    };
    init();
    discoveryApi.initializeRealTimeUpdates();
    setIsRealTimeEnabled(true);

    const handleSessionCreated = (data: { session: DiscoveryResult; timestamp: string }) => {
      console.log('🆕 Real-time session created:', data.session.name);
      setSessions(prev => {
        // Check if session already exists
        const exists = prev.find(s => s.id === data.session.id);
        if (exists) return prev;

        // Add new session at the beginning
        return [data.session, ...prev];
      });
      setTotalCount(prev => prev + 1);
    };

    const handleSessionUpdated = (data: { session: DiscoveryResult; timestamp: string }) => {
      console.log('🔄 Real-time session updated:', data.session.name);
      setSessions(prev => prev.map(s =>
        s.id === data.session.id ? { ...s, ...data.session } : s
      ));
    };

    const handleSessionTerminated = (data: { session: { id: string; shareCode: string }; timestamp: string }) => {
      console.log('🗑️ Real-time session terminated:', data.session.id);
      setSessions(prev => prev.filter(s => s.id !== data.session.id));
      setTotalCount(prev => Math.max(0, prev - 1));
    };

    const handleSessionReactivated = (data: { session: DiscoveryResult; timestamp: string }) => {
      console.log('🔄 Real-time session reactivated:', data.session.name);
      setSessions(prev => {
        // Check if session already exists
        const exists = prev.find((s: DiscoveryResult) => s.id === data.session.id);
        if (exists) {
          // Update existing session
          return prev.map((s: DiscoveryResult) =>
            s.id === data.session.id ? { ...s, ...data.session } : s
          );
        } else {
          // Add new session at the beginning
          return [data.session, ...prev];
        }
      });
      setTotalCount(prev => prev + 1); // Simplified - will be accurate enough for real-time updates
    };

    // Register discovery event listeners
    discoveryApi.addDiscoveryListener('session-created', handleSessionCreated);
    discoveryApi.addDiscoveryListener('session-updated', handleSessionUpdated);
    discoveryApi.addDiscoveryListener('session-terminated', handleSessionTerminated);
    discoveryApi.addDiscoveryListener('session-reactivated', handleSessionReactivated);

    return () => {
      // Cleanup discovery event listeners
      discoveryApi.removeDiscoveryListener('session-created', handleSessionCreated);
      discoveryApi.removeDiscoveryListener('session-updated', handleSessionUpdated);
      discoveryApi.removeDiscoveryListener('session-terminated', handleSessionTerminated);
      discoveryApi.removeDiscoveryListener('session-reactivated', handleSessionReactivated);
    };
  }, []);

  // Real-time discovery is now handled by the discoveryApi initialization above

  // Initial load
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Handle filter changes
  const handleFiltersChange = useCallback((newFilters: Partial<DiscoveryFilters>) => {
    const updatedFilters = { ...filters, ...newFilters, offset: 0 };
    setFilters(updatedFilters);
    loadSessions(updatedFilters, false);
  }, [filters, loadSessions]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadSessions({ ...filters, offset: 0 }, false);
  }, [filters, loadSessions]);

  // Handle load more
  const handleLoadMore = useCallback(() => {
    if (!loading && sessions.length < totalCount) {
      const nextOffset = filters.offset || 0 + (filters.limit || 20);
      loadSessions({ ...filters, offset: nextOffset }, true);
    }
  }, [loading, sessions.length, totalCount, filters, loadSessions]);

  // Handle session join
  const handleJoinSession = useCallback(async (session: DiscoveryResult) => {
    try {
      // For MVP, we'll use a simple device ID
      const deviceId = `device_${Date.now()}`;
      const playerName = 'Player'; // In real app, this would come from user profile

      await discoveryApi.joinSessionFromDiscovery(session.id, {
        playerName,
        deviceId,
      });

      Alert.alert(
        'Success',
        `Successfully joined ${session.name}!`,
        [
          {
            text: 'View Session',
            onPress: () => {
              // Navigate to session detail screen
              (navigation as any).navigate('SessionDetail', { sessionId: session.id });
            },
          },
          { text: 'OK' },
        ]
      );
    } catch (error) {
      console.error('Failed to join session:', error);
      Alert.alert('Error', 'Failed to join session. Please try again.');
    }
  }, [navigation]);

  // Handle location permission request
  const handleRequestLocation = useCallback(async () => {
    const granted = await requestLocationPermission();
    if (granted && location) {
      handleFiltersChange({
        latitude: location.latitude,
        longitude: location.longitude,
        radius: 50,
      });
    }
  }, [requestLocationPermission, location, handleFiltersChange]);

  // Render session item
  const renderSessionItem = useCallback(({ item }: { item: DiscoveryResult }) => (
    <SessionCard
      session={item}
      onJoin={() => handleJoinSession(item)}
      showDistance={!!location}
    />
  ), [handleJoinSession, location]);

  // Render empty state
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No sessions found</Text>
      <Text style={styles.emptySubtitle}>
        Try adjusting your filters or check back later for new sessions.
      </Text>
      {!location && (
        <TouchableOpacity style={styles.locationButton} onPress={handleRequestLocation}>
          <Text style={styles.locationButtonText}>Enable Location for Better Results</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Render footer (loading indicator for pagination)
  const renderFooter = () => {
    if (!loading || sessions.length === 0) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#007AFF" />
        <Text style={styles.footerText}>Loading more sessions...</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Discover Sessions</Text>
          {isRealTimeEnabled && (
            <View style={styles.realTimeIndicator}>
              <View style={styles.realTimeDot} />
              <Text style={styles.realTimeText}>Live</Text>
            </View>
          )}
        </View>
        <Text style={styles.subtitle}>
          Find badminton games near you
        </Text>
      </View>

      {/* Sport Switcher — pick once, filters everything */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#e9ecef' }}
      >
        {SPORT_LIST.map(sport => (
          <TouchableOpacity
            key={sport}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
              marginRight: 8, backgroundColor: activeSport === sport ? '#007AFF' : '#f0f0f0',
            }}
            onPress={() => {
              setActiveSport(sport);
              setPreferredSport(sport);
              handleFiltersChange({ sport, offset: 0 });
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: activeSport === sport ? '#fff' : '#555' }}>
              {SPORTS[sport].icon} {SPORTS[sport].name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* View mode tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 12, paddingBottom: 8, gap: 8 }}>
        {(['discover', 'recommended', 'nearby'] as const).map(mode => (
          <TouchableOpacity
            key={mode}
            onPress={() => {
              setViewMode(mode);
              if (mode === 'recommended') loadRecommended();
              if (mode === 'nearby') loadNearby();
              if (mode === 'discover') loadSessions();
            }}
            style={{
              flex: 1, paddingVertical: 10, borderRadius: 10,
              backgroundColor: viewMode === mode ? '#007AFF' : '#f0f0f0',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: viewMode === mode ? '#fff' : '#555' }}>
              {mode === 'discover' ? '🔍 Discover' : mode === 'recommended' ? '⭐ For You' : '📍 Nearby'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search bar (Discover mode) */}
      {viewMode === 'discover' && (
        <View style={{ backgroundColor: '#fff', paddingHorizontal: 12, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 10, paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
            <TextInput
              style={{ flex: 1, paddingVertical: 10, fontSize: 15 }}
              placeholder="Search sessions by name, location..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={() => {
                if (searchQuery.trim()) {
                  loadSessions({ ...filters, location: searchQuery.trim(), offset: 0 });
                }
              }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); loadSessions({ offset: 0 }); }}>
                <Text style={{ color: '#999', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <SessionFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onRequestLocation={handleRequestLocation}
        hasLocation={!!location}
      />

      <FlatList
        data={viewMode === 'recommended' ? recommended : viewMode === 'nearby' ? nearby : sessions}
        keyExtractor={(item) => item.id}
        renderItem={renderSessionItem}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#007AFF"
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />

      {loading && sessions.length === 0 && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Discovering sessions...</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#212529',
  },
  realTimeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  realTimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#28a745',
    marginRight: 6,
  },
  realTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#28a745',
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 32,
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
    color: '#212529',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 24,
  },
  locationButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  locationButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    alignItems: 'center',
  },
  footerText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6c757d',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6c757d',
  },
});

export default SessionDiscoveryScreen;