import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'http://localhost:3001/api/v1';

interface SessionItem {
  id: string;
  name: string;
  shareCode: string;
  scheduledAt: string;
  location: string;
  ownerName: string;
  playerCount: number;
  shareUrl: string;
  createdAt: string;
}

export default function MySessionsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');

  const getOrCreateDeviceId = async () => {
    try {
      let storedDeviceId = await AsyncStorage.getItem('deviceId');
      if (!storedDeviceId) {
        storedDeviceId = 'device_' + Math.random().toString(36).substr(2, 9);
        await AsyncStorage.setItem('deviceId', storedDeviceId);
      }
      setDeviceId(storedDeviceId);
      return storedDeviceId;
    } catch (error) {
      console.error('Error managing device ID:', error);
      const fallbackId = 'device_' + Math.random().toString(36).substr(2, 9);
      setDeviceId(fallbackId);
      return fallbackId;
    }
  };

  const fetchMySessions = async (currentDeviceId?: string) => {
    try {
      const deviceIdToUse = currentDeviceId || deviceId;
      if (!deviceIdToUse) return;

      const response = await fetch(`${API_BASE_URL}/mvp-sessions/my-sessions/${deviceIdToUse}`);
      const result = await response.json();

      if (result.success) {
        setSessions(result.data.sessions);
      } else {
        console.error('Failed to fetch sessions:', result.error);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
      Alert.alert('Error', 'Failed to load your sessions');
    }
  };

  const loadData = async () => {
    setLoading(true);
    const currentDeviceId = await getOrCreateDeviceId();
    await fetchMySessions(currentDeviceId);
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMySessions();
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const openSession = (session: SessionItem) => {
    (navigation as any).navigate('SessionDetail', {
      shareCode: session.shareCode,
      sessionData: {
        ...session,
        maxPlayers: 50,
        status: 'ACTIVE',
        players: [] // Will be loaded fresh when screen opens
      }
    });
  };

  const createNewSession = () => {
    // Navigate to the Home tab where CreateSession screen is located
    (navigation as any).navigate('Home', { 
      screen: 'CreateSession' 
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading your sessions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Sessions</Text>
        <TouchableOpacity style={styles.createButton} onPress={createNewSession}>
          <Text style={styles.createButtonText}>+ Create New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.sessionsList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {sessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Sessions Yet</Text>
            <Text style={styles.emptyText}>
              Create your first badminton session to get started!
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={createNewSession}>
              <Text style={styles.emptyButtonText}>Create First Session</Text>
            </TouchableOpacity>
          </View>
        ) : (
          sessions.map((session) => (
            <TouchableOpacity
              key={session.id}
              style={styles.sessionCard}
              onPress={() => openSession(session)}
            >
              <View style={styles.sessionHeader}>
                <Text style={styles.sessionName}>{session.name}</Text>
                <Text style={styles.shareCode}>{session.shareCode}</Text>
              </View>
              
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionTime}>
                  📅 {formatDateTime(session.scheduledAt)}
                </Text>
                <Text style={styles.sessionLocation}>
                  📍 {session.location || 'Location TBD'}
                </Text>
                <Text style={styles.sessionPlayers}>
                  👥 {session.playerCount} player{session.playerCount !== 1 ? 's' : ''}
                </Text>
              </View>

              <View style={styles.sessionActions}>
                <Text style={styles.tapToOpen}>Tap to open →</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
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
    borderRadius: 6,
  },
  createButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  sessionsList: {
    flex: 1,
    padding: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  emptyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  sessionCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sessionName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 10,
  },
  shareCode: {
    fontSize: 12,
    color: '#007AFF',
    backgroundColor: '#f0f8ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontWeight: '600',
  },
  sessionInfo: {
    marginBottom: 12,
  },
  sessionTime: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  sessionLocation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  sessionPlayers: {
    fontSize: 14,
    color: '#666',
  },
  sessionActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  tapToOpen: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
});