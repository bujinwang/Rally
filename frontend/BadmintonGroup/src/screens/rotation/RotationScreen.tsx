import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';

interface Player {
  id: string;
  name: string;
  gamesPlayed: number;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
  // Fair Play enhancements
  priority?: number;
  queueRank?: number;
  restStatus?: string;
  restGamesRemaining?: number;
  restPreference?: number;
}

const mockPlayers: Player[] = [
  { 
    id: '1', name: 'Alice', gamesPlayed: 5, status: 'ACTIVE',
    priority: 15, queueRank: 6, restStatus: 'Ready to play', restGamesRemaining: 0 
  },
  { 
    id: '2', name: 'Bob', gamesPlayed: 4, status: 'ACTIVE',
    priority: 25, queueRank: 4, restStatus: 'Ready (waited 2 games)', restGamesRemaining: 0
  },
  { 
    id: '3', name: 'Charlie', gamesPlayed: 3, status: 'ACTIVE',
    priority: -50, queueRank: 8, restStatus: 'Resting 1 more game', restGamesRemaining: 1
  },
  { 
    id: '4', name: 'Diana', gamesPlayed: 3, status: 'ACTIVE',
    priority: 35, queueRank: 2, restStatus: 'Ready to play', restGamesRemaining: 0
  },
  { 
    id: '5', name: 'Eve', gamesPlayed: 2, status: 'ACTIVE',
    priority: 45, queueRank: 1, restStatus: 'Ready (waited 1 game)', restGamesRemaining: 0
  },
  { 
    id: '6', name: 'Frank', gamesPlayed: 2, status: 'ACTIVE',
    priority: 40, queueRank: 3, restStatus: 'Ready to play', restGamesRemaining: 0
  },
  { 
    id: '7', name: 'Grace', gamesPlayed: 4, status: 'ACTIVE',
    priority: 20, queueRank: 5, restStatus: 'Ready to play', restGamesRemaining: 0
  },
  { 
    id: '8', name: 'Henry', gamesPlayed: 1, status: 'ACTIVE',
    priority: 55, queueRank: 7, restStatus: 'Just played', restGamesRemaining: 1
  },
];

