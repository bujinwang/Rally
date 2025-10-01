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
import { OrganizerClaimModal } from '../components/OrganizerClaimModal';
import DeviceService from '../services/deviceService';

const API_BASE_URL = 'http://localhost:3001/api/v1';

interface SessionData {
  id: string;
  name: string;
  scheduledAt: string;
  location: string;
  maxPlayers: number;
  status: string;
  ownerName: string;
  ownerDeviceId: string;  // ✅ This field is now present
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
  const [showClaimModal, setShowClaimModal] = useState(false);

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
          deviceId: await DeviceService.getDeviceId()
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
        <Text style={styles.title}>🏸 Join Badminton Session</Text>
        
        <View style={styles.successMessage}>
          <Text style={styles.successIcon}>🎉</Text>
          <Text style={styles.successText}>Successfully joined!</Text>
        </View>
        
        <Text style={styles.welcomeText}>Welcome to the session! Here are the details:</Text>
        
        <View style={styles.sessionInfo}>
          <View style={styles.infoRow}>
            <Text style={styles.label}>📅 When:</Text>
            <Text style={styles.value}>{formatDateTime(sessionData.scheduledAt)}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>📍 Where:</Text>
            <Text style={styles.value}>{sessionData.location || 'Modu'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>👤 Organizer:</Text>
            <Text style={styles.value}>{sessionData.ownerName}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>🔗 Code:</Text>
            <Text style={styles.value}>{shareCode}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>👥 Players:</Text>
            <Text style={styles.value}>{sessionData.playerCount}/{sessionData.maxPlayers}</Text>
          </View>
        </View>

        {sessionData.players.length > 0 && (
          <View style={styles.playersSection}>
            <Text style={styles.playersTitle}>All Players:</Text>
            {sessionData.players.map((player, index) => (
              <Text key={player.id} style={styles.playerListItem}>
                {index + 1}. {player.name}{player.name === sessionData.ownerName && ' ⭐'}
              </Text>
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

        <TouchableOpacity
          style={styles.organizerButton}
          onPress={() => setShowClaimModal(true)}
        >
          <Text style={styles.organizerButtonText}>
            ⭐ I'm the organizer
          </Text>
        </TouchableOpacity>
      </View>

      <OrganizerClaimModal
        visible={showClaimModal}
        onClose={() => setShowClaimModal(false)}
        shareCode={shareCode}
        onSuccess={() => {
          fetchSessionData(shareCode);
        }}
      />
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
    textAlign: 'left',
    marginBottom: 20,
    color: '#333',
  },
  sessionInfo: {
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  successMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#e8f5e8',
    padding: 12,
    borderRadius: 8,
  },
  successIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  successText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#22c55e',
  },
  welcomeText: {
    fontSize: 16,
    color: '#22c55e',
    marginBottom: 20,
    textAlign: 'left',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    minWidth: 90,
    textAlign: 'left',
  },
  value: {
    fontSize: 16,
    color: '#333',
    flex: 1,
    textAlign: 'left',
    marginLeft: 8,
  },
  playersSection: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 15,
  },
  playersTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#22c55e',
    marginBottom: 12,
    textAlign: 'left',
  },
  playerListItem: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
    textAlign: 'left',
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
    textAlign: 'left',
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
  organizerButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#F0F8FF',
  },
  organizerButtonText: {
    color: '#007AFF',
    fontSize: 15,
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