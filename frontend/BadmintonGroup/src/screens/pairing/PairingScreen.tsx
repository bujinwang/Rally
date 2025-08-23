import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';

interface Player {
  id: string;
  name: string;
  gamesPlayed: number;
}

interface Court {
  id: string;
  name: string;
  players: Player[];
  maxPlayers: number;
}

const mockPlayers: Player[] = [
  { id: '1', name: '张三', gamesPlayed: 5 },
  { id: '2', name: '李四', gamesPlayed: 4 },
  { id: '3', name: '王五', gamesPlayed: 3 },
  { id: '4', name: '赵六', gamesPlayed: 3 },
  { id: '5', name: '孙七', gamesPlayed: 2 },
  { id: '6', name: '周八', gamesPlayed: 2 },
  { id: '7', name: '吴九', gamesPlayed: 1 },
  { id: '8', name: '郑十', gamesPlayed: 1 },
];

const initialCourts: Court[] = [
  { id: '1', name: 'A场', players: [], maxPlayers: 4 },
  { id: '2', name: 'B场', players: [], maxPlayers: 4 },
];

const CourtCard = ({
  court,
  onPlayerRemove
}: {
  court: Court;
  onPlayerRemove: (courtId: string, playerId: string) => void;
}) => (
  <View style={styles.courtCard}>
    <Text style={styles.courtName}>{court.name}</Text>
    <View style={styles.courtPlayers}>
      {court.players.map((player) => (
        <TouchableOpacity
          key={player.id}
          style={styles.playerChip}
          onPress={() => onPlayerRemove(court.id, player.id)}
        >
          <Text style={styles.playerChipText}>{player.name}</Text>
          <Text style={styles.removeText}>×</Text>
        </TouchableOpacity>
      ))}
      {Array.from({ length: court.maxPlayers - court.players.length }).map((_, index) => (
        <View key={`empty-${index}`} style={[styles.playerChip, styles.emptySlot]}>
          <Text style={styles.emptySlotText}>空位</Text>
        </View>
      ))}
    </View>
  </View>
);

const PlayerCard = ({
  player,
  onAddToCourt
}: {
  player: Player;
  onAddToCourt: (player: Player) => void;
}) => (
  <TouchableOpacity
    style={styles.playerCard}
    onPress={() => onAddToCourt(player)}
  >
    <Text style={styles.playerName}>{player.name}</Text>
    <Text style={styles.playerGames}>{player.gamesPlayed} 局</Text>
  </TouchableOpacity>
);

const PairingScreen = () => {
  const [courts, setCourts] = useState<Court[]>(initialCourts);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>(mockPlayers);

  const addPlayerToCourt = (player: Player) => {
    // Find the first court with available space
    const courtWithSpace = courts.find(court => court.players.length < court.maxPlayers);

    if (!courtWithSpace) {
      Alert.alert('提示', '所有场地都已满员');
      return;
    }

    // Add player to court
    setCourts(prevCourts =>
      prevCourts.map(court =>
        court.id === courtWithSpace.id
          ? { ...court, players: [...court.players, player] }
          : court
      )
    );

    // Remove player from available players
    setAvailablePlayers(prevPlayers =>
      prevPlayers.filter(p => p.id !== player.id)
    );
  };

  const removePlayerFromCourt = (courtId: string, playerId: string) => {
    const court = courts.find(c => c.id === courtId);
    if (!court) return;

    const playerToRemove = court.players.find(p => p.id === playerId);
    if (!playerToRemove) return;

    // Remove player from court
    setCourts(prevCourts =>
      prevCourts.map(court =>
        court.id === courtId
          ? { ...court, players: court.players.filter(p => p.id !== playerId) }
          : court
      )
    );

    // Add player back to available players
    setAvailablePlayers(prevPlayers => [...prevPlayers, playerToRemove]);
  };

  const autoPair = () => {
    // Simple auto-pairing logic: sort by games played and distribute evenly
    const sortedPlayers = [...availablePlayers].sort((a, b) => b.gamesPlayed - a.gamesPlayed);
    const newCourts: Court[] = courts.map(court => ({ ...court, players: [] as Player[] }));
    let courtIndex = 0;

    sortedPlayers.forEach(player => {
      while (newCourts[courtIndex].players.length >= newCourts[courtIndex].maxPlayers) {
        courtIndex = (courtIndex + 1) % newCourts.length;
      }

      newCourts[courtIndex].players.push(player);
      courtIndex = (courtIndex + 1) % newCourts.length;
    });

    setCourts(newCourts);
    setAvailablePlayers([]);
  };

  const resetPairing = () => {
    setCourts(initialCourts);
    setAvailablePlayers(mockPlayers);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>配对管理</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.autoButton} onPress={autoPair}>
            <Text style={styles.autoButtonText}>自动配对</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resetButton} onPress={resetPairing}>
            <Text style={styles.resetButtonText}>重置</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Courts Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>比赛场地</Text>
          {courts.map((court) => (
            <CourtCard
              key={court.id}
              court={court}
              onPlayerRemove={removePlayerFromCourt}
            />
          ))}
        </View>

        {/* Available Players Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>可用球员 ({availablePlayers.length})</Text>
          <View style={styles.playersGrid}>
            {availablePlayers.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                onAddToCourt={addPlayerToCourt}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  autoButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
  },
  autoButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  resetButton: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
  },
  resetButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  courtCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  courtName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  courtPlayers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  playerChip: {
    backgroundColor: '#007AFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playerChipText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  removeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptySlot: {
    backgroundColor: '#f0f0f0',
  },
  emptySlotText: {
    color: '#999',
    fontSize: 12,
  },
  playersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  playerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  playerGames: {
    fontSize: 12,
    color: '#666',
  },
});

export default PairingScreen;