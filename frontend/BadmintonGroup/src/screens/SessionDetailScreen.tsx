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
 import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
 import * as Clipboard from 'expo-clipboard';
 import AsyncStorage from '@react-native-async-storage/async-storage';
import { createShareableLinks } from '../components/ShareLinkHandler';
import { useRealTimeSession } from '../hooks/useRealTimeSession';
import { useSelector } from 'react-redux';
import { selectRealTimeStatus } from '../store/slices/realTimeSlice';
import { DEVICE_ID_KEY } from '../config/api';
import { sessionApi } from '../services/sessionApi';

const API_BASE_URL = 'http://localhost:3001/api/v1';

interface Player {
  id: string;
  name: string;
  deviceId: string; // Add this field
  status: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  joinedAt: string;
}

interface Game {
  id: string;
  gameNumber: number;
  courtName?: string;
  team1Player1: string;
  team1Player2: string;
  team2Player1: string;
  team2Player2: string;
  team1FinalScore: number;
  team2FinalScore: number;
  winnerTeam?: number;
  startTime?: string;
  endTime?: string;
  duration?: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED' | 'CANCELLED';
  matchId?: string;
  gameInMatch?: number;
  createdAt: string;
  updatedAt: string;
}

interface Match {
  id: string;
  matchNumber: number;
  courtName?: string;
  team1Player1: string;
  team1Player2: string;
  team2Player1: string;
  team2Player2: string;
  team1GamesWon: number;
  team2GamesWon: number;
  winnerTeam?: number;
  bestOf: number;
  startTime?: string;
  endTime?: string;
  duration?: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED' | 'CANCELLED';
  games: Game[];
  createdAt: string;
  updatedAt: string;
}

interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  matchWins: number;
  matchLosses: number;
  totalSetsWon: number;
  totalSetsLost: number;
  totalPlayTime: number;
  winRate: number;
  matchWinRate: number;
  averageGameDuration: number;
  partnershipStats: any;
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
  games: Game[];
  matches: Match[];
  createdAt: string;
  shareCode: string;
  courtCount?: number;
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
  const [showCreateGame, setShowCreateGame] = useState(false);
  const [showScoreGame, setShowScoreGame] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [gameForm, setGameForm] = useState({
    team1Player1: '',
    team1Player2: '',
    team2Player1: '',
    team2Player2: '',
    courtName: ''
  });
  const [scoreForm, setScoreForm] = useState({
    team1FinalScore: 0,
    team2FinalScore: 0
  });
  const [showCourtSettings, setShowCourtSettings] = useState(false);
  const [courtSettings, setCourtSettings] = useState({
    courtCount: 1
  });
  const [showTeamSwitch, setShowTeamSwitch] = useState(false);
  
  const [teamSwitchForm, setTeamSwitchForm] = useState({
    team1Player1: '',
    team1Player2: '',
    team2Player1: '',
    team2Player2: ''
  });

  // Real-time functionality
  const realTimeStatus = useSelector(selectRealTimeStatus);
  
  // Initialize team switch form when a game is selected
  useEffect(() => {
    if (selectedGame && showTeamSwitch) {
      setTeamSwitchForm({
        team1Player1: selectedGame.team1Player1,
        team1Player2: selectedGame.team1Player2,
        team2Player1: selectedGame.team2Player1,
        team2Player2: selectedGame.team2Player2
      });
    }
  }, [selectedGame, showTeamSwitch]);
  const {
    isConnected: isSocketConnected,
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
    autoStart: false,
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

  // Refresh session data when screen becomes focused (e.g., returning from Live Game)
  useFocusEffect(
    React.useCallback(() => {
      if (shareCode && deviceId) {
        console.log('🔄 Screen focused, refreshing session data...');
        fetchSessionData(shareCode, deviceId);
      }
    }, [shareCode, deviceId])
  );

  const initializeScreen = async () => {
    // Get device ID to check ownership
    const storedDeviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
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

  const claimOwnershipIfNeeded = async (session: SessionData, currentDeviceId: string) => {
    console.log('🔍 claimOwnershipIfNeeded called with:', {
      currentDeviceId,
      ownerName: session.ownerName,
      ownerDeviceId: session.ownerDeviceId,
      playersCount: session.players.length
    });
    
    // Debug: Log all players and their deviceIds
    console.log('🔍 Players data:', session.players.map(p => ({
      id: p.id,
      name: p.name,
      deviceId: p.deviceId,
      hasDeviceId: !!p.deviceId
    })));
    
    // Check if user is the owner by name but ownerDeviceId is missing
    // First try to find by deviceId, then fall back to checking if any player deviceIds are missing
    const userPlayer = session.players.find(p => p.deviceId === currentDeviceId);
    console.log('🔍 User player found by deviceId:', userPlayer);
    
    // If no player found by deviceId AND most players have null deviceIds (legacy sessions), 
    // we can assume this is a legacy session and try name-based ownership claiming
    const playersWithoutDeviceId = session.players.filter(p => !p.deviceId);
    const isLegacySession = playersWithoutDeviceId.length === session.players.length;
    console.log('🔍 Legacy session check:', { 
      isLegacySession, 
      playersWithoutDeviceId: playersWithoutDeviceId.length, 
      totalPlayers: session.players.length 
    });
    
    // For legacy sessions, we can't match by deviceId, so we allow claiming based on ownerName
    const canClaimOwnership = userPlayer?.name === session.ownerName || (isLegacySession && !session.ownerDeviceId);
    console.log('🔍 Can claim ownership:', canClaimOwnership, {
      userPlayerName: userPlayer?.name,
      sessionOwnerName: session.ownerName,
      isLegacySession,
      ownerDeviceIdMissing: !session.ownerDeviceId
    });
    
    const ownerDeviceIdMissing = !session.ownerDeviceId;
    console.log('🔍 Owner device ID missing:', ownerDeviceIdMissing);
    
    if (canClaimOwnership && ownerDeviceIdMissing) {
      console.log('🔧 Claiming session ownership for:', session.shareCode);
      try {
        await sessionApi.claimSessionOwnership(session.shareCode);
        console.log('✅ Successfully claimed session ownership');
        // Refresh session data to get updated ownerDeviceId
        fetchSessionData(session.shareCode, currentDeviceId);
      } catch (error) {
        console.error('❌ Failed to claim session ownership:', error);
      }
    } else {
      console.log('🔍 Not claiming ownership:', {
        canClaimOwnership,
        ownerDeviceIdMissing,
        reason: !canClaimOwnership ? 'Cannot claim ownership' : 'Owner device ID already set'
      });
    }
  };

  const fetchSessionData = async (code: string, deviceId?: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/mvp-sessions/join/${code}`);
      const result = await response.json();

      // Add debug logging to see the raw response
      console.log('🔍 Raw API response:', JSON.stringify(result, null, 2));
      console.log('🔍 Session object:', JSON.stringify(result.data?.session, null, 2));

      if (result.success) {
        const session = result.data.session;
        setSessionData(session);
        
        // Auto-claim ownership if needed
        if (deviceId) {
          await claimOwnershipIfNeeded(session, deviceId);
        }
        
        // Initialize court settings from session data
        setCourtSettings({
          courtCount: session.courtCount || 1
        });
        // Check if current device is the owner
        console.log('🔍 Ownership check:', {
          currentDeviceId: deviceId,
          ownerDeviceId: session.ownerDeviceId,
          isOwner: deviceId && session.ownerDeviceId === deviceId
        });
        if (deviceId && session.ownerDeviceId === deviceId) {
          setIsOwner(true);
        } else {
          setIsOwner(false);
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
        // Always use direct fetch for now to avoid real-time service issues
        await fetchSessionData(shareCode, deviceId);
      } catch (error) {
        console.error('Manual refresh failed:', error);
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

  const createGame = async () => {
    if (!shareCode || !gameForm.team1Player1 || !gameForm.team1Player2 || !gameForm.team2Player1 || !gameForm.team2Player2) {
      Alert.alert('Error', 'Please select all four players');
      return;
    }

    try {
      const result = await fetch(`${API_BASE_URL}/mvp-sessions/${shareCode}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameForm)
      });

      const response = await result.json();

      if (response.success) {
        setShowCreateGame(false);
        setGameForm({
          team1Player1: '',
          team1Player2: '',
          team2Player1: '',
          team2Player2: '',
          courtName: ''
        });
        refreshSessionData();
        Alert.alert('Success', 'Game created successfully!');
      } else {
        Alert.alert('Error', response.message || 'Failed to create game');
      }
    } catch (error) {
      console.error('Create game error:', error);
      Alert.alert('Error', 'Failed to create game: ' + error.message);
    }
  };

  const updateGameScore = async () => {
    if (!selectedGame || !shareCode) return;

    if (scoreForm.team1FinalScore === scoreForm.team2FinalScore) {
      Alert.alert('Error', 'Game cannot end in a tie');
      return;
    }

    if (scoreForm.team1FinalScore < 0 || scoreForm.team1FinalScore > 2 || 
        scoreForm.team2FinalScore < 0 || scoreForm.team2FinalScore > 2) {
      Alert.alert('Error', 'Scores must be between 0 and 2');
      return;
    }

    try {
      const result = await fetch(`${API_BASE_URL}/mvp-sessions/${shareCode}/games/${selectedGame.id}/score`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scoreForm)
      });

      const response = await result.json();

      if (response.success) {
        setShowScoreGame(false);
        setSelectedGame(null);
        setScoreForm({ team1FinalScore: 0, team2FinalScore: 0 });
        refreshSessionData();
        
        const winner = scoreForm.team1FinalScore > scoreForm.team2FinalScore 
          ? `${selectedGame.team1Player1} & ${selectedGame.team1Player2}` 
          : `${selectedGame.team2Player1} & ${selectedGame.team2Player2}`;
        
        Alert.alert('Game Completed!', `🏆 ${winner} won ${scoreForm.team1FinalScore}-${scoreForm.team2FinalScore}!`);
      } else {
        Alert.alert('Error', response.message || 'Failed to update score');
      }
    } catch (error) {
      console.error('Update score error:', error);
      Alert.alert('Error', 'Failed to update score: ' + error.message);
    }
  };

  const updateGameTeams = async () => {
    if (!selectedGame || !shareCode) return;

    // Validate that all players are selected and different
    const players = [teamSwitchForm.team1Player1, teamSwitchForm.team1Player2, 
                     teamSwitchForm.team2Player1, teamSwitchForm.team2Player2];
    
    if (players.some(p => !p.trim())) {
      Alert.alert('Error', 'Please select all four players');
      return;
    }

    const uniquePlayers = new Set(players);
    if (uniquePlayers.size !== 4) {
      Alert.alert('Error', 'All players must be different');
      return;
    }

    try {
      const result = await fetch(`${API_BASE_URL}/mvp-sessions/${shareCode}/games/${selectedGame.id}/teams`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teamSwitchForm)
      });

      const response = await result.json();

      if (response.success) {
        setShowTeamSwitch(false);
        setSelectedGame(null);
        setTeamSwitchForm({
          team1Player1: '',
          team1Player2: '',
          team2Player1: '',
          team2Player2: ''
        });
        refreshSessionData();
        Alert.alert('Teams Updated!', 'Team arrangements have been successfully changed.');
      } else {
        Alert.alert('Error', response.message || 'Failed to update teams');
      }
    } catch (error) {
      console.error('Update teams error:', error);
      Alert.alert('Error', 'Failed to update teams: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
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
        
        {/* Compact Session Info Header */}
        <View style={styles.compactHeader}>
          <View style={styles.headerRow}>
            <View style={styles.headerItem}>
              <Text style={styles.headerLabel}>📅 When</Text>
              <Text style={styles.headerValue}>{formatDateTime(sessionData.scheduledAt)}</Text>
            </View>
            <View style={styles.headerItem}>
              <Text style={styles.headerLabel}>📍 Where</Text>
              <Text style={styles.headerValue}>{sessionData.location || 'Location TBD'}</Text>
            </View>
          </View>
          
          <View style={styles.headerRow}>
            <View style={styles.headerItem}>
              <Text style={styles.headerLabel}>👤 Host</Text>
              <Text style={styles.headerValue}>{sessionData.ownerName}</Text>
            </View>
            <View style={styles.statusContainer}>
              <View style={styles.statusRow}>
                <Text style={[styles.statusBadgeText, getSessionStatusStyle(sessionData.status)]}>
                  {getSessionStatusText(sessionData.status)}
                </Text>
                <Text style={styles.courtCountBadge}>🏸 Courts: {sessionData.courtCount || 1}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Compact Action Bar */}
        <View style={styles.compactActionBar}>
          <TouchableOpacity style={styles.primaryActionButton} onPress={startLiveGames}>
            <Text style={styles.primaryActionText}>🏸 Start Games</Text>
          </TouchableOpacity>
          
          <View style={styles.secondaryActions}>
            <TouchableOpacity style={styles.iconButton} onPress={shareSession}>
              <Text style={styles.iconButtonText}>📤</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.iconButton}
              onPress={() => sessionData && copySessionToClipboard(sessionData, shareCode)}
            >
              <Text style={styles.iconButtonText}>📋</Text>
            </TouchableOpacity>
            
            {isOwner && (
              <TouchableOpacity 
                style={styles.iconButton} 
                onPress={() => setShowCourtSettings(true)}
              >
                <Text style={styles.iconButtonText}>⚙️</Text>
              </TouchableOpacity>
            )}
          </View>
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
        <View style={styles.playersHeader}>
          <Text style={styles.playersTitle}>
            Players ({sessionData.players?.filter(player => player.status !== 'LEFT').length || 0}/{sessionData.maxPlayers})
          </Text>
          {isOwner && (
            <TouchableOpacity 
              style={styles.addPlayerInline} 
              onPress={() => setShowAddPlayer(true)}
            >
              <Text style={styles.addPlayerInlineText}>+ Add</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {!sessionData.players || sessionData.players.length === 0 ? (
          <View style={styles.emptyPlayerState}>
            <Text style={styles.noPlayersText}>No players yet</Text>
            <Text style={styles.noPlayersSubtext}>Share the session to invite others!</Text>
            {isOwner && (
              <TouchableOpacity 
                style={styles.addFirstPlayerButton} 
                onPress={() => setShowAddPlayer(true)}
              >
                <Text style={styles.addFirstPlayerText}>+ Add First Player</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.playersList}>
            {sessionData.players
              .filter(player => player.status !== 'LEFT')
              .map((player, index) => (
              <View key={player.id} style={styles.enhancedPlayerItem}>
                <TouchableOpacity 
                  style={styles.playerMainContent}
                  onPress={() => navigateToPlayerProfile(player)}
                  activeOpacity={0.7}
                >
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>
                      {index + 1}. {player.name}
                      {player.name === sessionData?.ownerName && ' ⭐'}
                    </Text>
                    <View style={styles.playerMetaRow}>
                      <Text style={styles.playerMeta}>
                        {new Date(player.joinedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <View style={styles.playerStatsCompact}>
                        <Text style={styles.statCompact}>🏸{player.gamesPlayed}</Text>
                        <Text style={styles.statCompact}>🏆{player.wins}</Text>
                        <View style={[styles.statusBadgeCompact, getStatusStyle(player.status)]}>
                          <Text style={styles.statusTextCompact}>{player.status}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
                
                {isOwner && player.name !== sessionData?.ownerName && (
                  <TouchableOpacity 
                    style={styles.removeButtonCompact}
                    onPress={() => removePlayer(player.id, player.name)}
                  >
                    <Text style={styles.removeButtonText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
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

      {/* Court Settings Modal */}
      <Modal
        visible={showCourtSettings}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCourtSettings(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Court Settings</Text>
            
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Number of Courts:</Text>
              <View style={styles.counterControls}>
                <TouchableOpacity 
                  style={styles.counterButton}
                  onPress={() => setCourtSettings(prev => ({ 
                    ...prev, 
                    courtCount: Math.max(1, prev.courtCount - 1) 
                  }))}
                >
                  <Text style={styles.counterButtonText}>−</Text>
                </TouchableOpacity>
                
                <Text style={styles.counterValue}>{courtSettings.courtCount}</Text>
                
                <TouchableOpacity 
                  style={styles.counterButton}
                  onPress={() => setCourtSettings(prev => ({ 
                    ...prev, 
                    courtCount: Math.min(10, prev.courtCount + 1) 
                  }))}
                >
                  <Text style={styles.counterButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowCourtSettings(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.modalAddButton}
                onPress={async () => {
                  try {
                    console.log('🔧 Court settings update:', {
                      shareCode,
                      deviceId,
                      courtCount: courtSettings.courtCount,
                      isOwner,
                      sessionOwnerDeviceId: sessionData?.ownerDeviceId
                    });
                    
                    const response = await fetch(`${API_BASE_URL}/mvp-sessions/${shareCode}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        ownerDeviceId: deviceId,
                        courtCount: courtSettings.courtCount
                      })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                      setShowCourtSettings(false);
                      refreshSessionData();
                      Alert.alert('Settings Saved', `Court count set to ${courtSettings.courtCount}`);
                    } else {
                      Alert.alert('Error', result.message || 'Failed to save settings');
                    }
                  } catch (error) {
                    console.error('Save court settings error:', error);
                    Alert.alert('Error', 'Failed to save court settings: ' + error.message);
                  }
                }}
              >
                <Text style={styles.modalAddText}>Save Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create Game Modal */}
      <Modal
        visible={showCreateGame}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCreateGame(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Game</Text>
            
            {/* Team 1 */}
            <Text style={styles.teamSectionTitle}>Team 1</Text>
            <View style={styles.playerSelectionRow}>
              <View style={styles.playerDropdown}>
                <Text style={styles.playerLabel}>Player 1:</Text>
                <TouchableOpacity 
                  style={styles.playerSelector}
                  onPress={() => {
                    const availablePlayers = sessionData?.players?.filter(p => p.status === 'ACTIVE') || [];
                    Alert.alert(
                      'Select Player 1 (Team 1)', 
                      'Choose a player:', 
                      availablePlayers.map(player => ({
                        text: player.name,
                        onPress: () => setGameForm(prev => ({ ...prev, team1Player1: player.name }))
                      })).concat([{ text: 'Cancel', style: 'cancel' }])
                    );
                  }}
                >
                  <Text style={styles.playerSelectorText}>
                    {gameForm.team1Player1 || 'Select Player'}
                  </Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.playerDropdown}>
                <Text style={styles.playerLabel}>Player 2:</Text>
                <TouchableOpacity 
                  style={styles.playerSelector}
                  onPress={() => {
                    const availablePlayers = sessionData?.players?.filter(p => p.status === 'ACTIVE' && p.name !== gameForm.team1Player1) || [];
                    Alert.alert(
                      'Select Player 2 (Team 1)', 
                      'Choose a player:', 
                      availablePlayers.map(player => ({
                        text: player.name,
                        onPress: () => setGameForm(prev => ({ ...prev, team1Player2: player.name }))
                      })).concat([{ text: 'Cancel', style: 'cancel' }])
                    );
                  }}
                >
                  <Text style={styles.playerSelectorText}>
                    {gameForm.team1Player2 || 'Select Player'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Team 2 */}
            <Text style={styles.teamSectionTitle}>Team 2</Text>
            <View style={styles.playerSelectionRow}>
              <View style={styles.playerDropdown}>
                <Text style={styles.playerLabel}>Player 1:</Text>
                <TouchableOpacity 
                  style={styles.playerSelector}
                  onPress={() => {
                    const usedPlayers = [gameForm.team1Player1, gameForm.team1Player2].filter(Boolean);
                    const availablePlayers = sessionData?.players?.filter(p => 
                      p.status === 'ACTIVE' && !usedPlayers.includes(p.name)
                    ) || [];
                    Alert.alert(
                      'Select Player 1 (Team 2)', 
                      'Choose a player:', 
                      availablePlayers.map(player => ({
                        text: player.name,
                        onPress: () => setGameForm(prev => ({ ...prev, team2Player1: player.name }))
                      })).concat([{ text: 'Cancel', style: 'cancel' }])
                    );
                  }}
                >
                  <Text style={styles.playerSelectorText}>
                    {gameForm.team2Player1 || 'Select Player'}
                  </Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.playerDropdown}>
                <Text style={styles.playerLabel}>Player 2:</Text>
                <TouchableOpacity 
                  style={styles.playerSelector}
                  onPress={() => {
                    const usedPlayers = [gameForm.team1Player1, gameForm.team1Player2, gameForm.team2Player1].filter(Boolean);
                    const availablePlayers = sessionData?.players?.filter(p => 
                      p.status === 'ACTIVE' && !usedPlayers.includes(p.name)
                    ) || [];
                    Alert.alert(
                      'Select Player 2 (Team 2)', 
                      'Choose a player:', 
                      availablePlayers.map(player => ({
                        text: player.name,
                        onPress: () => setGameForm(prev => ({ ...prev, team2Player2: player.name }))
                      })).concat([{ text: 'Cancel', style: 'cancel' }])
                    );
                  }}
                >
                  <Text style={styles.playerSelectorText}>
                    {gameForm.team2Player2 || 'Select Player'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Court Selection */}
            <Text style={styles.teamSectionTitle}>Court (Optional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={`Court 1, Court 2, etc.`}
              value={gameForm.courtName}
              onChangeText={(text) => setGameForm(prev => ({ ...prev, courtName: text }))}
              maxLength={50}
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowCreateGame(false);
                  setGameForm({
                    team1Player1: '',
                    team1Player2: '',
                    team2Player1: '',
                    team2Player2: '',
                    courtName: ''
                  });
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalAddButton, 
                  (!gameForm.team1Player1 || !gameForm.team1Player2 || !gameForm.team2Player1 || !gameForm.team2Player2) 
                    && styles.disabledButton
                ]}
                onPress={createGame}
                disabled={!gameForm.team1Player1 || !gameForm.team1Player2 || !gameForm.team2Player1 || !gameForm.team2Player2}
              >
                <Text style={styles.modalAddText}>Create Game</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Score Game Modal */}
      <Modal
        visible={showScoreGame}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowScoreGame(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Finish Game #{selectedGame?.gameNumber}</Text>
            
            <View style={styles.scoreSection}>
              <Text style={styles.scoreInstruction}>Enter final set scores (0-2, no ties allowed)</Text>
              
              {/* Team 1 Score */}
              <View style={styles.teamScoreRow}>
                <Text style={styles.teamScoreLabel}>
                  {selectedGame?.team1Player1} & {selectedGame?.team1Player2}
                </Text>
                <View style={styles.scoreControls}>
                  <TouchableOpacity 
                    style={styles.scoreButton}
                    onPress={() => setScoreForm(prev => ({ 
                      ...prev, 
                      team1FinalScore: Math.max(0, prev.team1FinalScore - 1) 
                    }))}
                  >
                    <Text style={styles.scoreButtonText}>−</Text>
                  </TouchableOpacity>
                  
                  <Text style={styles.scoreValue}>{scoreForm.team1FinalScore}</Text>
                  
                  <TouchableOpacity 
                    style={styles.scoreButton}
                    onPress={() => setScoreForm(prev => ({ 
                      ...prev, 
                      team1FinalScore: Math.min(2, prev.team1FinalScore + 1) 
                    }))}
                  >
                    <Text style={styles.scoreButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Team 2 Score */}
              <View style={styles.teamScoreRow}>
                <Text style={styles.teamScoreLabel}>
                  {selectedGame?.team2Player1} & {selectedGame?.team2Player2}
                </Text>
                <View style={styles.scoreControls}>
                  <TouchableOpacity 
                    style={styles.scoreButton}
                    onPress={() => setScoreForm(prev => ({ 
                      ...prev, 
                      team2FinalScore: Math.max(0, prev.team2FinalScore - 1) 
                    }))}
                  >
                    <Text style={styles.scoreButtonText}>−</Text>
                  </TouchableOpacity>
                  
                  <Text style={styles.scoreValue}>{scoreForm.team2FinalScore}</Text>
                  
                  <TouchableOpacity 
                    style={styles.scoreButton}
                    onPress={() => setScoreForm(prev => ({ 
                      ...prev, 
                      team2FinalScore: Math.min(2, prev.team2FinalScore + 1) 
                    }))}
                  >
                    <Text style={styles.scoreButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowScoreGame(false);
                  setSelectedGame(null);
                  setScoreForm({ team1FinalScore: 0, team2FinalScore: 0 });
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalAddButton, 
                  (scoreForm.team1FinalScore === scoreForm.team2FinalScore) && styles.disabledButton
                ]}
                onPress={updateGameScore}
                disabled={scoreForm.team1FinalScore === scoreForm.team2FinalScore}
              >
                <Text style={styles.modalAddText}>Finish Game</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Team Switch Modal */}
      <Modal
        visible={showTeamSwitch}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowTeamSwitch(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🔄 Switch Teams - Game #{selectedGame?.gameNumber}</Text>
            <Text style={styles.switchTeamsInstruction}>
              Drag players between teams or select from dropdowns to rearrange partnerships
            </Text>
            
            {/* Current Teams Display */}
            <View style={styles.currentTeamsContainer}>
              <Text style={styles.currentTeamsLabel}>Current Teams:</Text>
              <View style={styles.currentTeamsRow}>
                <View style={styles.currentTeam}>
                  <Text style={styles.currentTeamLabel}>Team 1</Text>
                  <Text style={styles.currentTeamPlayers}>
                    {selectedGame?.team1Player1} & {selectedGame?.team1Player2}
                  </Text>
                </View>
                <Text style={styles.currentVsText}>VS</Text>
                <View style={styles.currentTeam}>
                  <Text style={styles.currentTeamLabel}>Team 2</Text>
                  <Text style={styles.currentTeamPlayers}>
                    {selectedGame?.team2Player1} & {selectedGame?.team2Player2}
                  </Text>
                </View>
              </View>
            </View>

            {/* New Team Configuration */}
            <View style={styles.newTeamsContainer}>
              <Text style={styles.newTeamsLabel}>New Team Arrangement:</Text>
              
              {/* Team 1 Selection */}
              <View style={styles.teamSelectionRow}>
                <Text style={styles.teamSelectionLabel}>Team 1:</Text>
                <View style={styles.playerSelections}>
                  <TouchableOpacity 
                    style={styles.playerSelector}
                    onPress={() => {
                      // Show player selection for team1Player1
                      // For now, we'll use simple text input - can be enhanced later
                    }}
                  >
                    <TextInput
                      style={styles.playerInput}
                      value={teamSwitchForm.team1Player1}
                      onChangeText={(text) => setTeamSwitchForm(prev => ({ ...prev, team1Player1: text }))}
                      placeholder="Player 1"
                      placeholderTextColor="#999"
                    />
                  </TouchableOpacity>
                  <Text style={styles.andText}>&</Text>
                  <TouchableOpacity style={styles.playerSelector}>
                    <TextInput
                      style={styles.playerInput}
                      value={teamSwitchForm.team1Player2}
                      onChangeText={(text) => setTeamSwitchForm(prev => ({ ...prev, team1Player2: text }))}
                      placeholder="Player 2"
                      placeholderTextColor="#999"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Team 2 Selection */}
              <View style={styles.teamSelectionRow}>
                <Text style={styles.teamSelectionLabel}>Team 2:</Text>
                <View style={styles.playerSelections}>
                  <TouchableOpacity style={styles.playerSelector}>
                    <TextInput
                      style={styles.playerInput}
                      value={teamSwitchForm.team2Player1}
                      onChangeText={(text) => setTeamSwitchForm(prev => ({ ...prev, team2Player1: text }))}
                      placeholder="Player 1"
                      placeholderTextColor="#999"
                    />
                  </TouchableOpacity>
                  <Text style={styles.andText}>&</Text>
                  <TouchableOpacity style={styles.playerSelector}>
                    <TextInput
                      style={styles.playerInput}
                      value={teamSwitchForm.team2Player2}
                      onChangeText={(text) => setTeamSwitchForm(prev => ({ ...prev, team2Player2: text }))}
                      placeholder="Player 2"
                      placeholderTextColor="#999"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Quick Switch Presets */}
              <View style={styles.quickSwitchContainer}>
                <Text style={styles.quickSwitchLabel}>Quick Actions:</Text>
                <View style={styles.quickSwitchButtons}>
                  <TouchableOpacity 
                    style={styles.quickSwitchButton}
                    onPress={() => {
                      // Partner swap: swap partners within teams
                      if (selectedGame) {
                        setTeamSwitchForm({
                          team1Player1: selectedGame.team1Player2,
                          team1Player2: selectedGame.team1Player1,
                          team2Player1: selectedGame.team2Player2,
                          team2Player2: selectedGame.team2Player1
                        });
                      }
                    }}
                  >
                    <Text style={styles.quickSwitchText}>🔄 Partner Swap</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.quickSwitchButton}
                    onPress={() => {
                      // Complete team swap
                      if (selectedGame) {
                        setTeamSwitchForm({
                          team1Player1: selectedGame.team2Player1,
                          team1Player2: selectedGame.team2Player2,
                          team2Player1: selectedGame.team1Player1,
                          team2Player2: selectedGame.team1Player2
                        });
                      }
                    }}
                  >
                    <Text style={styles.quickSwitchText}>↔️ Team Swap</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowTeamSwitch(false);
                  setSelectedGame(null);
                  setTeamSwitchForm({
                    team1Player1: '',
                    team1Player2: '',
                    team2Player1: '',
                    team2Player2: ''
                  });
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.modalAddButton}
                onPress={updateGameTeams}
              >
                <Text style={styles.modalAddText}>Update Teams</Text>
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


const getGameStatusStyle = (status: string) => {
  switch (status) {
    case 'IN_PROGRESS':
      return { backgroundColor: '#FF9800' };
    case 'COMPLETED':
      return { backgroundColor: '#4CAF50' };
    case 'PAUSED':
      return { backgroundColor: '#9E9E9E' };
    case 'CANCELLED':
      return { backgroundColor: '#f44336' };
    default:
      return { backgroundColor: '#9E9E9E' };
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
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    paddingTop: 20,
    gap: 8,
  },
  copyButton: {
    backgroundColor: '#E8F5E9', // Lighter green
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    flex: 1,
    minWidth: 70,
  },
  copyButtonText: {
    color: '#4CAF50', // Darker green text
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  shareButton: {
    backgroundColor: '#E3F2FD', // Lighter blue
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    flex: 1,
    minWidth: 70,
  },
  shareButtonText: {
    color: '#2196F3', // Darker blue text
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  liveGameButton: {
    backgroundColor: '#FFE0B2', // Orange background
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    flex: 1,
    minWidth: 80,
  },
  liveGameButtonText: {
    color: '#FF6B35', // Orange text
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
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
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  playerName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#212121',
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
  courtSettingsButton: {
    backgroundColor: '#E8F5E9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  courtSettingsText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  courtInfoDisplay: {
    backgroundColor: '#F5F5F5',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  courtInfoText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
  createGameButton: {
    backgroundColor: '#E3F2FD',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  createGameText: {
    color: '#2196F3',
    fontSize: 12,
    fontWeight: '600',
  },
  gamesList: {
    gap: 12,
  },
  gameItem: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gameNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
  },
  courtName: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  gameStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  gameStatusText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '600',
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  team: {
    flex: 1,
    alignItems: 'center',
  },
  teamLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 4,
  },
  teamPlayers: {
    fontSize: 14,
    color: '#212121',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 4,
  },
  teamScore: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  vsText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
    marginHorizontal: 16,
  },
  finishGameButton: {
    backgroundColor: '#FF6B35',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignSelf: 'center',
  },
  finishGameText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  winnerBadge: {
    backgroundColor: '#4CAF50',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignSelf: 'center',
    marginTop: 8,
  },
  winnerText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  noGamesContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noGamesText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  startFirstGameButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  startFirstGameText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  // Court Settings Modal Styles
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  counterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  counterButton: {
    backgroundColor: '#2196F3',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  counterValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    minWidth: 30,
    textAlign: 'center',
  },
  // Game Creation Modal Styles
  teamSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    marginTop: 16,
  },
  playerSelectionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  playerDropdown: {
    flex: 1,
  },
  playerLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontWeight: '600',
  },
  playerSelector: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    minHeight: 44,
    justifyContent: 'center',
  },
  playerSelectorText: {
    fontSize: 14,
    color: '#333',
  },
  // Score Game Modal Styles
  scoreSection: {
    marginVertical: 20,
  },
  scoreInstruction: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  teamScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
  },
  teamScoreLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  scoreControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scoreButton: {
    backgroundColor: '#2196F3',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    minWidth: 24,
    textAlign: 'center',
  },

  // Team Switching Styles
  gameActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10,
  },
  switchTeamsButton: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    flex: 1,
    alignItems: 'center',
  },
  switchTeamsText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  switchTeamsInstruction: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  currentTeamsContainer: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  currentTeamsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  currentTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  currentTeam: {
    flex: 1,
    alignItems: 'center',
  },
  currentTeamLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  currentTeamPlayers: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
  currentVsText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#999',
    marginHorizontal: 10,
  },
  newTeamsContainer: {
    marginBottom: 20,
  },
  newTeamsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  teamSelectionRow: {
    marginBottom: 15,
  },
  teamSelectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  playerSelections: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerSelector: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 6,
    backgroundColor: 'white',
  },
  playerInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  andText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    paddingHorizontal: 5,
  },
  quickSwitchContainer: {
    marginTop: 15,
    padding: 15,
    backgroundColor: '#F0F8FF',
    borderRadius: 8,
  },
  quickSwitchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  quickSwitchButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  quickSwitchButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 6,
    flex: 1,
    alignItems: 'center',
  },
  quickSwitchText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },

  // New Compact UI Styles
  compactActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    gap: 12,
  },
  primaryActionButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  primaryActionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    backgroundColor: '#F5F5F5',
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    fontSize: 18,
  },

  // Compact Header Styles
  compactHeader: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerItem: {
    flex: 1,
    marginRight: 16,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
    textTransform: 'uppercase',
  },
  headerValue: {
    fontSize: 14,
    color: '#212121',
    marginTop: 2,
  },
  statusContainer: {
    alignItems: 'flex-end',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  courtCountBadge: {
    backgroundColor: '#E8F5E9',
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },

  // Enhanced Player List Styles
  playersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addPlayerInline: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addPlayerInlineText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyPlayerState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noPlayersSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
    marginBottom: 16,
  },
  addFirstPlayerButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  addFirstPlayerText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  playersList: {
    gap: 0,
  },
  enhancedPlayerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  playerMainContent: {
    flex: 1,
  },
  playerMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  playerStatsCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statCompact: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  statusBadgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusTextCompact: {
    fontSize: 9,
    color: 'white',
    fontWeight: '600',
  },
  removeButtonCompact: {
    backgroundColor: '#FF3B30',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});