const PlayerItem = ({ 
  player, 
  index, 
  onSkipGame, 
  onMakeReady, 
  onAdjustRest 
}: { 
  player: Player; 
  index: number;
  onSkipGame: (playerId: string) => void;
  onMakeReady: (playerId: string) => void;
  onAdjustRest: (playerId: string) => void;
}) => (
  <View style={[
    styles.playerItem,
    player.restGamesRemaining && player.restGamesRemaining > 0 && styles.restingPlayer,
    player.queueRank && player.queueRank <= 4 && styles.nextToPlay // Highlight top 4 in queue
  ]}>
    <View style={styles.playerInfo}>
      <View style={styles.playerHeader}>
        <Text style={styles.playerName}>{player.name}</Text>
        <Text style={styles.queueRank}>#{player.queueRank}</Text>
      </View>
      
      <View style={styles.playerStats}>
        <Text style={styles.gamesCount}>🏸 {player.gamesPlayed} games</Text>
        <Text style={styles.priorityScore}>Priority: {player.priority}</Text>
      </View>
      
      <Text style={[
        styles.restStatus,
        player.restGamesRemaining && player.restGamesRemaining > 0 && styles.restingStatus
      ]}>
        {player.restStatus}
      </Text>
    </View>
    
    <View style={styles.playerActions}>
      {player.restGamesRemaining && player.restGamesRemaining > 0 ? (
        <>
          <TouchableOpacity 
            style={styles.readyButton}
            onPress={() => onMakeReady(player.id)}
          >
            <Text style={styles.readyButtonText}>Ready Now</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TouchableOpacity 
            style={styles.skipButton}
            onPress={() => onSkipGame(player.id)}
          >
            <Text style={styles.skipButtonText}>Skip Game</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.restButton}
            onPress={() => onAdjustRest(player.id)}
          >
            <Text style={styles.restButtonText}>⚙️</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  </View>
);

const RotationScreen = () => {
  const [players, setPlayers] = useState<Player[]>(mockPlayers);
  
  // Sort players by queue rank for display
  const sortedPlayers = [...players].sort((a, b) => (a.queueRank || 0) - (b.queueRank || 0));
  const nextFour = sortedPlayers.filter(p => (p.queueRank || 0) <= 4 && (p.restGamesRemaining || 0) === 0);

  const handleSkipGame = (playerId: string) => {
    setPlayers(prevPlayers =>
      prevPlayers.map(p =>
        p.id === playerId
          ? { ...p, restGamesRemaining: (p.restGamesRemaining || 0) + 1, restStatus: `Resting ${(p.restGamesRemaining || 0) + 1} more game${(p.restGamesRemaining || 0) + 1 === 1 ? '' : 's'}` }
          : p
      )
    );
    Alert.alert('Game Skipped', `${players.find(p => p.id === playerId)?.name} will rest for one more game.`);
  };

  const handleMakeReady = (playerId: string) => {
    setPlayers(prevPlayers =>
      prevPlayers.map(p =>
        p.id === playerId
          ? { ...p, restGamesRemaining: 0, restStatus: 'Ready to play' }
          : p
      )
    );
    Alert.alert('Player Ready', `${players.find(p => p.id === playerId)?.name} is now ready to play!`);
  };

  const handleAdjustRest = (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    Alert.alert(
      'Adjust Rest Preference',
      `Current: ${player?.restPreference || 1} game(s) between play`,
      [
        { text: '1 Game Rest', onPress: () => updateRestPreference(playerId, 1) },
        { text: '2 Games Rest', onPress: () => updateRestPreference(playerId, 2) },
        { text: '3 Games Rest', onPress: () => updateRestPreference(playerId, 3) },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const updateRestPreference = (playerId: string, restGames: number) => {
    setPlayers(prevPlayers =>
      prevPlayers.map(p =>
        p.id === playerId ? { ...p, restPreference: restGames } : p
      )
    );
    Alert.alert('Rest Preference Updated', `Will rest ${restGames} game(s) between play sessions.`);
  };

  const handleAutoGenerate = () => {
    Alert.alert(
      'Generate Next Games', 
      `Top 4 players will be selected:\n${nextFour.map(p => `${p.name} (${p.gamesPlayed} games)`).join('\n')}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Generate Games', onPress: () => Alert.alert('Games Generated!', 'New matches created based on Fair Play algorithm.') }
      ]
    );
  };

  const gameVariance = Math.max(...players.map(p => p.gamesPlayed)) - Math.min(...players.map(p => p.gamesPlayed));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Fair Play Queue</Text>
        <TouchableOpacity style={styles.generateButton} onPress={handleAutoGenerate}>
          <Text style={styles.generateButtonText}>🎯 Auto Generate</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.fairnessContainer}>
        <Text style={styles.fairnessTitle}>📊 Fairness Status</Text>
        <Text style={[
          styles.fairnessValue,
          gameVariance <= 1 && styles.fairnessExcellent,
          gameVariance === 2 && styles.fairnessGood,
          gameVariance >= 3 && styles.fairnessNeedsWork
        ]}>
          {gameVariance <= 1 ? 'Excellent' : gameVariance === 2 ? 'Good' : 'Needs Balance'} ({gameVariance} game variance)
        </Text>
        <Text style={styles.fairnessDescription}>
          Next games prioritize: {nextFour.slice(0, 2).map(p => p.name).join(' & ')}
        </Text>
      </View>

      <View style={styles.queueContainer}>
        <Text style={styles.queueTitle}>🏸 Player Queue (by priority)</Text>
        <FlatList
          data={sortedPlayers}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <PlayerItem 
              player={item} 
              index={index}
              onSkipGame={handleSkipGame}
              onMakeReady={handleMakeReady}
              onAdjustRest={handleAdjustRest}
            />
          )}
          contentContainerStyle={styles.queueList}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {nextFour.length > 0 && (
        <View style={styles.nextRotationContainer}>
          <Text style={styles.nextRotationTitle}>🎯 Next 4 Players</Text>
          <Text style={styles.nextRotationPlayers}>
            {nextFour.slice(0, 4).map(p => `${p.name} (${p.gamesPlayed})`).join(' • ')}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  generateButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  generateButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  fairnessContainer: {
    backgroundColor: '#ffffff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  fairnessTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  fairnessValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  fairnessExcellent: {
    color: '#28a745',
  },
  fairnessGood: {
    color: '#ffc107',
  },
  fairnessNeedsWork: {
    color: '#dc3545',
  },
  fairnessDescription: {
    fontSize: 14,
    color: '#666',
  },
  queueContainer: {
    flex: 1,
    padding: 16,
  },
  queueTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  queueList: {
    paddingBottom: 16,
  },
  playerItem: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  nextToPlay: {
    borderColor: '#28a745',
    borderWidth: 2,
    backgroundColor: '#d4edda',
  },
  restingPlayer: {
    backgroundColor: '#f8f9fa',
    opacity: 0.7,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  gamesCount: {
    fontSize: 14,
    color: '#666',
  },
  playerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  restingText: {
    fontSize: 12,
    color: '#6c757d',
    fontStyle: 'italic',
  },
  nextRotationContainer: {
    backgroundColor: '#ffffff',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  nextRotationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  nextRotationPlayers: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },

  // New Fair Play styles
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  queueRank: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007AFF',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  playerStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  priorityScore: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  restStatus: {
    fontSize: 12,
    color: '#28a745',
    fontStyle: 'italic',
  },
  restingStatus: {
    color: '#dc3545',
    fontWeight: '600',
  },
  skipButton: {
    backgroundColor: '#ffc107',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 4,
  },
  skipButtonText: {
    color: '#856404',
    fontSize: 10,
    fontWeight: '600',
  },
  readyButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  readyButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  restButton: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
  },
  restButtonText: {
    color: '#ffffff',
    fontSize: 10,
  },
});

export default RotationScreen;