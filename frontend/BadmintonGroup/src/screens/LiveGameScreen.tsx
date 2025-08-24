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
  FlatList
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  const [deviceId, setDeviceId] = useState<string>('');
  const [isOwner, setIsOwner] = useState(false);

  // Game settings
  const [gameFormat, setGameFormat] = useState<'best_of_3' | 'single_set' | 'first_to_21'>('best_of_3');
  const [pointsToWin, setPointsToWin] = useState(21);
  const [winByTwo, setWinByTwo] = useState(true);

  useEffect(() => {
    initializeScreen();
  }, [route.params]);

  const initializeScreen = async () => {
    const storedDeviceId = await AsyncStorage.getItem('deviceId');
    setDeviceId(storedDeviceId || '');
    
    // Mock session data for development
    const mockSessionData: SessionData = {
      id: route.params.sessionId,
      name: 'Sunday Morning Session',
      players: [
        { id: '1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 2, wins: 1, losses: 1 },
        { id: '2', name: 'Bob', status: 'ACTIVE', gamesPlayed: 2, wins: 2, losses: 0 },
        { id: '3', name: 'Charlie', status: 'ACTIVE', gamesPlayed: 1, wins: 0, losses: 1 },
        { id: '4', name: 'Diana', status: 'RESTING', gamesPlayed: 1, wins: 1, losses: 0 },
        { id: '5', name: 'Eve', status: 'ACTIVE', gamesPlayed: 0, wins: 0, losses: 0 },
        { id: '6', name: 'Frank', status: 'ACTIVE', gamesPlayed: 1, wins: 1, losses: 0 },
      ],
      courts: [
        {
          id: 'court1',
          name: 'Court 1',
          isActive: true,
          currentGame: {
            id: 'game1',
            team1: {
              player1: { id: '1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 2, wins: 1, losses: 1 },
              player2: { id: '2', name: 'Bob', status: 'ACTIVE', gamesPlayed: 2, wins: 2, losses: 0 },
              score: 18
            },
            team2: {
              player1: { id: '3', name: 'Charlie', status: 'ACTIVE', gamesPlayed: 1, wins: 0, losses: 1 },
              player2: { id: '4', name: 'Diana', status: 'RESTING', gamesPlayed: 1, wins: 1, losses: 0 },
              score: 16
            },
            status: 'IN_PROGRESS',
            currentSet: 1,
            sets: [
              { setNumber: 1, team1Score: 18, team2Score: 16, isCompleted: false }
            ],
            startTime: new Date().toISOString()
          },
          queue: []
        },
        {
          id: 'court2',
          name: 'Court 2',
          isActive: true,
          currentGame: undefined,
          queue: [
            { id: '5', name: 'Eve', status: 'ACTIVE', gamesPlayed: 0, wins: 0, losses: 0 },
            { id: '6', name: 'Frank', status: 'ACTIVE', gamesPlayed: 1, wins: 1, losses: 0 },
          ]
        }
      ],
      gameHistory: []
    };

    setSessionData(mockSessionData);
    setIsOwner(true); // Mock owner status
    setLoading(false);
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

  const finishGame = (courtId: string) => {
    if (!sessionData) return;

    const court = sessionData.courts.find(c => c.id === courtId);
    if (!court || !court.currentGame) return;

    // Move game to history
    const completedGame = { ...court.currentGame, status: 'COMPLETED' as const, endTime: new Date().toISOString() };
    
    // Update players' stats (mock implementation)
    // In real app, this would update the backend

    const updatedCourt = {
      ...court,
      currentGame: undefined
    };

    const updatedSession = {
      ...sessionData,
      courts: sessionData.courts.map(c => 
        c.id === updatedCourt.id ? updatedCourt : c
      ),
      gameHistory: [...sessionData.gameHistory, completedGame]
    };

    setSessionData(updatedSession);
    Alert.alert('Game Completed!', 'Game has been recorded and players can start a new game.');
  };

  const addToQueue = (courtId: string, player: Player) => {
    if (!sessionData) return;

    const court = sessionData.courts.find(c => c.id === courtId);
    if (!court) return;

    if (court.queue.some(p => p.id === player.id)) {
      Alert.alert('Already in Queue', 'Player is already in the queue for this court');
      return;
    }

    const updatedCourt = {
      ...court,
      queue: [...court.queue, player]
    };

    updateCourtInSession(updatedCourt);
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
            <Text style={styles.emptyQueue}>No players in queue</Text>
          ) : (
            <View style={styles.queueList}>
              {court.queue.map((player, index) => (
                <View key={player.id} style={styles.queueItem}>
                  <Text style={styles.queuePlayerName}>
                    {index + 1}. {player.name}
                  </Text>
                  {isOwner && (
                    <TouchableOpacity 
                      style={styles.removeQueueButton}
                      onPress={() => removeFromQueue(court.id, player.id)}
                    >
                      <Ionicons name="close" size={16} color="#f44336" />
                    </TouchableOpacity>
                  )}
                </View>
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
                  style={[
                    styles.startGameButton,
                    court.queue.length < 4 && styles.disabledButton
                  ]}
                  onPress={() => startNewGame(court)}
                  disabled={court.queue.length < 4}
                >
                  <Ionicons name="play" size={16} color="#fff" />
                  <Text style={styles.startGameButtonText}>Start Game</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
    </View>
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
          {sessionData.players.length} Players • {sessionData.courts.length} Courts
        </Text>
      </View>

      {/* Game Settings */}
      {isOwner && (
        <TouchableOpacity 
          style={styles.settingsButton}
          onPress={() => setShowGameSettings(true)}
        >
          <Ionicons name="settings-outline" size={20} color="#007AFF" />
          <Text style={styles.settingsButtonText}>Game Settings</Text>
        </TouchableOpacity>
      )}

      {/* Courts */}
      <View style={styles.courtsSection}>
        <Text style={styles.sectionTitle}>Courts</Text>
        {sessionData.courts.map(court => renderCourt(court))}
      </View>

      {/* Player Status */}
      <View style={styles.playersSection}>
        <Text style={styles.sectionTitle}>Player Status</Text>
        <View style={styles.playersGrid}>
          {sessionData.players.map(player => (
            <View key={player.id} style={styles.playerStatusCard}>
              <Text style={styles.playerStatusName}>{player.name}</Text>
              <View style={[
                styles.playerStatusBadge, 
                { backgroundColor: player.status === 'ACTIVE' ? '#4CAF50' : '#FF9800' }
              ]}>
                <Text style={styles.playerStatusText}>{player.status}</Text>
              </View>
              <Text style={styles.playerStatusStats}>
                {player.wins}W - {player.losses}L
              </Text>
            </View>
          ))}
        </View>
      </View>

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
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 16,
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
  playerStatusName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
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
});