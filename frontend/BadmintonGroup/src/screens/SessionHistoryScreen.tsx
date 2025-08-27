import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  FlatList
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import sessionHistoryApi, { SessionHistoryItem, PlayerStats, GameResult, SessionHistoryUtils } from '../services/sessionHistoryApi';
import sessionApi from '../services/sessionApi';
import { DEVICE_ID_KEY } from '../config/api';

// Use interfaces from the API service
type SessionHistory = SessionHistoryItem;

export default function SessionHistoryScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionHistory | null>(null);
  const [showSessionDetail, setShowSessionDetail] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'organized' | 'participated'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'games' | 'duration'>('date');

  useEffect(() => {
    initializeScreen();
  }, []);

  const initializeScreen = async () => {
    const storedDeviceId = await sessionApi.getDeviceId();
    setDeviceId(storedDeviceId || '');
    await fetchSessionHistory(storedDeviceId || undefined);
  };

  const fetchSessionHistory = async (currentDeviceId?: string) => {
    try {
      setLoading(true);
      
      // Attempt to fetch from API first
      try {
        const response = await sessionHistoryApi.getSessionHistory({
          deviceId: currentDeviceId,
          filter,
          sortBy,
          limit: 50
        });
        
        if (response.success) {
          setSessions(response.data.sessions);
          setLoading(false);
          return;
        }
      } catch (apiError) {
        console.warn('API unavailable, using mock data:', apiError);
      }
      
      // Fallback to mock data if API is unavailable
      const mockSessions: SessionHistory[] = [
        {
          id: '1',
          name: 'Sunday Morning Session',
          date: '2025-08-20T10:00:00.000Z',
          location: 'Shouti Sports Center',
          duration: '3h 15min',
          playerCount: 8,
          totalGames: 12,
          organizer: 'Alice Chen',
          status: 'COMPLETED',
          shareCode: 'ABC123',
          players: [
            { id: '1', name: 'Alice Chen', gamesPlayed: 5, wins: 3, losses: 2, winRate: 60 },
            { id: '2', name: 'Bob Zhang', gamesPlayed: 4, wins: 2, losses: 2, winRate: 50 },
            { id: '3', name: 'Charlie Wang', gamesPlayed: 6, wins: 4, losses: 2, winRate: 67 },
            { id: '4', name: 'Diana Liu', gamesPlayed: 3, wins: 2, losses: 1, winRate: 67 },
            { id: '5', name: 'Eve Johnson', gamesPlayed: 4, wins: 1, losses: 3, winRate: 25 },
            { id: '6', name: 'Frank Smith', gamesPlayed: 5, wins: 5, losses: 0, winRate: 100 },
            { id: '7', name: 'Grace Kim', gamesPlayed: 3, wins: 1, losses: 2, winRate: 33 },
            { id: '8', name: 'Henry Lee', gamesPlayed: 2, wins: 0, losses: 2, winRate: 0 },
          ],
          games: [
            {
              id: 'g1',
              team1Players: ['Alice Chen', 'Bob Zhang'],
              team2Players: ['Charlie Wang', 'Diana Liu'],
              team1Score: 21,
              team2Score: 19,
              sets: [{ setNumber: 1, team1Score: 21, team2Score: 19, winnerTeam: 1 }],
              winnerTeam: 1,
              duration: '25 min',
              court: 'Court 1',
              startTime: '2025-08-20T10:15:00.000Z',
              endTime: '2025-08-20T10:40:00.000Z'
            },
            {
              id: 'g2',
              team1Players: ['Frank Smith', 'Grace Kim'],
              team2Players: ['Eve Johnson', 'Henry Lee'],
              team1Score: 21,
              team2Score: 12,
              sets: [{ setNumber: 1, team1Score: 21, team2Score: 12, winnerTeam: 1 }],
              winnerTeam: 1,
              duration: '18 min',
              court: 'Court 2',
              startTime: '2025-08-20T10:20:00.000Z',
              endTime: '2025-08-20T10:38:00.000Z'
            },
            // Add more mock games...
          ]
        },
        {
          id: '2',
          name: 'Wednesday Evening Practice',
          date: '2025-08-17T19:00:00.000Z',
          location: 'Community Center',
          duration: '2h 30min',
          playerCount: 6,
          totalGames: 8,
          organizer: 'Bob Zhang',
          status: 'COMPLETED',
          shareCode: 'DEF456',
          players: [
            { id: '1', name: 'Alice Chen', gamesPlayed: 3, wins: 2, losses: 1, winRate: 67 },
            { id: '2', name: 'Bob Zhang', gamesPlayed: 4, wins: 3, losses: 1, winRate: 75 },
            { id: '3', name: 'Charlie Wang', gamesPlayed: 3, wins: 1, losses: 2, winRate: 33 },
            { id: '9', name: 'Ivy Chen', gamesPlayed: 2, wins: 1, losses: 1, winRate: 50 },
            { id: '10', name: 'Jack Wu', gamesPlayed: 4, wins: 2, losses: 2, winRate: 50 },
            { id: '11', name: 'Kelly Zhang', gamesPlayed: 2, wins: 1, losses: 1, winRate: 50 },
          ],
          games: [
            {
              id: 'g3',
              team1Players: ['Alice Chen', 'Bob Zhang'],
              team2Players: ['Charlie Wang', 'Ivy Chen'],
              team1Score: 21,
              team2Score: 18,
              sets: [{ setNumber: 1, team1Score: 21, team2Score: 18, winnerTeam: 1 }],
              winnerTeam: 1,
              duration: '22 min',
              court: 'Court 1',
              startTime: '2025-08-17T19:15:00.000Z',
              endTime: '2025-08-17T19:37:00.000Z'
            },
            // Add more mock games...
          ]
        },
        {
          id: '3',
          name: 'Friday Tournament',
          date: '2025-08-15T18:00:00.000Z',
          location: 'Sports Complex',
          duration: '4h 45min',
          playerCount: 12,
          totalGames: 18,
          organizer: 'Tournament Admin',
          status: 'COMPLETED',
          shareCode: 'GHI789',
          players: [], // Simplified for demo
          games: []
        }
      ];

      setSessions(mockSessions);
    } catch (error) {
      console.error('Error fetching session history:', error);
      Alert.alert('Error', 'Failed to load session history');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSessionHistory(deviceId);
    setRefreshing(false);
  };
  
  // Update data when filter or sort changes
  useEffect(() => {
    if (!loading && deviceId) {
      fetchSessionHistory(deviceId);
    }
  }, [filter, sortBy, deviceId]);

  const getFilteredAndSortedSessions = () => {
    let filteredSessions = sessions;

    // Apply filter
    if (filter === 'organized') {
      filteredSessions = sessions.filter(session => 
        session.organizer.includes('You') || session.organizer === 'Alice Chen' // Mock current user
      );
    } else if (filter === 'participated') {
      filteredSessions = sessions.filter(session => 
        session.players.some(player => player.name === 'You' || player.name === 'Alice Chen') // Mock current user
      );
    }

    // Apply sorting
    filteredSessions.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'games':
          return b.totalGames - a.totalGames;
        case 'duration':
          // Simple duration comparison (assumes format like "3h 15min")
          const getDurationMinutes = (dur: string) => {
            const hours = dur.match(/(\d+)h/)?.[1] || '0';
            const minutes = dur.match(/(\d+)min/)?.[1] || '0';
            return parseInt(hours) * 60 + parseInt(minutes);
          };
          return getDurationMinutes(b.duration) - getDurationMinutes(a.duration);
        default:
          return 0;
      }
    });

    return filteredSessions;
  };

  const getSessionStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return '#4CAF50';
      case 'CANCELLED': return '#f44336';
      case 'IN_PROGRESS': return '#FF9800';
      default: return '#9E9E9E';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculatePersonalStats = (session: SessionHistory) => {
    // Mock calculation for current user
    const currentUserName = 'Alice Chen'; // Mock current user
    const userPlayer = session.players.find(p => p.name === currentUserName);
    
    if (!userPlayer) {
      return { gamesPlayed: 0, wins: 0, losses: 0, winRate: 0 };
    }

    return {
      gamesPlayed: userPlayer.gamesPlayed,
      wins: userPlayer.wins,
      losses: userPlayer.losses,
      winRate: userPlayer.winRate
    };
  };

  const renderSessionCard = (session: SessionHistory) => {
    const personalStats = calculatePersonalStats(session);
    
    return (
      <TouchableOpacity
        key={session.id}
        style={styles.sessionCard}
        onPress={async () => {
          try {
            // Try to fetch detailed session data from API
            const detailResponse = await sessionHistoryApi.getSessionDetails(session.id);
            if (detailResponse.success) {
              setSelectedSession(detailResponse.data.session);
            } else {
              setSelectedSession(session);
            }
          } catch (error) {
            console.warn('Could not fetch detailed data, using cached:', error);
            setSelectedSession(session);
          }
          setShowSessionDetail(true);
        }}
      >
        <View style={styles.sessionHeader}>
          <View style={styles.sessionTitleContainer}>
            <Text style={styles.sessionName}>{session.name}</Text>
            <View style={[
              styles.statusBadge, 
              { backgroundColor: getSessionStatusColor(session.status) }
            ]}>
              <Text style={styles.statusText}>{session.status}</Text>
            </View>
          </View>
          <Text style={styles.sessionDate}>{formatDate(session.date)}</Text>
        </View>

        <View style={styles.sessionInfo}>
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons name="location-outline" size={16} color="#666" />
              <Text style={styles.infoText}>{session.location}</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="time-outline" size={16} color="#666" />
              <Text style={styles.infoText}>{session.duration}</Text>
            </View>
          </View>
          
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons name="people-outline" size={16} color="#666" />
              <Text style={styles.infoText}>{session.playerCount} players</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="tennisball-outline" size={16} color="#666" />
              <Text style={styles.infoText}>{session.totalGames} games</Text>
            </View>
          </View>
        </View>

        {personalStats.gamesPlayed > 0 && (
          <View style={styles.personalStats}>
            <Text style={styles.personalStatsTitle}>Your Performance:</Text>
            <View style={styles.statsRow}>
              <Text style={styles.statItem}>Games: {personalStats.gamesPlayed}</Text>
              <Text style={styles.statItem}>W: {personalStats.wins}</Text>
              <Text style={styles.statItem}>L: {personalStats.losses}</Text>
              <Text style={[styles.statItem, { color: personalStats.winRate >= 50 ? '#4CAF50' : '#f44336' }]}>
                {personalStats.winRate}%
              </Text>
            </View>
          </View>
        )}

        <View style={styles.sessionFooter}>
          <Text style={styles.organizer}>Organized by {session.organizer}</Text>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderSessionDetail = () => {
    if (!selectedSession) return null;

    return (
      <Modal visible={showSessionDetail} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{selectedSession.name}</Text>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowSessionDetail(false)}
            >
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Session Summary */}
            <View style={styles.summarySection}>
              <Text style={styles.sectionTitle}>Session Summary</Text>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryNumber}>{selectedSession.playerCount}</Text>
                  <Text style={styles.summaryLabel}>Players</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryNumber}>{selectedSession.totalGames}</Text>
                  <Text style={styles.summaryLabel}>Games</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryNumber}>{selectedSession.duration}</Text>
                  <Text style={styles.summaryLabel}>Duration</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryNumber}>{formatDate(selectedSession.date)}</Text>
                  <Text style={styles.summaryLabel}>Date</Text>
                </View>
              </View>
            </View>

            {/* Player Rankings */}
            {selectedSession.players.length > 0 && (
              <View style={styles.rankingsSection}>
                <Text style={styles.sectionTitle}>Player Rankings</Text>
                {selectedSession.players
                  .sort((a, b) => b.winRate - a.winRate)
                  .map((player, index) => (
                    <View key={player.id} style={styles.playerRankItem}>
                      <View style={styles.rankingLeft}>
                        <View style={[styles.rankBadge, index < 3 && styles.topRank]}>
                          <Text style={[styles.rankNumber, index < 3 && styles.topRankText]}>
                            {index + 1}
                          </Text>
                        </View>
                        <Text style={styles.playerName}>{player.name}</Text>
                      </View>
                      <View style={styles.rankingStats}>
                        <Text style={styles.rankingStat}>{player.gamesPlayed}G</Text>
                        <Text style={[styles.rankingStat, { color: '#4CAF50' }]}>
                          {player.wins}W
                        </Text>
                        <Text style={[styles.rankingStat, { color: '#f44336' }]}>
                          {player.losses}L
                        </Text>
                        <Text style={[
                          styles.winRate, 
                          { color: player.winRate >= 50 ? '#4CAF50' : '#f44336' }
                        ]}>
                          {player.winRate}%
                        </Text>
                      </View>
                    </View>
                  ))}
              </View>
            )}

            {/* Game Results */}
            {selectedSession.games.length > 0 && (
              <View style={styles.gamesSection}>
                <Text style={styles.sectionTitle}>Game Results</Text>
                {selectedSession.games.map((game, index) => (
                  <View key={game.id} style={styles.gameResultCard}>
                    <View style={styles.gameHeader}>
                      <Text style={styles.gameTitle}>Game {index + 1} • {game.court}</Text>
                      <Text style={styles.gameDuration}>{game.duration}</Text>
                    </View>
                    
                    <View style={styles.gameTeams}>
                      <View style={[
                        styles.gameTeam, 
                        game.winnerTeam === 1 && styles.winnerTeam
                      ]}>
                        <Text style={styles.teamPlayers}>
                          {game.team1Players.join(' & ')}
                        </Text>
                        <Text style={[
                          styles.teamScore,
                          game.winnerTeam === 1 && styles.winnerScore
                        ]}>
                          {game.team1Score}
                        </Text>
                      </View>
                      
                      <Text style={styles.vsText}>VS</Text>
                      
                      <View style={[
                        styles.gameTeam, 
                        game.winnerTeam === 2 && styles.winnerTeam
                      ]}>
                        <Text style={styles.teamPlayers}>
                          {game.team2Players.join(' & ')}
                        </Text>
                        <Text style={[
                          styles.teamScore,
                          game.winnerTeam === 2 && styles.winnerScore
                        ]}>
                          {game.team2Score}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.gameTime}>
                      {new Date(game.startTime).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })} - {new Date(game.endTime).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading session history...</Text>
      </View>
    );
  }

  const filteredSessions = getFilteredAndSortedSessions();

  return (
    <View style={styles.container}>
      {/* Header with filters */}
      <View style={styles.header}>
        <Text style={styles.title}>Session History</Text>
        
        {/* Filter buttons */}
        <View style={styles.filterContainer}>
          <TouchableOpacity 
            style={[styles.filterButton, filter === 'all' && styles.activeFilter]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.activeFilterText]}>
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterButton, filter === 'organized' && styles.activeFilter]}
            onPress={() => setFilter('organized')}
          >
            <Text style={[styles.filterText, filter === 'organized' && styles.activeFilterText]}>
              Organized
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterButton, filter === 'participated' && styles.activeFilter]}
            onPress={() => setFilter('participated')}
          >
            <Text style={[styles.filterText, filter === 'participated' && styles.activeFilterText]}>
              Played
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sort button */}
        <TouchableOpacity style={styles.sortButton}>
          <Ionicons name="filter" size={16} color="#007AFF" />
          <Text style={styles.sortText}>Sort by {sortBy}</Text>
        </TouchableOpacity>
      </View>

      {/* Sessions List */}
      <ScrollView 
        style={styles.sessionsList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {filteredSessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>No Sessions Yet</Text>
            <Text style={styles.emptyText}>
              Your completed sessions will appear here after you participate in badminton games.
            </Text>
          </View>
        ) : (
          filteredSessions.map(session => renderSessionCard(session))
        )}
      </ScrollView>

      {renderSessionDetail()}
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
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  activeFilter: {
    backgroundColor: '#007AFF',
  },
  filterText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  activeFilterText: {
    color: '#fff',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  sortText: {
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 4,
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
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  sessionCard: {
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
  sessionHeader: {
    marginBottom: 16,
  },
  sessionTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  sessionName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  sessionDate: {
    fontSize: 14,
    color: '#666',
  },
  sessionInfo: {
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
  },
  personalStats: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  personalStatsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  sessionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  organizer: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
  },
  summarySection: {
    backgroundColor: '#fff',
    margin: 20,
    marginBottom: 0,
    padding: 20,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  summaryItem: {
    width: '48%',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  rankingsSection: {
    backgroundColor: '#fff',
    margin: 20,
    marginBottom: 0,
    padding: 20,
    borderRadius: 12,
  },
  playerRankItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rankingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  topRank: {
    backgroundColor: '#FFD700',
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
  },
  topRankText: {
    color: '#fff',
  },
  playerName: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  rankingStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankingStat: {
    fontSize: 14,
    color: '#666',
    marginHorizontal: 6,
    minWidth: 25,
    textAlign: 'center',
  },
  winRate: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 12,
    minWidth: 40,
    textAlign: 'right',
  },
  gamesSection: {
    backgroundColor: '#fff',
    margin: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 12,
  },
  gameResultCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gameTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  gameDuration: {
    fontSize: 14,
    color: '#666',
  },
  gameTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  gameTeam: {
    flex: 1,
    alignItems: 'center',
  },
  winnerTeam: {
    backgroundColor: '#e8f5e8',
    borderRadius: 6,
    paddingVertical: 8,
  },
  teamPlayers: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  teamScore: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#666',
  },
  winnerScore: {
    color: '#4CAF50',
  },
  vsText: {
    fontSize: 12,
    color: '#999',
    marginHorizontal: 16,
  },
  gameTime: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});