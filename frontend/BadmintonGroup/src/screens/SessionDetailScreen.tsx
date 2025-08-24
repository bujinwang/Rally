import React, { useState, useEffect } from 'react';
import {
   View,
   Text,
   TouchableOpacity,
   StyleSheet,
   Alert,
   ScrollView,
   ActivityIndicator,
   Share,
   TextInput,
   Modal
 } from 'react-native';
 import { useRoute, useNavigation } from '@react-navigation/native';
 import * as Clipboard from 'expo-clipboard';
 import AsyncStorage from '@react-native-async-storage/async-storage';
 import { createShareableLinks } from '../components/ShareLinkHandler';
 import { useRealTimeSession } from '../hooks/useRealTimeSession';
 import { useSelector } from 'react-redux';
 import { selectRealTimeStatus } from '../store/slices/realTimeSlice';

const API_BASE_URL = 'http://localhost:3001/api/v1';

interface Player {
  id: string;
  name: string;
  status: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  joinedAt: string;
}

interface SessionData {
  id: string;
  name: string;
  scheduledAt: string;
  location: string;
  maxPlayers: number;
  status: string;
  ownerName: string;
  ownerDeviceId: string;
  playerCount: number;
  players: Player[];
  createdAt: string;
  shareCode: string;
}

export default function SessionDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [shareCode, setShareCode] = useState<string>('');
  const [isNewSession, setIsNewSession] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [isOwner, setIsOwner] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');

  // Real-time functionality
  const realTimeStatus = useSelector(selectRealTimeStatus);
  const {
    isConnected: isSocketConnected,
    connectionStatus,
    lastUpdated,
    error: realTimeError,
    isActive: isAutoRefreshActive,
    manualRefresh,
    startAutoRefresh,
    stopAutoRefresh,
  } = useRealTimeSession({
    sessionId: shareCode,
    fallbackInterval: 15000, // 15 seconds
    enableOptimisticUpdates: true,
    autoStart: false, // We'll start manually after session data loads
  });

  useEffect(() => {
    initializeScreen();
  }, [route.params]);

  // Start auto-refresh when session data is loaded
  useEffect(() => {
    if (shareCode && sessionData && !isAutoRefreshActive) {
      console.log(`🎯 Starting auto-refresh for session: ${shareCode}`);
      startAutoRefresh();
    }

    // Cleanup on unmount
    return () => {
      if (isAutoRefreshActive) {
        console.log(`⏹️ Stopping auto-refresh on unmount for session: ${shareCode}`);
        stopAutoRefresh();
      }
    };
  }, [shareCode, sessionData]);

  // Listen for real-time session updates
  useEffect(() => {
    let subscription: any = null;
    
    try {
      const { DeviceEventEmitter } = require('react-native');
      
      const handleSessionUpdate = (eventData: { sessionId: string; session: any }) => {
        if (eventData?.sessionId === shareCode) {
          console.log(`🔄 Received real-time session update for: ${shareCode}`);
          // Refresh session data when real-time update is received
          if (shareCode) {
            fetchSessionData(shareCode, deviceId);
          }
        }
      };

      subscription = DeviceEventEmitter.addListener('sessionDataUpdated', handleSessionUpdate);
      
      return () => {
        if (subscription) {
          subscription.remove();
        }
      };
    } catch (error) {
      console.log('DeviceEventEmitter not available:', error.message);
    }
  }, [shareCode, deviceId]);

  const initializeScreen = async () => {
    // Get device ID to check ownership
    const storedDeviceId = await AsyncStorage.getItem('deviceId');
    if (storedDeviceId) {
      setDeviceId(storedDeviceId);
    }

    const params = route.params as any;
    if (params?.shareCode) {
      setShareCode(params.shareCode);
      setIsNewSession(params.isNewSession || false);
      
      // Always fetch fresh session data to ensure players are loaded
      await fetchSessionData(params.shareCode, storedDeviceId || undefined);
      
      // Auto-copy clipboard message for new sessions
      if (params.isNewSession && sessionData) {
        copySessionToClipboard(sessionData, params.shareCode);
      }
    }
  };

  const fetchSessionData = async (code: string, deviceId?: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/mvp-sessions/join/${code}`);
      const result = await response.json();

      if (result.success) {
        setSessionData(result.data.session);
        // Check if current device is the owner
        if (deviceId && result.data.session.ownerDeviceId === deviceId) {
          setIsOwner(true);
        }
      } else {
        Alert.alert('Error', result.error?.message || 'Session not found');
      }
    } catch (error) {
      console.error('Fetch session error:', error);
      Alert.alert('Error', 'Failed to load session details');
    } finally {
      setLoading(false);
    }
  };

  const refreshSessionData = async () => {
    if (shareCode) {
      try {
        // Use real-time manual refresh if available, otherwise fallback to direct fetch
        if (isAutoRefreshActive) {
          await manualRefresh();
        } else {
          await fetchSessionData(shareCode, deviceId);
        }
      } catch (error) {
        console.error('Manual refresh failed:', error);
        // Fallback to direct fetch
        await fetchSessionData(shareCode, deviceId);
      }
    }
  };

  const terminateSession = async () => {
    if (!shareCode || !isOwner) return;
    
    Alert.alert(
      'Terminate Session',
      'Are you sure you want to terminate this session? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Terminate',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE_URL}/mvp-sessions/${shareCode}/terminate`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ deviceId })
              });
              
              const result = await response.json();
              
              if (result.success) {
                Alert.alert('Success', 'Session has been terminated');
                refreshSessionData();
              } else {
                Alert.alert('Error', result.error?.message || 'Failed to terminate session');
              }
            } catch (error) {
              console.error('Terminate session error:', error);
              Alert.alert('Error', 'Failed to terminate session');
            }
          }
        }
      ]
    );
  };

  const addPlayer = async () => {
    if (!shareCode || !isOwner || !newPlayerName.trim()) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/mvp-sessions/${shareCode}/add-player`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId,
          playerName: newPlayerName.trim()
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setNewPlayerName('');
        setShowAddPlayer(false);
        refreshSessionData();
        Alert.alert('Success', 'Player added successfully');
      } else {
        Alert.alert('Error', result.error?.message || 'Failed to add player');
      }
    } catch (error) {
      console.error('Add player error:', error);
      Alert.alert('Error', 'Failed to add player');
    }
  };

  const removePlayer = async (playerId: string, playerName: string) => {
    if (!shareCode || !isOwner) return;
    
    Alert.alert(
      'Remove Player',
      `Are you sure you want to remove ${playerName} from this session?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE_URL}/mvp-sessions/${shareCode}/players/${playerId}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ deviceId })
              });
              
              const result = await response.json();
              
              if (result.success) {
                refreshSessionData();
                Alert.alert('Success', 'Player removed successfully');
              } else {
                Alert.alert('Error', result.error?.message || 'Failed to remove player');
              }
            } catch (error) {
              console.error('Remove player error:', error);
              Alert.alert('Error', 'Failed to remove player');
            }
          }
        }
      ]
    );
  };

  const reactivateSession = async () => {
    if (!shareCode || !isOwner) return;
    
    Alert.alert(
      'Reactivate Session',
      'Are you sure you want to reactivate this session? Players will be able to join again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reactivate',
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE_URL}/mvp-sessions/reactivate/${shareCode}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ownerDeviceId: deviceId })
              });
              
              const result = await response.json();
              
              if (result.success) {
                Alert.alert('Success', 'Session has been reactivated');
                refreshSessionData();
              } else {
                Alert.alert('Error', result.error?.message || 'Failed to reactivate session');
              }
            } catch (error) {
              console.error('Reactivate session error:', error);
              Alert.alert('Error', 'Failed to reactivate session');
            }
          }
        }
      ]
    );
  };

  const formatSessionForClipboard = (session: SessionData, code: string) => {
    const date = new Date(session.scheduledAt);
    
    // Format like "Friday 8/22 8-11pm"
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;
    const timeStart = date.toLocaleTimeString('en-US', { 
      hour: 'numeric',
      minute: date.getMinutes() > 0 ? '2-digit' : undefined,
      hour12: true 
    });
    
    // Assume 3-hour sessions for now, could be made configurable
    const endTime = new Date(date.getTime() + 3 * 60 * 60 * 1000);
    const timeEnd = endTime.toLocaleTimeString('en-US', { 
      hour: 'numeric',
      minute: endTime.getMinutes() > 0 ? '2-digit' : undefined,
      hour12: true 
    });
    
    const timeRange = `${timeStart.replace(' ', '').toLowerCase()}-${timeEnd.replace(' ', '').toLowerCase()}`;
    const dateTimeStr = `${dayName} ${monthDay} ${timeRange}`;
    
    // Location
    const location = session.location || 'Location TBD';
    
    // Players list - ensure organizer is first
    const players = session.players || [];
    const organizer = session.ownerName;
    
    // Create sorted player list with organizer first
    const organizerPlayer = players.find(p => p.name === organizer);
    const otherPlayers = players.filter(p => p.name !== organizer);
    const sortedPlayers = organizerPlayer ? [organizerPlayer, ...otherPlayers] : players;
    
    const playersList = sortedPlayers.map(p => p.name).join('\n');
    const currentCount = players.length;
    const maxPlayers = session.maxPlayers;
    
    return `${dateTimeStr}
${location}

${playersList}${currentCount < maxPlayers ? '\n\nWho else?' : ''}

Join: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/join/${code}`;
  };

  const copySessionToClipboard = async (session: SessionData, code: string) => {
    // Format date and time like the display
    const sessionDate = new Date(session.scheduledAt);
    const formattedDate = sessionDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Create players list with organizer first and star
    const players = session.players || [];
    const organizer = session.ownerName;

    // Sort players with organizer first
    const organizerPlayer = players.find(p => p.name === organizer);
    const otherPlayers = players.filter(p => p.name !== organizer);
    const sortedPlayers = organizerPlayer ? [organizerPlayer, ...otherPlayers] : players;

    // Format players list
    const playersList = sortedPlayers.map((player, index) =>
      `${index + 1}. ${player.name}${player.name === organizer ? ' ⭐' : ''}`
    ).join('\n');

    // Create comprehensive session message
    const sessionMessage = `🏸 ${session.name}

📅 When: ${formattedDate}
📍 Where: ${session.location || 'Location TBD'}
👤 Organizer: ${session.ownerName}
🔗 Code: ${code}
👥 Players: ${players.length}/${session.maxPlayers}

All Players:
${playersList}

Join: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/join/${code}`;

    try {
      await Clipboard.setStringAsync(sessionMessage);
      Alert.alert(
        '📋 Session Details Copied!',
        'Session information has been copied to clipboard and is ready to share on WeChat or WhatsApp.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Copy to clipboard failed:', error);
      // Fallback: show the text in an alert
      Alert.alert(
        'Session Details',
        `Copy this message:\n\n${sessionMessage}`,
        [{ text: 'OK' }]
      );
    }
  };

  const shareSession = async () => {
    if (!sessionData || !shareCode) return;

    // Use the new createShareableLinks function with player data
    const { weChatMessage, whatsAppMessage, shareUrl } = createShareableLinks(
      shareCode,
      sessionData.name,
      sessionData.scheduledAt,
      sessionData.location,
      sessionData.ownerName,
      sessionData.players || []
    );

    Alert.alert(
      'Share Session',
      'Choose sharing option:',
      [
        {
          text: '微信 WeChat',
          onPress: async () => {
            try {
              await Share.share({
                title: '羽毛球局邀请',
                message: weChatMessage,
                url: shareUrl
              });
            } catch (error) {
              console.error('WeChat share error:', error);
            }
          }
        },
        {
          text: 'WhatsApp',
          onPress: async () => {
            try {
              await Share.share({
                title: 'Badminton Session Invitation',
                message: whatsAppMessage,
                url: shareUrl
              });
            } catch (error) {
              console.error('WhatsApp share error:', error);
            }
          }
        },
        {
          text: 'Both 两个都要',
          onPress: async () => {
            try {
              await Share.share({
                title: 'Join Badminton Session',
                message: `${weChatMessage}\n\n${whatsAppMessage}`,
                url: shareUrl
              });
            } catch (error) {
              console.error('Share error:', error);
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const copyShareCode = () => {
    // For now, just show an alert. In a real app, you'd copy to clipboard
    Alert.alert(
      'Share Code',
      `Session Code: ${shareCode}\n\nShare this code with friends to let them join!`,
      [
        { text: 'OK' }
      ]
    );
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

  const navigateToPlayerProfile = (player: Player) => {
    (navigation as any).navigate('PlayerProfile', {
      playerId: player.id,
      deviceId: player.name, // Temporary - use name as identifier
      isOwnProfile: false
    });
  };

  const startLiveGames = () => {
    if (!shareCode || !sessionData) return;
    
    if (sessionData.players.length < 4) {
      Alert.alert(
        'Not Enough Players', 
        'You need at least 4 players to start live games. Current players: ' + sessionData.players.length,
        [{ text: 'OK' }]
      );
      return;
    }

    (navigation as any).navigate('LiveGame', {
      sessionId: sessionData.id,
      shareCode: shareCode
    });
  };

  if (loading) {
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
      {isNewSession && (
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>🎉 Session Created!</Text>
          <Text style={styles.successText}>
            Session info has been copied to clipboard and is ready to paste to WeChat or WhatsApp.
          </Text>
          <TouchableOpacity 
            style={styles.copyAgainButton} 
            onPress={() => sessionData && copySessionToClipboard(sessionData, shareCode)}
          >
            <Text style={styles.copyAgainText}>📋 Copy Again</Text>
          </TouchableOpacity>
        </View>
      )}
      
      <View style={styles.sessionCard}>
        <Text style={styles.title}>{sessionData.name}</Text>
        
        <View style={styles.sessionInfo}>
          <Text style={styles.label}>📅 When:</Text>
          <Text style={styles.value}>{formatDateTime(sessionData.scheduledAt)}</Text>
          
          <Text style={styles.label}>📍 Where:</Text>
          <Text style={styles.value}>{sessionData.location || 'Location TBD'}</Text>
          
          <Text style={styles.label}>👤 Organized by:</Text>
          <Text style={styles.value}>{sessionData.ownerName}</Text>
          
          <Text style={styles.label}>📋 Status:</Text>
          <Text style={[styles.value, styles.statusValue, getSessionStatusStyle(sessionData.status)]}>
            {getSessionStatusText(sessionData.status)}
          </Text>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={styles.copyButton} 
            onPress={() => sessionData && copySessionToClipboard(sessionData, shareCode)}
          >
            <Text style={styles.copyButtonText}>📋 Copy Info</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.shareButton} onPress={shareSession}>
            <Text style={styles.shareButtonText}>📤 Share</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.liveGameButton} onPress={startLiveGames}>
            <Text style={styles.liveGameButtonText}>🏸 Live Games</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.refreshButton} onPress={refreshSessionData}>
            <View style={styles.refreshButtonContent}>
              <View style={[styles.connectionIndicator, getConnectionStatusStyle(connectionStatus)]} />
              <Text style={styles.refreshButtonText}>
                {isAutoRefreshActive ? '🔄 Auto-Refresh' : '🔄 Refresh'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
        
        {isOwner && (
          <View style={styles.organizerControls}>
            <Text style={styles.organizerTitle}>⭐ Organizer Controls</Text>
            {sessionData.status === 'CANCELLED' ? (
              <View style={styles.organizerActions}>
                <TouchableOpacity style={styles.reactivateButton} onPress={reactivateSession}>
                  <Text style={styles.reactivateButtonText}>🔄 Reactivate Session</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.organizerActions}>
                <TouchableOpacity style={styles.addPlayerButton} onPress={() => setShowAddPlayer(true)}>
                  <Text style={styles.addPlayerButtonText}>➕ Add Player</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.terminateButton} onPress={terminateSession}>
                  <Text style={styles.terminateButtonText}>🛑 Terminate Session</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.playersCard}>
        <Text style={styles.playersTitle}>Players ({sessionData.players?.length || 0})</Text>
        
        {!sessionData.players || sessionData.players.length === 0 ? (
          <Text style={styles.noPlayersText}>No players yet. Share the session to invite others!</Text>
        ) : (
          sessionData.players.map((player, index) => (
            <TouchableOpacity 
              key={player.id} 
              style={styles.playerItem}
              onPress={() => navigateToPlayerProfile(player)}
              activeOpacity={0.7}
            >
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>
                  {index + 1}. {player.name}
                  {player.name === sessionData?.ownerName && ' ⭐'}
                </Text>
                <Text style={styles.playerMeta}>
                  Joined: {new Date(player.joinedAt).toLocaleDateString()}
                </Text>
              </View>
              
              <View style={styles.playerStats}>
                <Text style={styles.statLabel}>Games: {player.gamesPlayed}</Text>
                <Text style={styles.statLabel}>W: {player.wins}</Text>
                <Text style={styles.statLabel}>L: {player.losses}</Text>
                <View style={[styles.statusBadge, getStatusStyle(player.status)]}>
                  <Text style={styles.statusText}>{player.status}</Text>
                </View>
                {isOwner && player.name !== sessionData?.ownerName && (
                  <TouchableOpacity 
                    style={styles.removeButton}
                    onPress={() => removePlayer(player.id, player.name)}
                  >
                    <Text style={styles.removeButtonText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>💡 How to play</Text>
        <Text style={styles.infoText}>
          • Share this session with friends using WeChat or WhatsApp{'\n'}
          • Players can join by clicking the link and entering their name{'\n'}
          • The organizer manages the rotation and scoring{'\n'}
          • Have fun playing badminton! 🏸
        </Text>
      </View>
      
      <Modal
        visible={showAddPlayer}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAddPlayer(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Player</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter player name"
              value={newPlayerName}
              onChangeText={setNewPlayerName}
              maxLength={100}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowAddPlayer(false);
                  setNewPlayerName('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalAddButton, !newPlayerName.trim() && styles.disabledButton]}
                onPress={addPlayer}
                disabled={!newPlayerName.trim()}
              >
                <Text style={styles.modalAddText}>Add Player</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const getStatusStyle = (status: string) => {
  switch (status) {
    case 'ACTIVE':
      return { backgroundColor: '#4CAF50' };
    case 'RESTING':
      return { backgroundColor: '#FF9800' };
    case 'LEFT':
      return { backgroundColor: '#f44336' };
    default:
      return { backgroundColor: '#9E9E9E' };
  }
};

const getSessionStatusStyle = (status: string) => {
  switch (status) {
    case 'ACTIVE':
      return { color: '#4CAF50', fontWeight: 'bold' as const };
    case 'CANCELLED':
      return { color: '#f44336', fontWeight: 'bold' as const };
    case 'COMPLETED':
      return { color: '#9E9E9E', fontWeight: 'bold' as const };
    default:
      return { color: '#333', fontWeight: 'bold' as const };
  }
};

const getSessionStatusText = (status: string) => {
  switch (status) {
    case 'ACTIVE':
      return '🟢 Active';
    case 'CANCELLED':
      return '🔴 Terminated';
    case 'COMPLETED':
      return '⚪ Completed';
    default:
      return status;
  }
};

const getConnectionStatusStyle = (status: string) => {
  switch (status) {
    case 'connected':
      return { backgroundColor: '#4CAF50' }; // Green
    case 'connecting':
    case 'reconnecting':
      return { backgroundColor: '#FF9800' }; // Orange
    case 'disconnected':
      return { backgroundColor: '#f44336' }; // Red
    default:
      return { backgroundColor: '#9E9E9E' }; // Gray
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9', // Lighter gray background
  },
  successCard: {
    backgroundColor: '#4CAF50',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 10,
  },
  successText: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 22,
  },
  copyAgainButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  copyAgainText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
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
    color: '#D32F2F', // Error text in red
    marginBottom: 20,
    textAlign: 'center',
  },
  sessionCard: {
    backgroundColor: 'white',
    margin: 16,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
    color: '#212121',
  },
  sessionInfo: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
    marginTop: 12,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 18,
    color: '#212121',
    marginTop: 4,
    marginBottom: 8,
  },
  statusValue: {
    textTransform: 'capitalize',
    fontWeight: 'bold',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    paddingTop: 20,
  },
  copyButton: {
    backgroundColor: '#E8F5E9', // Lighter green
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#4CAF50', // Darker green text
    fontSize: 14,
    fontWeight: 'bold',
  },
  shareButton: {
    backgroundColor: '#E3F2FD', // Lighter blue
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#2196F3', // Darker blue text
    fontSize: 14,
    fontWeight: 'bold',
  },
  liveGameButton: {
    backgroundColor: '#FFE0B2', // Orange background
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
  },
  liveGameButtonText: {
    color: '#FF6B35', // Orange text
    fontSize: 14,
    fontWeight: 'bold',
  },
  refreshButton: {
    backgroundColor: '#FFF3E0', // Lighter orange
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: '#FF9800', // Darker orange text
    fontSize: 14,
    fontWeight: 'bold',
  },
  refreshButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectionIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  playersCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  playersTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#212121',
  },
  noPlayersText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 20,
  },
  playerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    borderRadius: 8,
    marginVertical: 2,
  },
  playerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#212121',
    marginLeft: 8,
  },
  playerMeta: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  playerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#E3F2FD',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1E88E5',
  },
  infoText: {
    fontSize: 15,
    color: '#424242',
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  organizerControls: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  organizerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  organizerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  addPlayerButton: {
    backgroundColor: '#34C759',
    padding: 12,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  addPlayerButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  terminateButton: {
    backgroundColor: '#FF3B30',
    padding: 12,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  terminateButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  reactivateButton: {
    backgroundColor: '#34C759',
    padding: 12,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  reactivateButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  removeButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  removeButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalCancelButton: {
    backgroundColor: '#8E8E93',
    padding: 12,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  modalCancelText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalAddButton: {
    backgroundColor: '#34C759',
    padding: 12,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  modalAddText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
});