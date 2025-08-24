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
import { Ionicons } from '@expo/vector-icons';
import sessionApi, { SessionData } from '../services/sessionApi';
import socketService from '../services/socketService';

export default function MySessionsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');

  const initializeData = async () => {
    try {
      const storedDeviceId = await sessionApi.getDeviceId();
      setDeviceId(storedDeviceId);
      
      // Connect to Socket.IO for real-time updates
      try {
        socketService.connect();
        
        // Set up real-time event listeners
        socketService.on('session:updated', handleSessionUpdate);
        socketService.on('session:player-joined', handlePlayerJoined);
        socketService.on('session:player-left', handlePlayerLeft);
      } catch (error) {
        console.warn('Socket.IO setup failed, continuing without real-time updates:', error);
      }
      
      return storedDeviceId;
    } catch (error) {
      console.error('Error initializing data:', error);
      throw error;
    }
  };

  // Real-time event handlers
  const handleSessionUpdate = (sessionData: any) => {
    setSessions(prev => prev.map(session => 
      session.id === sessionData.id ? { ...session, ...sessionData } : session
    ));
  };

  const handlePlayerJoined = (data: any) => {
    setSessions(prev => prev.map(session => 
      session.shareCode === data.shareCode 
        ? { ...session, players: [...session.players, data.player], playerCount: session.playerCount + 1 }
        : session
    ));
  };

  const handlePlayerLeft = (data: any) => {
    setSessions(prev => prev.map(session => 
      session.shareCode === data.shareCode 
        ? { 
            ...session, 
            players: session.players.filter(p => p.id !== data.playerId),
            playerCount: Math.max(0, session.playerCount - 1)
          }
        : session
    ));
  };

  const fetchMySessions = async (currentDeviceId?: string) => {
    try {
      const response = await sessionApi.getMySessions();
      
      if (response.success) {
        setSessions(response.data.sessions);
      } else {
        console.warn('No sessions found');
        setSessions([]);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
      Alert.alert('Error', 'Failed to load your sessions');
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      await initializeData();
      await fetchMySessions();
    } catch (error) {
      console.error('Error loading data:', error);
    }
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

  const openSession = (session: SessionData) => {
    (navigation as any).navigate('SessionDetail', {
      shareCode: session.shareCode,
      sessionData: session
    });
  };

  // Cleanup socket listeners on unmount
  useEffect(() => {
    return () => {
      socketService.off('session:updated', handleSessionUpdate);
      socketService.off('session:player-joined', handlePlayerJoined);
      socketService.off('session:player-left', handlePlayerLeft);
    };
  }, []);

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