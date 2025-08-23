import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';

const API_BASE_URL = 'http://localhost:3001/api/v1';

interface SessionData {
  id: string;
  name: string;
  scheduledAt: string;
  location: string;
  maxPlayers: number;
  status: string;
  ownerName: string;
  playerCount: number;
  players: Array<{
    id: string;
    name: string;
    status: string;
    gamesPlayed: number;
    wins: number;
    losses: number;
    joinedAt: string;
  }>;
  createdAt: string;
}

export default function JoinSessionScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [playerName, setPlayerName] = useState('');
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [shareCode, setShareCode] = useState<string>('');

  useEffect(() => {
    // Extract share code from route params or URL
    const params = route.params as any;
    if (params?.shareCode) {
      setShareCode(params.shareCode);
      fetchSessionData(params.shareCode);
    } else {
      // Handle URL-based navigation if needed
      Alert.alert('Error', 'No session code provided');
    }
  }, [route.params]);

  const fetchSessionData = async (code: string) => {
    try {
      setSessionLoading(true);
      const response = await fetch(`${API_BASE_URL}/mvp-sessions/join/${code}`);
      const result = await response.json();

      if (result.success) {
        setSessionData(result.data.session);
      } else {
        Alert.alert('Error', result.error?.message || 'Session not found');
      }
    } catch (error) {
      console.error('Fetch session error:', error);
      Alert.alert('Error', 'Failed to load session details');
    } finally {
      setSessionLoading(false);
    }
  };

  const joinSession = async () => {
    if (!playerName.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    if (!shareCode) {
      Alert.alert('Error', 'Invalid session code');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/mvp-sessions/join/${shareCode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: playerName.trim(),
          deviceId: 'device_' + Math.random().toString(36).substr(2, 9)
        }),
      });

      const result = await response.json();

      if (result.success) {
        Alert.alert(
          'Success!',
          `Welcome to the session, ${playerName}!`,
          [
            {
              text: 'OK',
              onPress: () => {
                // Navigate to session detail screen
                (navigation as any).navigate('SessionDetail', {
                  shareCode,
                  sessionData: sessionData,
                  playerName
                });
              }
            }
          ]
        );
      } else {
        Alert.alert('Error', result.error?.message || 'Failed to join session');
      }
    } catch (error) {
      console.error('Join session error:', error);
      Alert.alert('Error', 'Failed to join session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (sessionLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading session...</Text>
      </View>
    );
  }

  if (!sessionData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Session not found</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.sessionCard}>
        <Text style={styles.title}>{sessionData.name}</Text>
        
        <View style={styles.sessionInfo}>
          <Text style={styles.label}>📅 When:</Text>
          <Text style={styles.value}>{formatDateTime(sessionData.scheduledAt)}</Text>
          
          <Text style={styles.label}>📍 Where:</Text>
          <Text style={styles.value}>{sessionData.location || 'Location TBD'}</Text>
          
          <Text style={styles.label}>👤 Organized by:</Text>
          <Text style={styles.value}>{sessionData.ownerName}</Text>
        </View>

        {sessionData.players.length > 0 && (
          <View style={styles.playersSection}>
            <Text style={styles.playersTitle}>Current Players:</Text>
            {sessionData.players.map((player, index) => (
              <View key={player.id} style={styles.playerItem}>
                <Text style={styles.playerName}>
                  {index + 1}. {player.name}
                  {player.name === sessionData.ownerName && ' (Organizer)'}
                </Text>
                <Text style={styles.playerStatus}>{player.status}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.joinSection}>
        <Text style={styles.joinTitle}>Join this session</Text>
        
        <Text style={styles.label}>Your Name *</Text>
        <TextInput
          style={styles.input}
          value={playerName}
          onChangeText={setPlayerName}
          placeholder="Enter your name"
          maxLength={100}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={joinSession}
          disabled={loading || sessionData.playerCount >= sessionData.maxPlayers}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : sessionData.playerCount >= sessionData.maxPlayers ? (
            <Text style={styles.buttonText}>Session Full</Text>
          ) : (
            <Text style={styles.buttonText}>Join Session</Text>
          )}
        </TouchableOpacity>

        {sessionData.playerCount >= sessionData.maxPlayers && (
          <Text style={styles.warningText}>
            This session is currently full. Please check back later.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  sessionCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  sessionInfo: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 10,
  },
  value: {
    fontSize: 16,
    color: '#333',
    marginTop: 2,
    marginBottom: 5,
  },
  playersSection: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 15,
  },
  playersTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  playerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  playerName: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  playerStatus: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  joinSection: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  joinTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  warningText: {
    marginTop: 10,
    fontSize: 14,
    color: '#ff6b35',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});