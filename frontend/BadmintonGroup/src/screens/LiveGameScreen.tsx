import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  TextInput
} from 'react-native';
import { useRoute, useNavigation, RouteProp, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEVICE_ID_KEY } from '../config/api';
import sessionApi from '../services/sessionApi';
import { 
  EnhancedQueueItem, 
  UpNextBanner, 
  useEnhancedQueue,
  hapticService
} from '../components';

const API_BASE_URL = 'http://localhost:3001/api/v1';

interface Player {
  id: string;
  name: string;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
  gamesPlayed: number;
  wins: number;
  losses: number;
}

interface GameTeam {
  player1: Player;
  player2: Player;
  score: number;
}

interface Game {
  id: string;
  team1: GameTeam;
  team2: GameTeam;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED';
  currentSet: number;
  sets: GameSet[];
  startTime: string;
  endTime?: string;
  winnerTeam?: 1 | 2;
}

interface GameSet {
  setNumber: number;
  team1Score: number;
  team2Score: number;
  isCompleted: boolean;
  winnerTeam?: 1 | 2;
}

interface Court {
  id: string;
  name: string;
  currentGame?: Game;
  isActive: boolean;
  queue: Player[];
}

interface SessionData {
  id: string;
  name: string;
  players: Player[];
  courts: Court[];
  gameHistory: Game[];
  ownerDeviceId?: string;
}

type RouteParams = {
  sessionId: string;
  shareCode: string;
};

export default function LiveGameScreen() {
  const route = useRoute<RouteProp<{ params: RouteParams }, 'params'>>();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);
  const [showPlayerSelector, setShowPlayerSelector] = useState(false);
  const [showGameSettings, setShowGameSettings] = useState(false);
  const [showCourtSettings, setShowCourtSettings] = useState(false);
  const [courtSettings, setCourtSettings] = useState({
    courtCount: 1, // Default to 1 court instead of 2
    courtNames: ['Court 1']
  });
  const [showTimerSettings, setShowTimerSettings] = useState(false);
  const [timerSettings, setTimerSettings] = useState({
    gameTimeLimit: 30, // minutes
    setTimeLimit: 15, // minutes
    warmupTime: 2, // minutes
    breakTime: 1, // minutes between sets
    enableTimeWarnings: true,
    warningTime: 5 // minutes before timeout
  });
  const [showRotationSettings, setShowRotationSettings] = useState(false);
  const [rotationSettings, setRotationSettings] = useState({
    autoRotationEnabled: true,
    rotationInterval: 3, // games
    prioritizeNewPlayers: true,
    balanceSkillLevels: false,
    maxConsecutiveGames: 2,
    minimumRestTime: 1 // games to rest
  });
  const [showScoringSettings, setShowScoringSettings] = useState(false);
  const [scoringSettings, setScoringSettings] = useState({
    gameType: 'rally', // 'rally' or 'traditional'
    pointsToWin: 21,
    winByMargin: 2,
    maxPoints: 30,
    setsToWin: 2, // best of 3
    enableDeuce: true
  });
  const [deviceId, setDeviceId] = useState<string>('');
  const [isOwner, setIsOwner] = useState(false);
  const [showPlayerManagement, setShowPlayerManagement] = useState(false);
  const [selectedPlayerForRemoval, setSelectedPlayerForRemoval] = useState<Player | null>(null);

  // Game settings
  const [gameFormat, setGameFormat] = useState<'best_of_3' | 'single_set' | 'first_to_21'>('best_of_3');
  const [pointsToWin, setPointsToWin] = useState(21);
  const [winByTwo, setWinByTwo] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<number>(0);
  const [isEditingCourtSettings, setIsEditingCourtSettings] = useState(false);

  // Enhanced queue functionality
  const enhancedQueue = useEnhancedQueue(selectedCourt);
  
  // Auto-populate empty queues when conditions are met
  useEffect(() => {
    if (!sessionData) return;
    
    // Auto-populate any empty queues when session data updates
    sessionData.courts.forEach(court => {
      if (!court.currentGame && court.queue.length === 0) {
        // Check if there are enough active players
        const activePlayersCount = sessionData.players.filter(p => p.status === 'ACTIVE').length;
        if (activePlayersCount >= 4) {
          console.log(`🎯 Auto-populating empty queue for ${court.name} with ${activePlayersCount} active players`);
          // Small delay to allow UI to update, then populate
          setTimeout(() => {
            autoPopulateQueue(court.id, true); // Silent auto-population
          }, 500);
        } else {
          console.log(`⏳ Waiting for more players on ${court.name}: ${activePlayersCount}/4 active`);
        }
      }
    });
  }, [sessionData?.players?.length, sessionData?.players?.map(p => p.status).join(',')]);
  
  // Also trigger when a game finishes and court becomes available
  useEffect(() => {
    if (!sessionData) return;
    
    sessionData.courts.forEach(court => {
      // If court just became available (no game but had one before) and queue is empty
      if (!court.currentGame && court.queue.length === 0) {
        const activePlayersCount = sessionData.players.filter(p => p.status === 'ACTIVE').length;
        if (activePlayersCount >= 4) {
          console.log(`🎯 Court ${court.name} is now available, auto-populating queue`);
          setTimeout(() => {
            autoPopulateQueue(court.id, true);
          }, 1500); // Slightly longer delay for game finish transitions
        }
      }
    });
  }, [sessionData?.courts?.map(c => c.currentGame?.id).join(','), sessionData?.courts?.map(c => c.queue.length).join(',')]);

  useEffect(() => {
    initializeScreen();
  }, [route.params]);

  // Refresh data when screen comes into focus (with cooldown to prevent rate limiting)
  useFocusEffect(
    React.useCallback(() => {
      const now = Date.now();
      const COOLDOWN_MS = 2000; // 2 second cooldown between refreshes
      
      if (route.params?.shareCode && (now - lastRefresh) > COOLDOWN_MS && !isEditingCourtSettings) {
        console.log('🔄 LiveGameScreen focused, refreshing session data. Current court count:', courtSettings.courtCount);
        setLastRefresh(now);
        fetchSessionData();
      } else if (isEditingCourtSettings) {
        console.log('🚫 Skipping refresh - user is editing court settings');
      }
    }, [route.params?.shareCode, lastRefresh, courtSettings.courtCount, isEditingCourtSettings])
  );

  const initializeScreen = async () => {
    try {
      const storedDeviceId = await sessionApi.getDeviceId();
      setDeviceId(storedDeviceId || '');
      
      await fetchSessionData();
    } catch (error) {
      console.error('Initialize screen error:', error);
      setLoading(false);
    }
  };

  const fetchSessionData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/mvp-sessions/${route.params.shareCode}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch session data');
      }
      
      const data = await response.json();
      const session = data.data.session;
      
      // Transform API data to match our SessionData interface
      const transformedData: SessionData = {
        id: session.id,
        name: session.name,
        players: session.players.map((player: any) => ({
          id: player.id,
          name: player.name,
          status: player.status,
          gamesPlayed: player.gamesPlayed || 0,
          wins: player.wins || 0,
          losses: player.losses || 0
        })),
        courts: generateCourtsFromSession(session),
        gameHistory: (session.games || [])
          .filter((game: any) => game.status === 'COMPLETED') // Only show completed games
          .map((game: any) => ({
          id: game.id,
          team1: {
            player1: { id: '1', name: game.team1Player1, status: 'ACTIVE' as const, gamesPlayed: 0, wins: 0, losses: 0 },
            player2: { id: '2', name: game.team1Player2, status: 'ACTIVE' as const, gamesPlayed: 0, wins: 0, losses: 0 },
            score: game.team1FinalScore || 0
          },
          team2: {
            player1: { id: '3', name: game.team2Player1, status: 'ACTIVE' as const, gamesPlayed: 0, wins: 0, losses: 0 },
            player2: { id: '4', name: game.team2Player2, status: 'ACTIVE' as const, gamesPlayed: 0, wins: 0, losses: 0 },
            score: game.team2FinalScore || 0
          },
          status: 'COMPLETED' as const,
          currentSet: 1,
          sets: game.sets || [],
          startTime: game.startTime,
          endTime: game.endTime,
          winnerTeam: game.winnerTeam
        })),
        ownerDeviceId: session.ownerDeviceId
      };
      
      setSessionData(transformedData);
      
      // Initialize court settings from session data
      const sessionCourtCount = session.courtCount || 1; // Default to 1 court, not 2
      const sessionCourtNames = Array.from({ length: sessionCourtCount }, (_, i) => `Court ${i + 1}`);
      
      // Auto-populate empty courts with Fair Play queue
      setTimeout(() => {
        transformedData.courts.forEach(court => {
          if (!court.currentGame && court.queue.length === 0) {
            autoPopulateQueue(court.id, true); // Silent auto-population
          }
        });
      }, 2000); // Wait 2 seconds after data loads
      
      console.log('📊 Updating court settings from session data:', {
        sessionCourtCount,
        currentCourtCount: courtSettings.courtCount,
        sessionCourtNames
      });
      
      setCourtSettings({
        courtCount: sessionCourtCount,
        courtNames: sessionCourtNames
      });
      
      // Check if current user is the owner
      const storedDeviceId = await sessionApi.getDeviceId();
      console.log('Owner check - stored deviceId:', storedDeviceId);
      console.log('Owner check - session ownerDeviceId:', session.ownerDeviceId);
      setIsOwner(session.ownerDeviceId === storedDeviceId);
      
      // Temporary fallback - if no ownerDeviceId match, check if user is first player (for testing)
      if (session.ownerDeviceId !== storedDeviceId && session.players.length > 0) {
        const firstPlayer = session.players[0];
        console.log('Fallback owner check - first player deviceId:', firstPlayer.deviceId);
        if (firstPlayer.deviceId === storedDeviceId) {
          setIsOwner(true);
        }
      }
      
      // TEMPORARY: Force owner mode for testing (remove this line in production)
      setIsOwner(true);
      
    } catch (error) {
      console.error('Fetch session data error:', error);
      Alert.alert('Error', 'Failed to load session data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const generateCourtsFromSession = (session: any) => {
    // Use current court settings if available, otherwise fallback to session data
    const courtCount = courtSettings.courtCount || session.courtCount || 2;
    const courtNames = courtSettings.courtNames || [];
    const courts: Court[] = [];
    
    for (let i = 1; i <= courtCount; i++) {
      courts.push({
        id: `court${i}`,
        name: courtNames[i-1] || `Court ${i}`,
        isActive: true,
        currentGame: undefined, // Will be populated from IN_PROGRESS games
        queue: []
      });
    }
    
    // Restore any IN_PROGRESS games to their respective courts
    if (session.games) {
      session.games
        .filter((game: any) => game.status === 'IN_PROGRESS')
        .forEach((game: any) => {
          // Find the court by name
          const court = courts.find(c => c.name === game.courtName);
          if (court) {
            court.currentGame = {
              id: game.id,
              team1: {
                player1: { id: '1', name: game.team1Player1, status: 'ACTIVE' as const, gamesPlayed: 0, wins: 0, losses: 0 },
                player2: { id: '2', name: game.team1Player2, status: 'ACTIVE' as const, gamesPlayed: 0, wins: 0, losses: 0 },
                score: 0 // Always start with 0 for in-progress games - user will update scores manually
              },
              team2: {
                player1: { id: '3', name: game.team2Player1, status: 'ACTIVE' as const, gamesPlayed: 0, wins: 0, losses: 0 },
                player2: { id: '4', name: game.team2Player2, status: 'ACTIVE' as const, gamesPlayed: 0, wins: 0, losses: 0 },
                score: 0 // Always start with 0 for in-progress games - user will update scores manually
              },
              status: 'IN_PROGRESS' as const,
              currentSet: 1,
              sets: [{ setNumber: 1, team1Score: 0, team2Score: 0, isCompleted: false }],
              startTime: game.startTime,
              endTime: game.endTime,
              winnerTeam: game.winnerTeam
            };
          }
        });
    }
    
    return courts;
  };

  const saveCourtSettings = async () => {
    try {
      const requestBody = {
        courtCount: courtSettings.courtCount,
        ownerDeviceId: sessionData?.ownerDeviceId || deviceId
      };
      
      console.log('Saving court settings:', requestBody);
      console.log('API URL:', `${API_BASE_URL}/mvp-sessions/${route.params.shareCode}/courts`);
      
      // Save court settings to backend
      const response = await fetch(`${API_BASE_URL}/mvp-sessions/${route.params.shareCode}/courts`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);
      
      // Get response text first to see what we're actually receiving
      const responseText = await response.text();
      console.log('Response text:', responseText);

      if (response.ok) {
        // Try to parse as JSON only if response is ok
        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch (parseError) {
          console.log('JSON parse error, but response was OK. Raw response:', responseText);
        }

        // Update local session data immediately for better UX
        if (sessionData) {
          const updatedCourts = generateCourtsFromSession({ courtCount: courtSettings.courtCount });
          const updatedSessionData = {
            ...sessionData,
            courts: updatedCourts
          };
          setSessionData(updatedSessionData);
        }

        setShowCourtSettings(false);
        Alert.alert('Success', 'Court settings updated successfully!');
      } else {
        // Try to parse error response, but handle HTML responses
        let errorMessage = 'Failed to save court settings';
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error?.message || errorMessage;
        } catch (parseError) {
          // If it's HTML, extract meaningful error or use status
          if (responseText.includes('<')) {
            errorMessage = `Server error (${response.status}): ${response.statusText}`;
          } else {
            errorMessage = responseText || errorMessage;
          }
        }
        Alert.alert('Error', errorMessage);
      }
      
    } catch (error) {
      console.error('Save court settings error:', error);
      Alert.alert('Error', 'Failed to save court settings. Please try again.');
    }
  };

  const startNewGame = (court: Court) => {
    if (court.queue.length < 4) {
      Alert.alert('Not Enough Players', 'Need at least 4 players to start a game');
      return;
    }

    const [p1, p2, p3, p4] = court.queue.slice(0, 4);
    
    const newGame: Game = {
      id: `game_${Date.now()}`,
      team1: {
        player1: p1,
        player2: p2,
        score: 0
      },
      team2: {
        player1: p3,
        player2: p4,
        score: 0
      },
      status: 'IN_PROGRESS',
      currentSet: 1,
      sets: [
        { setNumber: 1, team1Score: 0, team2Score: 0, isCompleted: false }
      ],
      startTime: new Date().toISOString()
    };

    // Update court with new game and remove players from queue
    const updatedCourt = {
      ...court,
      currentGame: newGame,
      queue: court.queue.slice(4)
    };

    updateCourtInSession(updatedCourt);
  };

  const updateScore = (courtId: string, team: 1 | 2, increment: boolean) => {
    if (!sessionData) return;

    const court = sessionData.courts.find(c => c.id === courtId);
    if (!court || !court.currentGame) return;

    const game = court.currentGame;
    const currentSet = game.sets[game.currentSet - 1];
    
    if (increment) {
      if (team === 1) {
        currentSet.team1Score++;
        game.team1.score = currentSet.team1Score;
      } else {
        currentSet.team2Score++;
        game.team2.score = currentSet.team2Score;
      }
    } else {
      if (team === 1 && currentSet.team1Score > 0) {
        currentSet.team1Score--;
        game.team1.score = currentSet.team1Score;
      } else if (team === 2 && currentSet.team2Score > 0) {
        currentSet.team2Score--;
        game.team2.score = currentSet.team2Score;
      }
    }

    // Check if set is won
    const team1Score = currentSet.team1Score;
    const team2Score = currentSet.team2Score;
    const minPointsToWin = pointsToWin;
    const needWinByTwo = winByTwo;

    if (team1Score >= minPointsToWin || team2Score >= minPointsToWin) {
      const diff = Math.abs(team1Score - team2Score);
      if (!needWinByTwo || diff >= 2) {
        // Set completed
        currentSet.isCompleted = true;
        currentSet.winnerTeam = team1Score > team2Score ? 1 : 2;

        // Check if game is completed based on format
        const team1Sets = game.sets.filter(s => s.winnerTeam === 1).length;
        const team2Sets = game.sets.filter(s => s.winnerTeam === 2).length;

        if (gameFormat === 'single_set' || gameFormat === 'first_to_21') {
          // Game completed
          game.status = 'COMPLETED';
          game.winnerTeam = currentSet.winnerTeam;
          game.endTime = new Date().toISOString();
        } else if (gameFormat === 'best_of_3') {
          if (team1Sets === 2 || team2Sets === 2) {
            // Game completed
            game.status = 'COMPLETED';
            game.winnerTeam = team1Sets === 2 ? 1 : 2;
            game.endTime = new Date().toISOString();
          } else if (game.currentSet < 3) {
            // Start next set
            game.currentSet++;
            game.sets.push({
              setNumber: game.currentSet,
              team1Score: 0,
              team2Score: 0,
              isCompleted: false
            });
          }
        }
      }
    }

    const updatedCourt = { ...court, currentGame: game };
    updateCourtInSession(updatedCourt);
  };

  const updateCourtInSession = (updatedCourt: Court) => {
    if (!sessionData) return;

    const updatedSession = {
      ...sessionData,
      courts: sessionData.courts.map(c => 
        c.id === updatedCourt.id ? updatedCourt : c
      )
    };

    setSessionData(updatedSession);
  };

  const handlePlayerSelfDropout = async () => {
    try {
      // Get current player ID from session data by deviceId
      const currentPlayer = sessionData?.players.find(p => p.id === deviceId || p.name === deviceId);
      if (!currentPlayer) {
        Alert.alert('Error', 'Player not found in session');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/mvp-sessions/${route.params.shareCode}/players/${currentPlayer.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'LEFT',
          deviceId: deviceId
        }),
      });

      if (response.ok) {
        Alert.alert('Success', 'You have left the session.');
        navigation.goBack();
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error?.message || 'Failed to leave session');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to leave session. Please try again.');
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    try {
      // Get the actual owner device ID from session data
      const actualOwnerDeviceId = sessionData?.ownerDeviceId || await sessionApi.getDeviceId();
      
      console.log('Removing player with ownerDeviceId:', actualOwnerDeviceId);
      console.log('Current deviceId:', deviceId);
      
      const response = await fetch(`${API_BASE_URL}/mvp-sessions/${route.params.shareCode}/players/${playerId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ownerDeviceId: actualOwnerDeviceId
        }),
      });

      if (response.ok) {
        // Refresh the session data to get updated player list
        await fetchSessionData();
        Alert.alert('Success', 'Player has been removed from the session.');
      } else {
        const errorData = await response.json();
        console.log('Remove player error response:', errorData);
        Alert.alert('Error', errorData.error?.message || 'Failed to remove player');
      }
    } catch (error) {
      console.error('Remove player error:', error);
      Alert.alert('Error', 'Failed to remove player. Please try again.');
    }
  };

  const confirmPlayerRemoval = (player: Player) => {
    Alert.alert(
      'Remove Player',
      `Are you sure you want to remove ${player.name} from the session?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: () => handleRemovePlayer(player.id)
        }
      ]
    );
  };

  const confirmSelfDropout = () => {
    Alert.alert(
      'Leave Session',
      'Are you sure you want to leave this session? You will not be able to rejoin.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Leave', 
          style: 'destructive',
          onPress: handlePlayerSelfDropout
        }
      ]
    );
  };

  const handlePlayerRest = async (playerId: string, playerName: string, gamesCount: number, isOwner: boolean = false) => {
    if (!sessionData) return;

    try {
      const response = await fetch(`${API_BASE_URL}/mvp-sessions/${route.params.shareCode}/players/${playerId}/rest`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gamesCount,
          deviceId: deviceId,
          ownerDeviceId: isOwner ? sessionData?.ownerDeviceId : undefined
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const action = gamesCount > 0 ? `resting for ${gamesCount} game(s)` : 'back to active';
        Alert.alert('Rest Updated', `${playerName} is now ${action}`);
        await fetchSessionData(); // Refresh session data
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error?.message || 'Failed to update rest status');
      }
    } catch (error) {
      console.error('Rest error:', error);
      Alert.alert('Error', 'Failed to update rest status');
    }
  };

  const showRestOptions = (playerId: string, playerName: string, isOwnPlayer: boolean = false) => {
    const actionTitle = isOwnPlayer ? 'Take a Rest' : `Manage ${playerName}'s Rest`;
    Alert.alert(
      actionTitle,
      'How many games would you like to rest?',
      [
        { 
          text: 'Cancel', 
          style: 'cancel' 
        },
        { 
          text: 'Back to Active', 
          onPress: () => handlePlayerRest(playerId, playerName, 0, !isOwnPlayer) 
        },
        { 
          text: '1 Game', 
          onPress: () => handlePlayerRest(playerId, playerName, 1, !isOwnPlayer) 
        },
        { 
          text: '2 Games', 
          onPress: () => handlePlayerRest(playerId, playerName, 2, !isOwnPlayer) 
        },
        { 
          text: '3 Games', 
          onPress: () => handlePlayerRest(playerId, playerName, 3, !isOwnPlayer) 
        }
      ]
    );
  };

  const finishGame = async (courtId: string) => {
    if (!sessionData) return;

    const court = sessionData.courts.find(c => c.id === courtId);
    if (!court || !court.currentGame) return;

    try {
      const game = court.currentGame;
      
      // Record game duration for wait time calculations
      await enhancedQueue.recordGameCompletion(
        game.startTime,
        new Date().toISOString(),
        4, // player count
        2  // completed sets (typical)
      );
      
      // Validate scores before saving
      if (game.team1.score === game.team2.score) {
        Alert.alert('Invalid Score', 'Game cannot end in a tie. Please update the scores.');
        return;
      }
      
      if (game.team1.score < 0 || game.team1.score > 2 || game.team2.score < 0 || game.team2.score > 2) {
        Alert.alert('Invalid Score', 'Scores must be between 0 and 2.');
        return;
      }
      
      if (game.team1.score === 0 && game.team2.score === 0) {
        Alert.alert('Invalid Score', 'At least one team must have a score greater than 0.');
        return;
      }
      
      console.log('🏸 Attempting to save game:', {
        shareCode: route.params.shareCode,
        gameData: {
          courtName: court.name,
          team1: `${game.team1.player1.name} & ${game.team1.player2.name}`,
          team2: `${game.team2.player1.name} & ${game.team2.player2.name}`,
          score: `${game.team1.score} - ${game.team2.score}`,
          winnerTeam: game.winnerTeam
        }
      });
      
      // Step 1: Create the game as IN_PROGRESS
      const createResponse = await fetch(`${API_BASE_URL}/mvp-sessions/${route.params.shareCode}/games`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courtName: court.name,
          team1Player1: game.team1.player1.name,
          team1Player2: game.team1.player2.name,
          team2Player1: game.team2.player1.name,
          team2Player2: game.team2.player2.name
        }),
      });

      console.log('🏸 Game creation response:', {
        status: createResponse.status,
        statusText: createResponse.statusText,
        ok: createResponse.ok
      });

      if (!createResponse.ok) {
        throw new Error(`Failed to create game: ${createResponse.statusText}`);
      }

      const createData = await createResponse.json();
      const gameId = createData.data.game.id;
      
      console.log('✅ Game created successfully:', createData);
      
      // Step 2: Update the score to complete the game (this updates player statistics)
      const scoreResponse = await fetch(`${API_BASE_URL}/mvp-sessions/${route.params.shareCode}/games/${gameId}/score`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          team1FinalScore: game.team1.score,
          team2FinalScore: game.team2.score
        }),
      });

      console.log('🏸 Game score update response:', {
        status: scoreResponse.status,
        statusText: scoreResponse.statusText,
        ok: scoreResponse.ok
      });

      if (scoreResponse.ok) {
        const scoreData = await scoreResponse.json();
        console.log('✅ Game completed successfully:', scoreData);
        // Don't update local state here - let fetchSessionData() handle the refresh
        
        Alert.alert('Game Completed!', 'Game has been recorded. Next game will start automatically.');
        
        // Get player IDs who just played to exclude them from next game
        const justPlayedIds = [
          game.team1.player1.id,
          game.team1.player2.id,
          game.team2.player1.id,
          game.team2.player2.id
        ];
        
        // Refresh session data FIRST, then auto-populate next game
        try {
          await fetchSessionData(); // Wait for fresh data
          
          // Small delay to ensure UI updates, then populate with fresh data
          setTimeout(() => {
            autoPopulateQueue(court.id, true, justPlayedIds); // Silent mode with player exclusion
          }, 1000);
        } catch (error) {
          console.error('Error refreshing session data:', error);
          // Fallback: still try to populate but with longer delay
          setTimeout(() => {
            autoPopulateQueue(court.id, true, justPlayedIds);
          }, 5000);
        }
      } else {
        const errorText = await response.text();
        console.error('❌ Game save failed:', {
          status: response.status,
          statusText: response.statusText,
          errorResponse: errorText
        });
        
        try {
          const errorData = JSON.parse(errorText);
          Alert.alert('Error', errorData.error?.message || 'Failed to save game');
        } catch {
          Alert.alert('Error', `Failed to save game. Status: ${response.status}`);
        }
      }
    } catch (error) {
      console.error('❌ Finish game network error:', error);
      Alert.alert('Error', 'Failed to save game. Please try again.');
    }
  };

  // Auto Fair Play Queue Management with player cooldown
  const autoPopulateQueue = (courtId: string, silent: boolean = false, excludePlayerIds: string[] = []) => {
    if (!sessionData) return;
    
    console.log('🎯 Fair Play Debug:', {
      excludePlayerIds,
      allPlayers: sessionData.players.map(p => ({ name: p.name, id: p.id, gamesPlayed: p.gamesPlayed, status: p.status }))
    });
    
    const activePlayers = sessionData.players.filter(p => 
      p.status === 'ACTIVE' && !excludePlayerIds.includes(p.id)
    );
    
    console.log('🎯 Available players:', activePlayers.map(p => ({ name: p.name, gamesPlayed: p.gamesPlayed })));
    
    // Need at least 4 players for a game
    if (activePlayers.length < 4) {
      console.log('❌ Not enough players:', activePlayers.length);
      if (!silent) {
        Alert.alert('Not Enough Players', `Need at least 4 more players for Fair Play queue. Currently have ${activePlayers.length} available.`);
      }
      return;
    }
    
    // Enhanced Fair Play algorithm: prioritize players with fewer games
    const suggestedPlayers = activePlayers
      .sort((a, b) => {
        // Primary: fewer games played
        if (a.gamesPlayed !== b.gamesPlayed) {
          return a.gamesPlayed - b.gamesPlayed;
        }
        // Secondary: joined earlier  
        return new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime();
      })
      .slice(0, 4); // Take top 4 for the queue
    
    console.log('✅ Selected players:', suggestedPlayers.map(p => ({ name: p.name, gamesPlayed: p.gamesPlayed })));
    
    const court = sessionData.courts.find(c => c.id === courtId);
    if (!court) return;
    
    // Update court with suggested players and auto-start game
    const updatedCourt = {
      ...court,
      queue: suggestedPlayers
    };
    
    updateCourtInSession(updatedCourt);
    
    // Auto-start game if we have 4 players
    setTimeout(() => {
      autoStartGame(courtId);
    }, 100);
    
    if (!silent) {
      Alert.alert(
        'New Game Started!', 
        `🎯 Fair Play Selection:\n${suggestedPlayers.map((p, i) => `${i+1}. ${p.name} (${p.gamesPlayed} games)`).join('\n')}\n\nTap "Finish Game" when done to record scores.`,
        [{ text: 'Got it!' }]
      );
    }
  };

  // Auto-start game from queue
  const autoStartGame = (courtId: string) => {
    const court = sessionData?.courts.find(c => c.id === courtId);
    if (!court || court.queue.length < 4) return;

    const [p1, p2, p3, p4] = court.queue.slice(0, 4);
    
    const newGame: Game = {
      id: Date.now().toString(),
      team1: {
        player1: p1,
        player2: p2,
        score: 0
      },
      team2: {
        player1: p3,
        player2: p4,
        score: 0
      },
      status: 'IN_PROGRESS',
      currentSet: 1,
      sets: [{
        setNumber: 1,
        team1Score: 0,
        team2Score: 0,
        isCompleted: false
      }],
      startTime: new Date().toISOString()
    };

    // Update court with new game and remove players from queue
    const updatedCourt = {
      ...court,
      currentGame: newGame,
      queue: court.queue.slice(4)
    };

    updateCourtInSession(updatedCourt);
  };

  const addToQueue = async (courtId: string, player: Player) => {
    if (!sessionData) return;

    const court = sessionData.courts.find(c => c.id === courtId);
    if (!court) return;

    if (court.queue.some(p => p.id === player.id)) {
      await hapticService.validationError('mild');
      Alert.alert('Already in Queue', 'Player is already in the queue for this court');
      return;
    }

    const updatedCourt = {
      ...court,
      queue: [...court.queue, player]
    };

    updateCourtInSession(updatedCourt);
    await hapticService.queueUpdate('added');
  };

  const removeFromQueue = (courtId: string, playerId: string) => {
    if (!sessionData) return;

    const court = sessionData.courts.find(c => c.id === courtId);
    if (!court) return;

    const updatedCourt = {
      ...court,
      queue: court.queue.filter(p => p.id !== playerId)
    };

    updateCourtInSession(updatedCourt);
  };

  const renderCourt = (court: Court) => (
    <View key={court.id} style={styles.courtCard}>
      <View style={styles.courtHeader}>
        <Text style={styles.courtName}>{court.name}</Text>
        <View style={[styles.courtStatus, court.currentGame ? styles.activeStatus : styles.availableStatus]}>
          <Text style={styles.courtStatusText}>
            {court.currentGame ? 'Playing' : 'Available'}
          </Text>
        </View>
      </View>

      {/* Up Next Banner - shows during active games */}
      <UpNextBanner
        nextPlayers={enhancedQueue.nextPlayers}
        queueLength={court.queue.length}
        showDuringGame={!!court.currentGame}
        courtId={court.id}
        estimatedWaitTimes={enhancedQueue.getWaitTimeEstimates(4)}
        isVisible={enhancedQueue.showUpNextBanner}
      />

      {court.currentGame ? (
        <View style={styles.gameContainer}>
          {/* Team 1 */}
          <View style={styles.teamContainer}>
            <View style={styles.teamInfo}>
              <Text style={styles.teamLabel}>Team 1</Text>
              <Text style={styles.playerNames}>
                {court.currentGame.team1.player1.name} & {court.currentGame.team1.player2.name}
              </Text>
            </View>
            <View style={styles.scoreContainer}>
              <TouchableOpacity 
                style={styles.scoreButton}
                onPress={() => updateScore(court.id, 1, false)}
                disabled={!isOwner}
              >
                <Ionicons name="remove" size={20} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.score}>{court.currentGame.team1.score}</Text>
              <TouchableOpacity 
                style={styles.scoreButton}
                onPress={() => updateScore(court.id, 1, true)}
                disabled={!isOwner}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* VS Divider */}
          <View style={styles.vsDivider}>
            <Text style={styles.vsText}>VS</Text>
            <Text style={styles.setInfo}>Set {court.currentGame.currentSet}</Text>
          </View>

          {/* Team 2 */}
          <View style={styles.teamContainer}>
            <View style={styles.teamInfo}>
              <Text style={styles.teamLabel}>Team 2</Text>
              <Text style={styles.playerNames}>
                {court.currentGame.team2.player1.name} & {court.currentGame.team2.player2.name}
              </Text>
            </View>
            <View style={styles.scoreContainer}>
              <TouchableOpacity 
                style={styles.scoreButton}
                onPress={() => updateScore(court.id, 2, false)}
                disabled={!isOwner}
              >
                <Ionicons name="remove" size={20} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.score}>{court.currentGame.team2.score}</Text>
              <TouchableOpacity 
                style={styles.scoreButton}
                onPress={() => updateScore(court.id, 2, true)}
                disabled={!isOwner}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Game Actions */}
          {isOwner && (
            <View style={styles.gameActions}>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => finishGame(court.id)}
              >
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.actionButtonText}>Finish Game</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.availableContainer}>
          <Text style={styles.queueTitle}>Queue ({court.queue.length})</Text>
          
          {court.queue.length === 0 ? (
            <View style={styles.emptyQueueContainer}>
              {sessionData.players.filter(p => p.status === 'ACTIVE').length >= 4 ? (
                <>
                  <ActivityIndicator size="small" color="#28a745" style={{ marginBottom: 8 }} />
                  <Text style={styles.emptyQueue}>🎯 Auto-generating Fair Play queue...</Text>
                  <Text style={styles.emptyQueueSubtext}>
                    Players with fewer games get priority
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyQueue}>🎯 Waiting for more players...</Text>
                  <Text style={styles.emptyQueueSubtext}>
                    Need {4 - sessionData.players.filter(p => p.status === 'ACTIVE').length} more active players for Fair Play
                  </Text>
                </>
              )}
            </View>
          ) : (
            <View style={styles.queueList}>
              {enhancedQueue.queueWithEstimates.map(({ player, position, waitTime, isNextUp }) => (
                <EnhancedQueueItem
                  key={player.id}
                  position={position}
                  player={player}
                  estimatedWaitTime={waitTime.minutes}
                  isNextUp={isNextUp}
                  gameCount={player.gamesPlayed}
                  showRemoveButton={isOwner}
                  onRemove={isOwner ? () => {
                    removeFromQueue(court.id, player.id);
                    enhancedQueue.handleQueueUpdate('removed', player.name);
                  } : undefined}
                />
              ))}
            </View>
          )}

          <View style={styles.courtActions}>
            {isOwner && (
              <>
                <TouchableOpacity 
                  style={styles.addPlayerButton}
                  onPress={() => {
                    setSelectedCourt(court);
                    setShowPlayerSelector(true);
                  }}
                >
                  <Ionicons name="person-add" size={16} color="#007AFF" />
                  <Text style={styles.addPlayerButtonText}>Add to Queue</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.refreshQueueButton}
                  onPress={() => {
                    // Clear current queue and repopulate with Fair Play
                    const updatedCourt = { ...court, queue: [] };
                    updateCourtInSession(updatedCourt);
                    setTimeout(() => {
                      autoPopulateQueue(court.id, false, []); // Show alert for manual refresh
                    }, 500);
                  }}
                >
                  <Ionicons name="refresh" size={16} color="#28a745" />
                  <Text style={styles.refreshQueueText}>🎯 Refresh Fair Play</Text>
                </TouchableOpacity>

                <View style={styles.autoStartNotice}>
                  <Text style={styles.autoStartText}>
                    {court.queue.length < 4 
                      ? `🎯 Need ${4 - court.queue.length} more players` 
                      : '🎯 Game will start automatically!'
                    }
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );

  const renderGameSettings = () => (
    <Modal visible={showGameSettings} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Game Settings</Text>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowGameSettings(false)}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.settingsContent}>
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>🏸 Court Management</Text>
              <TouchableOpacity 
                style={styles.settingButton}
                onPress={() => {
                  setShowGameSettings(false);
                  setShowCourtSettings(true);
                }}
              >
                <Text style={styles.settingButtonText}>Configure Courts</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>⏱️ Game Timer</Text>
              <TouchableOpacity 
                style={styles.settingButton}
                onPress={() => {
                  setShowGameSettings(false);
                  setShowTimerSettings(true);
                }}
              >
                <Text style={styles.settingButtonText}>Timer Settings</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>🔄 Auto Rotation</Text>
              <TouchableOpacity 
                style={styles.settingButton}
                onPress={() => {
                  setShowGameSettings(false);
                  setShowRotationSettings(true);
                }}
              >
                <Text style={styles.settingButtonText}>Rotation Rules</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>📊 Scoring System</Text>
              <TouchableOpacity 
                style={styles.settingButton}
                onPress={() => {
                  setShowGameSettings(false);
                  setShowScoringSettings(true);
                }}
              >
                <Text style={styles.settingButtonText}>Scoring Rules</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.modalActionButton}
            onPress={() => setShowGameSettings(false)}
          >
            <Text style={styles.modalActionButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderCourtSettings = () => (
    <Modal visible={showCourtSettings} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Configure Courts</Text>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowCourtSettings(false)}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.courtSettingsContent}>
            <View style={styles.courtSettingItem}>
              <Text style={styles.courtSettingLabel}>Number of Courts</Text>
              <View style={styles.courtCountControls}>
                <TouchableOpacity 
                  style={styles.courtCountButton}
                  onPress={() => {
                    setIsEditingCourtSettings(true);
                    console.log('➖ Minus button pressed. Current court count:', courtSettings.courtCount);
                    if (courtSettings.courtCount > 1) {
                      const newCount = courtSettings.courtCount - 1;
                      const newNames = courtSettings.courtNames.slice(0, newCount);
                      console.log('➖ Setting new count to:', newCount);
                      setCourtSettings({
                        courtCount: newCount,
                        courtNames: newNames
                      });
                    } else {
                      console.log('➖ Cannot decrease - already at minimum (1)');
                    }
                  }}
                >
                  <Ionicons name="remove" size={20} color="#007AFF" />
                </TouchableOpacity>
                
                <Text style={styles.courtCountText}>{courtSettings.courtCount}</Text>
                
                <TouchableOpacity 
                  style={styles.courtCountButton}
                  onPress={() => {
                    setIsEditingCourtSettings(true);
                    console.log('➕ Plus button pressed. Current court count:', courtSettings.courtCount);
                    if (courtSettings.courtCount < 8) {
                      const newCount = courtSettings.courtCount + 1;
                      const newNames = [...courtSettings.courtNames, `Court ${newCount}`];
                      console.log('➕ Setting new count to:', newCount);
                      setCourtSettings({
                        courtCount: newCount,
                        courtNames: newNames
                      });
                    } else {
                      console.log('➕ Cannot increase - already at maximum (8)');
                    }
                  }}
                >
                  <Ionicons name="add" size={20} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.courtNamesHeader}>Court Names</Text>
            {courtSettings.courtNames.map((name, index) => (
              <View key={index} style={styles.courtNameItem}>
                <Text style={styles.courtNameLabel}>Court {index + 1}:</Text>
                <TextInput
                  style={styles.courtNameInput}
                  value={name}
                  onChangeText={(text) => {
                    const newNames = [...courtSettings.courtNames];
                    newNames[index] = text;
                    setCourtSettings({
                      ...courtSettings,
                      courtNames: newNames
                    });
                  }}
                  placeholder={`Court ${index + 1}`}
                />
              </View>
            ))}
          </View>

          <View style={styles.courtSettingsActions}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => {
                setIsEditingCourtSettings(false);
                setShowCourtSettings(false);
              }}
            >
              <Text style={styles.modalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.modalActionButton}
              onPress={async () => {
                console.log('💾 Save Changes button pressed!');
                console.log('Current court settings:', courtSettings);
                setIsEditingCourtSettings(false);
                await saveCourtSettings();
                setShowCourtSettings(false);
              }}
            >
              <Text style={styles.modalActionButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderTimerSettings = () => (
    <Modal visible={showTimerSettings} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Timer Settings</Text>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowTimerSettings(false)}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.settingsScrollView}>
            <View style={styles.timerSettingItem}>
              <Text style={styles.settingLabel}>⏰ Game Time Limit</Text>
              <View style={styles.timerControls}>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setTimerSettings({...timerSettings, gameTimeLimit: Math.max(10, timerSettings.gameTimeLimit - 5)})}
                >
                  <Ionicons name="remove" size={16} color="#007AFF" />
                </TouchableOpacity>
                <Text style={styles.timerValue}>{timerSettings.gameTimeLimit} min</Text>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setTimerSettings({...timerSettings, gameTimeLimit: Math.min(60, timerSettings.gameTimeLimit + 5)})}
                >
                  <Ionicons name="add" size={16} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.timerSettingItem}>
              <Text style={styles.settingLabel}>⏱️ Set Time Limit</Text>
              <View style={styles.timerControls}>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setTimerSettings({...timerSettings, setTimeLimit: Math.max(5, timerSettings.setTimeLimit - 5)})}
                >
                  <Ionicons name="remove" size={16} color="#007AFF" />
                </TouchableOpacity>
                <Text style={styles.timerValue}>{timerSettings.setTimeLimit} min</Text>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setTimerSettings({...timerSettings, setTimeLimit: Math.min(30, timerSettings.setTimeLimit + 5)})}
                >
                  <Ionicons name="add" size={16} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.timerSettingItem}>
              <Text style={styles.settingLabel}>🏃 Warmup Time</Text>
              <View style={styles.timerControls}>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setTimerSettings({...timerSettings, warmupTime: Math.max(0, timerSettings.warmupTime - 1)})}
                >
                  <Ionicons name="remove" size={16} color="#007AFF" />
                </TouchableOpacity>
                <Text style={styles.timerValue}>{timerSettings.warmupTime} min</Text>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setTimerSettings({...timerSettings, warmupTime: Math.min(10, timerSettings.warmupTime + 1)})}
                >
                  <Ionicons name="add" size={16} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.timerSettingItem}>
              <Text style={styles.settingLabel}>☕ Break Time</Text>
              <View style={styles.timerControls}>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setTimerSettings({...timerSettings, breakTime: Math.max(0, timerSettings.breakTime - 1)})}
                >
                  <Ionicons name="remove" size={16} color="#007AFF" />
                </TouchableOpacity>
                <Text style={styles.timerValue}>{timerSettings.breakTime} min</Text>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setTimerSettings({...timerSettings, breakTime: Math.min(5, timerSettings.breakTime + 1)})}
                >
                  <Ionicons name="add" size={16} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.toggleSettingItem}>
              <Text style={styles.settingLabel}>🔔 Time Warnings</Text>
              <TouchableOpacity 
                style={[styles.toggleButton, timerSettings.enableTimeWarnings && styles.toggleButtonActive]}
                onPress={() => setTimerSettings({...timerSettings, enableTimeWarnings: !timerSettings.enableTimeWarnings})}
              >
                <Text style={[styles.toggleButtonText, timerSettings.enableTimeWarnings && styles.toggleButtonTextActive]}>
                  {timerSettings.enableTimeWarnings ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            </View>

            {timerSettings.enableTimeWarnings && (
              <View style={styles.timerSettingItem}>
                <Text style={styles.settingLabel}>⚠️ Warning Time</Text>
                <View style={styles.timerControls}>
                  <TouchableOpacity 
                    style={styles.timerButton}
                    onPress={() => setTimerSettings({...timerSettings, warningTime: Math.max(1, timerSettings.warningTime - 1)})}
                  >
                    <Ionicons name="remove" size={16} color="#007AFF" />
                  </TouchableOpacity>
                  <Text style={styles.timerValue}>{timerSettings.warningTime} min</Text>
                  <TouchableOpacity 
                    style={styles.timerButton}
                    onPress={() => setTimerSettings({...timerSettings, warningTime: Math.min(15, timerSettings.warningTime + 1)})}
                  >
                    <Ionicons name="add" size={16} color="#007AFF" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.courtSettingsActions}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowTimerSettings(false)}
            >
              <Text style={styles.modalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.modalActionButton}
              onPress={() => {
                console.log('Saving timer settings:', timerSettings);
                setShowTimerSettings(false);
              }}
            >
              <Text style={styles.modalActionButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderRotationSettings = () => (
    <Modal visible={showRotationSettings} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Rotation Rules</Text>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowRotationSettings(false)}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.settingsScrollView}>
            <View style={styles.toggleSettingItem}>
              <Text style={styles.settingLabel}>🔄 Auto Rotation</Text>
              <TouchableOpacity 
                style={[styles.toggleButton, rotationSettings.autoRotationEnabled && styles.toggleButtonActive]}
                onPress={() => setRotationSettings({...rotationSettings, autoRotationEnabled: !rotationSettings.autoRotationEnabled})}
              >
                <Text style={[styles.toggleButtonText, rotationSettings.autoRotationEnabled && styles.toggleButtonTextActive]}>
                  {rotationSettings.autoRotationEnabled ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            </View>

            {rotationSettings.autoRotationEnabled && (
              <>
                <View style={styles.timerSettingItem}>
                  <Text style={styles.settingLabel}>⏰ Rotation Interval</Text>
                  <View style={styles.timerControls}>
                    <TouchableOpacity 
                      style={styles.timerButton}
                      onPress={() => setRotationSettings({...rotationSettings, rotationInterval: Math.max(1, rotationSettings.rotationInterval - 1)})}
                    >
                      <Ionicons name="remove" size={16} color="#007AFF" />
                    </TouchableOpacity>
                    <Text style={styles.timerValue}>{rotationSettings.rotationInterval} games</Text>
                    <TouchableOpacity 
                      style={styles.timerButton}
                      onPress={() => setRotationSettings({...rotationSettings, rotationInterval: Math.min(10, rotationSettings.rotationInterval + 1)})}
                    >
                      <Ionicons name="add" size={16} color="#007AFF" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.timerSettingItem}>
                  <Text style={styles.settingLabel}>🎯 Max Consecutive Games</Text>
                  <View style={styles.timerControls}>
                    <TouchableOpacity 
                      style={styles.timerButton}
                      onPress={() => setRotationSettings({...rotationSettings, maxConsecutiveGames: Math.max(1, rotationSettings.maxConsecutiveGames - 1)})}
                    >
                      <Ionicons name="remove" size={16} color="#007AFF" />
                    </TouchableOpacity>
                    <Text style={styles.timerValue}>{rotationSettings.maxConsecutiveGames} games</Text>
                    <TouchableOpacity 
                      style={styles.timerButton}
                      onPress={() => setRotationSettings({...rotationSettings, maxConsecutiveGames: Math.min(5, rotationSettings.maxConsecutiveGames + 1)})}
                    >
                      <Ionicons name="add" size={16} color="#007AFF" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.timerSettingItem}>
                  <Text style={styles.settingLabel}>💤 Minimum Rest Time</Text>
                  <View style={styles.timerControls}>
                    <TouchableOpacity 
                      style={styles.timerButton}
                      onPress={() => setRotationSettings({...rotationSettings, minimumRestTime: Math.max(0, rotationSettings.minimumRestTime - 1)})}
                    >
                      <Ionicons name="remove" size={16} color="#007AFF" />
                    </TouchableOpacity>
                    <Text style={styles.timerValue}>{rotationSettings.minimumRestTime} games</Text>
                    <TouchableOpacity 
                      style={styles.timerButton}
                      onPress={() => setRotationSettings({...rotationSettings, minimumRestTime: Math.min(5, rotationSettings.minimumRestTime + 1)})}
                    >
                      <Ionicons name="add" size={16} color="#007AFF" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.toggleSettingItem}>
                  <Text style={styles.settingLabel}>🆕 Prioritize New Players</Text>
                  <TouchableOpacity 
                    style={[styles.toggleButton, rotationSettings.prioritizeNewPlayers && styles.toggleButtonActive]}
                    onPress={() => setRotationSettings({...rotationSettings, prioritizeNewPlayers: !rotationSettings.prioritizeNewPlayers})}
                  >
                    <Text style={[styles.toggleButtonText, rotationSettings.prioritizeNewPlayers && styles.toggleButtonTextActive]}>
                      {rotationSettings.prioritizeNewPlayers ? 'ON' : 'OFF'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.toggleSettingItem}>
                  <Text style={styles.settingLabel}>⚖️ Balance Skill Levels</Text>
                  <TouchableOpacity 
                    style={[styles.toggleButton, rotationSettings.balanceSkillLevels && styles.toggleButtonActive]}
                    onPress={() => setRotationSettings({...rotationSettings, balanceSkillLevels: !rotationSettings.balanceSkillLevels})}
                  >
                    <Text style={[styles.toggleButtonText, rotationSettings.balanceSkillLevels && styles.toggleButtonTextActive]}>
                      {rotationSettings.balanceSkillLevels ? 'ON' : 'OFF'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.courtSettingsActions}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowRotationSettings(false)}
            >
              <Text style={styles.modalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.modalActionButton}
              onPress={() => {
                console.log('Saving rotation settings:', rotationSettings);
                setShowRotationSettings(false);
              }}
            >
              <Text style={styles.modalActionButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderScoringSettings = () => (
    <Modal visible={showScoringSettings} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Scoring Rules</Text>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowScoringSettings(false)}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.settingsScrollView}>
            <View style={styles.scoringTypeSection}>
              <Text style={styles.settingLabel}>🏸 Game Type</Text>
              <View style={styles.scoringTypeButtons}>
                <TouchableOpacity 
                  style={[styles.scoringTypeButton, scoringSettings.gameType === 'rally' && styles.scoringTypeButtonActive]}
                  onPress={() => setScoringSettings({...scoringSettings, gameType: 'rally'})}
                >
                  <Text style={[styles.scoringTypeButtonText, scoringSettings.gameType === 'rally' && styles.scoringTypeButtonTextActive]}>
                    Rally Point
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.scoringTypeButton, scoringSettings.gameType === 'traditional' && styles.scoringTypeButtonActive]}
                  onPress={() => setScoringSettings({...scoringSettings, gameType: 'traditional'})}
                >
                  <Text style={[styles.scoringTypeButtonText, scoringSettings.gameType === 'traditional' && styles.scoringTypeButtonTextActive]}>
                    Traditional
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.timerSettingItem}>
              <Text style={styles.settingLabel}>🎯 Points to Win</Text>
              <View style={styles.timerControls}>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setScoringSettings({...scoringSettings, pointsToWin: Math.max(11, scoringSettings.pointsToWin - 1)})}
                >
                  <Ionicons name="remove" size={16} color="#007AFF" />
                </TouchableOpacity>
                <Text style={styles.timerValue}>{scoringSettings.pointsToWin}</Text>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setScoringSettings({...scoringSettings, pointsToWin: Math.min(30, scoringSettings.pointsToWin + 1)})}
                >
                  <Ionicons name="add" size={16} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.timerSettingItem}>
              <Text style={styles.settingLabel}>📊 Win by Margin</Text>
              <View style={styles.timerControls}>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setScoringSettings({...scoringSettings, winByMargin: Math.max(1, scoringSettings.winByMargin - 1)})}
                >
                  <Ionicons name="remove" size={16} color="#007AFF" />
                </TouchableOpacity>
                <Text style={styles.timerValue}>{scoringSettings.winByMargin}</Text>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setScoringSettings({...scoringSettings, winByMargin: Math.min(5, scoringSettings.winByMargin + 1)})}
                >
                  <Ionicons name="add" size={16} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.timerSettingItem}>
              <Text style={styles.settingLabel}>🔢 Max Points</Text>
              <View style={styles.timerControls}>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setScoringSettings({...scoringSettings, maxPoints: Math.max(scoringSettings.pointsToWin + 5, scoringSettings.maxPoints - 1)})}
                >
                  <Ionicons name="remove" size={16} color="#007AFF" />
                </TouchableOpacity>
                <Text style={styles.timerValue}>{scoringSettings.maxPoints}</Text>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setScoringSettings({...scoringSettings, maxPoints: Math.min(50, scoringSettings.maxPoints + 1)})}
                >
                  <Ionicons name="add" size={16} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.timerSettingItem}>
              <Text style={styles.settingLabel}>🏆 Sets to Win Match</Text>
              <View style={styles.timerControls}>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setScoringSettings({...scoringSettings, setsToWin: Math.max(1, scoringSettings.setsToWin - 1)})}
                >
                  <Ionicons name="remove" size={16} color="#007AFF" />
                </TouchableOpacity>
                <Text style={styles.timerValue}>{scoringSettings.setsToWin} of {scoringSettings.setsToWin * 2 - 1}</Text>
                <TouchableOpacity 
                  style={styles.timerButton}
                  onPress={() => setScoringSettings({...scoringSettings, setsToWin: Math.min(3, scoringSettings.setsToWin + 1)})}
                >
                  <Ionicons name="add" size={16} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.toggleSettingItem}>
              <Text style={styles.settingLabel}>⚖️ Enable Deuce</Text>
              <TouchableOpacity 
                style={[styles.toggleButton, scoringSettings.enableDeuce && styles.toggleButtonActive]}
                onPress={() => setScoringSettings({...scoringSettings, enableDeuce: !scoringSettings.enableDeuce})}
              >
                <Text style={[styles.toggleButtonText, scoringSettings.enableDeuce && styles.toggleButtonTextActive]}>
                  {scoringSettings.enableDeuce ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={styles.courtSettingsActions}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowScoringSettings(false)}
            >
              <Text style={styles.modalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.modalActionButton}
              onPress={() => {
                console.log('Saving scoring settings:', scoringSettings);
                setShowScoringSettings(false);
              }}
            >
              <Text style={styles.modalActionButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderPlayerManagement = () => (
    <Modal visible={showPlayerManagement} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Manage Players</Text>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowPlayerManagement(false)}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.playerManagementContent}>
            <Text style={styles.playerManagementDescription}>
              Remove players from the session. Players currently in active games cannot be removed.
            </Text>
            
            {sessionData?.players.map(player => {
              // Check if player is currently in an active game
              const isInActiveGame = sessionData.courts.some(court => 
                court.currentGame && (
                  court.currentGame.team1.player1.id === player.id ||
                  court.currentGame.team1.player2.id === player.id ||
                  court.currentGame.team2.player1.id === player.id ||
                  court.currentGame.team2.player2.id === player.id
                )
              );

              return (
                <View key={player.id} style={styles.playerManagementItem}>
                  <View style={styles.playerManagementInfo}>
                    <Text style={styles.playerManagementName}>{player.name}</Text>
                    <View style={styles.playerManagementStats}>
                      <View style={[
                        styles.playerStatusBadge, 
                        { 
                          backgroundColor: player.status === 'ACTIVE' ? '#4CAF50' : 
                                         player.status === 'RESTING' ? '#FF9800' : '#f44336'
                        }
                      ]}>
                        <Text style={styles.playerStatusText}>{player.status}</Text>
                      </View>
                      <Text style={styles.playerStatsText}>
                        {player.wins}W - {player.losses}L - {player.gamesPlayed} games
                      </Text>
                    </View>
                    {isInActiveGame && (
                      <Text style={styles.activeGameWarning}>Currently playing</Text>
                    )}
                    {player.restGamesRemaining > 0 && (
                      <Text style={styles.restingWarning}>
                        Resting for {player.restGamesRemaining} more game(s)
                      </Text>
                    )}
                  </View>
                  
                  <View style={styles.playerManagementActions}>
                    {/* Rest Button - Available for all active/resting players not currently playing */}
                    <TouchableOpacity
                      style={[
                        styles.restPlayerButton,
                        (isInActiveGame || player.status === 'LEFT') && styles.restPlayerButtonDisabled
                      ]}
                      onPress={() => showRestOptions(player.id, player.name, player.deviceId === deviceId)}
                      disabled={isInActiveGame || player.status === 'LEFT'}
                    >
                      <Ionicons 
                        name="moon-outline" 
                        size={16} 
                        color={isInActiveGame || player.status === 'LEFT' ? '#ccc' : '#FF9800'} 
                      />
                      <Text style={[
                        styles.restPlayerButtonText,
                        (isInActiveGame || player.status === 'LEFT') && styles.restPlayerButtonTextDisabled
                      ]}>
                        {player.status === 'RESTING' ? 'Manage Rest' : 'Rest'}
                      </Text>
                    </TouchableOpacity>

                    {/* Remove Button - Only for session owner */}
                    <TouchableOpacity
                      style={[
                        styles.removePlayerButton,
                        (isInActiveGame || player.status === 'LEFT') && styles.removePlayerButtonDisabled
                      ]}
                      onPress={() => confirmPlayerRemoval(player)}
                      disabled={isInActiveGame || player.status === 'LEFT'}
                    >
                      <Ionicons 
                        name="trash-outline" 
                        size={16} 
                        color={isInActiveGame || player.status === 'LEFT' ? '#ccc' : '#f44336'} 
                      />
                      <Text style={[
                        styles.removePlayerButtonText,
                        (isInActiveGame || player.status === 'LEFT') && styles.removePlayerButtonTextDisabled
                      ]}>
                        Remove
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={styles.modalActionButton}
            onPress={() => setShowPlayerManagement(false)}
          >
            <Text style={styles.modalActionButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderPlayerSelector = () => (
    <Modal visible={showPlayerSelector} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Player to Queue</Text>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowPlayerSelector(false)}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={sessionData?.players.filter(p => 
              p.status === 'ACTIVE' && 
              !selectedCourt?.queue.some(qp => qp.id === p.id)
            )}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.playerSelectorItem}
                onPress={() => {
                  if (selectedCourt) {
                    addToQueue(selectedCourt.id, item);
                    setShowPlayerSelector(false);
                  }
                }}
              >
                <Text style={styles.playerSelectorName}>{item.name}</Text>
                <Text style={styles.playerSelectorStats}>
                  Games: {item.gamesPlayed} | W: {item.wins} | L: {item.losses}
                </Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading game session...</Text>
      </View>
    );
  }

  if (!sessionData) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#f44336" />
        <Text style={styles.errorText}>Failed to load session</Text>
        <TouchableOpacity style={styles.retryButton} onPress={initializeScreen}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Session Header */}
      <View style={styles.sessionHeader}>
        <Text style={styles.sessionTitle}>{sessionData.name}</Text>
        <Text style={styles.sessionSubtitle}>
          {sessionData.players.length} Players • Courts: {courtSettings.courtCount}
        </Text>
      </View>

      {/* Compact Action Bar */}
      <View style={styles.compactGameActionBar}>
        {isOwner ? (
          <>
            <TouchableOpacity 
              style={styles.primaryGameAction}
              onPress={() => setShowPlayerManagement(true)}
            >
              <Ionicons name="people-outline" size={16} color="white" />
              <Text style={styles.primaryGameActionText}>Manage Players</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.iconGameButton}
              onPress={() => setShowGameSettings(true)}
            >
              <Ionicons name="settings-outline" size={20} color="#007AFF" />
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.playerOnlySection}>
            <Text style={styles.playerModeText}>Playing Mode</Text>
          </View>
        )}
        
        <TouchableOpacity 
          style={styles.iconGameButton}
          onPress={confirmSelfDropout}
        >
          <Ionicons name="exit-outline" size={20} color="#f44336" />
        </TouchableOpacity>
      </View>

      {/* Courts */}
      <View style={styles.courtsSection}>
        <Text style={styles.sectionTitle}>Courts</Text>
        {sessionData.courts.map(court => renderCourt(court))}
      </View>

      {/* Game History */}
      {sessionData.gameHistory.length > 0 && (
        <View style={styles.gameHistorySection}>
          <Text style={styles.sectionTitle}>Game History ({sessionData.gameHistory.length})</Text>
          {sessionData.gameHistory
            .filter(game => game && game.team1 && game.team2 && game.team1.player1 && game.team1.player2 && game.team2.player1 && game.team2.player2)
            .map((game, index) => (
            <View key={game.id || index} style={styles.gameHistoryCard}>
              <View style={styles.gameHistoryHeader}>
                <Text style={styles.gameHistoryTitle}>Game {index + 1}</Text>
                <Text style={styles.gameHistoryTime}>
                  {game.endTime || game.startTime ? 
                    new Date(game.endTime || game.startTime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : 'Unknown time'
                  }
                </Text>
              </View>
              
              <View style={styles.gameHistoryTeams}>
                <View style={styles.gameHistoryTeam}>
                  <Text style={styles.gameHistoryTeamLabel}>Team 1</Text>
                  <Text style={styles.gameHistoryPlayers}>
                    {game.team1.player1.name} & {game.team1.player2.name}
                  </Text>
                  <Text style={[
                    styles.gameHistoryScore,
                    game.winnerTeam === 1 && styles.gameHistoryWinnerScore
                  ]}>
                    {game.team1.score || 0}
                  </Text>
                </View>
                
                <Text style={styles.gameHistoryVs}>VS</Text>
                
                <View style={styles.gameHistoryTeam}>
                  <Text style={styles.gameHistoryTeamLabel}>Team 2</Text>
                  <Text style={styles.gameHistoryPlayers}>
                    {game.team2.player1.name} & {game.team2.player2.name}
                  </Text>
                  <Text style={[
                    styles.gameHistoryScore,
                    game.winnerTeam === 2 && styles.gameHistoryWinnerScore
                  ]}>
                    {game.team2.score || 0}
                  </Text>
                </View>
              </View>
              
              {game.winnerTeam && (
                <View style={styles.gameHistoryWinner}>
                  <Text style={styles.gameHistoryWinnerText}>
                    🏆 Team {game.winnerTeam} Won!
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Player Status */}
      <View style={styles.playersSection}>
        <Text style={styles.sectionTitle}>Player Status</Text>
        <View style={styles.playersGrid}>
          {sessionData.players.map(player => {
            const isCurrentPlayer = player.deviceId === deviceId;
            const isInActiveGame = sessionData.courts.some(court => 
              court.currentGame && (
                court.currentGame.team1.player1.id === player.id ||
                court.currentGame.team1.player2.id === player.id ||
                court.currentGame.team2.player1.id === player.id ||
                court.currentGame.team2.player2.id === player.id
              )
            );
            
            return (
              <View key={player.id} style={[
                styles.playerStatusCard,
                isCurrentPlayer && styles.currentPlayerCard
              ]}>
                <View style={styles.playerStatusHeader}>
                  <Text style={styles.playerStatusName}>
                    {player.name}
                    {isCurrentPlayer && ' (You)'}
                  </Text>
                  {isCurrentPlayer && !isInActiveGame && (
                    <TouchableOpacity
                      style={styles.selfRestButton}
                      onPress={() => showRestOptions(player.id, player.name, true)}
                    >
                      <Ionicons name="moon-outline" size={14} color="#FF9800" />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={[
                  styles.playerStatusBadge, 
                  { backgroundColor: player.status === 'ACTIVE' ? '#4CAF50' : 
                                   player.status === 'RESTING' ? '#FF9800' : '#f44336' }
                ]}>
                  <Text style={styles.playerStatusText}>
                    {player.status === 'RESTING' && player.restGamesRemaining > 0 
                      ? `RESTING (${player.restGamesRemaining})` 
                      : player.status}
                  </Text>
                </View>
                <Text style={styles.playerStatusStats}>
                  {player.wins}W - {player.losses}L - {player.gamesPlayed} games
                </Text>
                {isInActiveGame && (
                  <Text style={styles.playingIndicator}>🏸 Playing</Text>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {renderGameSettings()}
      {renderCourtSettings()}
      {renderTimerSettings()}
      {renderRotationSettings()}
      {renderScoringSettings()}
      {renderPlayerManagement()}
      {renderPlayerSelector()}
    </ScrollView>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#f44336',
    marginVertical: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  sessionHeader: {
    backgroundColor: '#007AFF',
    padding: 20,
    paddingTop: 60,
  },
  sessionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  sessionSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  actionButtonsContainer: {
    flexDirection: 'column',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 8,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    width: '100%',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  settingsButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  managePlayersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    width: '100%',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f44336',
  },
  managePlayersButtonText: {
    color: '#f44336',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  leaveSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    width: '100%',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f44336',
  },
  leaveSessionButtonText: {
    color: '#f44336',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  courtsSection: {
    padding: 20,
  },
  courtCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  courtHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  courtName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  courtStatus: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  activeStatus: {
    backgroundColor: '#4CAF50',
  },
  availableStatus: {
    backgroundColor: '#FF9800',
  },
  courtStatusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  gameContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
  },
  teamContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  teamInfo: {
    flex: 1,
  },
  teamLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  playerNames: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreButton: {
    backgroundColor: '#007AFF',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  score: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginHorizontal: 20,
    minWidth: 50,
    textAlign: 'center',
  },
  vsDivider: {
    alignItems: 'center',
    marginVertical: 8,
  },
  vsText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
  },
  setInfo: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  gameActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  availableContainer: {},
  queueTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  emptyQueue: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  queueList: {
    marginBottom: 16,
  },
  queueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    marginBottom: 4,
  },
  queuePlayerName: {
    fontSize: 14,
    color: '#333',
  },
  removeQueueButton: {
    padding: 4,
  },
  courtActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  addPlayerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#007AFF',
    flex: 1,
    marginRight: 8,
  },
  addPlayerButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  startGameButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    flex: 1,
    marginLeft: 8,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  startGameButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  playersSection: {
    padding: 20,
    paddingTop: 0,
  },
  playersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  playerStatusCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  currentPlayerCard: {
    borderWidth: 2,
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
  },
  playerStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  playerStatusName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  selfRestButton: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: '#FFF3E0',
    marginLeft: 8,
  },
  playingIndicator: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '600',
    marginTop: 4,
  },
  playerStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 4,
  },
  playerStatusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  playerStatusStats: {
    fontSize: 12,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalCloseButton: {
    padding: 4,
  },
  playerSelectorItem: {
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  playerSelectorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  playerSelectorStats: {
    fontSize: 14,
    color: '#666',
  },
  separator: {
    height: 1,
    backgroundColor: '#f0f0f0',
  },
  // Game Settings Modal Styles
  settingsContent: {
    paddingVertical: 10,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  settingButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  settingButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  // Court Settings Modal Styles
  courtSettingsContent: {
    paddingVertical: 10,
  },
  courtSettingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  courtSettingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  courtCountControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  courtCountButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  courtCountText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    minWidth: 30,
    textAlign: 'center',
  },
  courtNamesHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
  },
  courtNameItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  courtNameLabel: {
    fontSize: 14,
    color: '#666',
    width: 60,
  },
  courtNameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  courtSettingsActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  // Additional Modal Styles
  settingsScrollView: {
    maxHeight: 400,
  },
  timerSettingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  timerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timerButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    minWidth: 70,
    textAlign: 'center',
  },
  toggleSettingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  toggleButton: {
    backgroundColor: '#e9ecef',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  toggleButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  toggleButtonText: {
    color: '#6c757d',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    minWidth: 30,
  },
  toggleButtonTextActive: {
    color: '#fff',
  },
  scoringTypeSection: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  scoringTypeButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  scoringTypeButton: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  scoringTypeButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  scoringTypeButtonText: {
    color: '#6c757d',
    fontSize: 14,
    fontWeight: '500',
  },
  scoringTypeButtonTextActive: {
    color: '#fff',
  },
  // Player Management Modal Styles
  playerManagementContent: {
    maxHeight: 400,
    paddingVertical: 10,
  },
  playerManagementDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    paddingHorizontal: 4,
    lineHeight: 20,
  },
  playerManagementItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  playerManagementInfo: {
    flex: 1,
    marginRight: 16,
  },
  playerManagementName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  playerManagementStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  playerStatsText: {
    fontSize: 12,
    color: '#666',
  },
  activeGameWarning: {
    fontSize: 12,
    color: '#ff9800',
    fontWeight: '500',
    fontStyle: 'italic',
  },
  removePlayerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#f44336',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  removePlayerButtonDisabled: {
    backgroundColor: '#f8f9fa',
    borderColor: '#dee2e6',
  },
  removePlayerButtonText: {
    color: '#f44336',
    fontSize: 14,
    fontWeight: '500',
  },
  removePlayerButtonTextDisabled: {
    color: '#ccc',
  },
  playerManagementActions: {
    flexDirection: 'row',
    gap: 8,
  },
  restPlayerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  restPlayerButtonDisabled: {
    backgroundColor: '#f5f5f5',
    borderColor: '#ccc',
  },
  restPlayerButtonText: {
    color: '#FF9800',
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500',
  },
  restPlayerButtonTextDisabled: {
    color: '#ccc',
  },
  restingWarning: {
    fontSize: 11,
    color: '#FF9800',
    fontStyle: 'italic',
    marginTop: 2,
  },
  // Game History Styles
  gameHistorySection: {
    padding: 20,
    paddingTop: 0,
  },
  gameHistoryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  gameHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gameHistoryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  gameHistoryTime: {
    fontSize: 12,
    color: '#666',
  },
  gameHistoryTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  gameHistoryTeam: {
    flex: 1,
    alignItems: 'center',
  },
  gameHistoryTeamLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  gameHistoryPlayers: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  gameHistoryScore: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#666',
  },
  gameHistoryWinnerScore: {
    color: '#4CAF50',
  },
  gameHistoryVs: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginHorizontal: 16,
  },
  gameHistoryWinner: {
    backgroundColor: '#f0f8f0',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  gameHistoryWinnerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  modalActionButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalActionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Compact Action Bar Styles  
  compactGameActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  primaryGameAction: {
    backgroundColor: '#f44336',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  primaryGameActionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  iconGameButton: {
    backgroundColor: '#F5F5F5',
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerOnlySection: {
    flex: 1,
    alignItems: 'center',
  },
  playerModeText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },

  // Fair Play Queue Enhancement Styles
  emptyQueueContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  fairPlaySuggestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  fairPlaySuggestText: {
    color: '#28a745',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  enhancedQueueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  queuePlayerInfo: {
    flex: 1,
  },
  queuePlayerStats: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  refreshQueueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  refreshQueueText: {
    color: '#28a745',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },

  // Streamlined Auto-Start Styles
  emptyQueueSubtext: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  autoStartNotice: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
    flex: 1,
  },
  autoStartText: {
    color: '#28a745',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});