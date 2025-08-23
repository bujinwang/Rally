import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';

interface Player {
  id: string;
  name: string;
  gamesPlayed: number;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
}

const mockPlayers: Player[] = [
  { id: '1', name: '张三', gamesPlayed: 5, status: 'ACTIVE' },
  { id: '2', name: '李四', gamesPlayed: 4, status: 'ACTIVE' },
  { id: '3', name: '王五', gamesPlayed: 3, status: 'RESTING' },
  { id: '4', name: '赵六', gamesPlayed: 3, status: 'ACTIVE' },
  { id: '5', name: '孙七', gamesPlayed: 2, status: 'ACTIVE' },
  { id: '6', name: '周八', gamesPlayed: 2, status: 'ACTIVE' },
];

const PlayerItem = ({ player, index }: { player: Player; index: number }) => (
  <View style={[
    styles.playerItem,
    player.status === 'RESTING' && styles.restingPlayer,
    index < 2 && styles.nextToRotate // Highlight next players to rotate
  ]}>
    <View style={styles.playerInfo}>
      <Text style={styles.playerName}>{player.name}</Text>
      <Text style={styles.gamesCount}>{player.gamesPlayed} 局</Text>
    </View>
    <View style={styles.playerActions}>
      {player.status === 'ACTIVE' && (
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>歇一下</Text>
        </TouchableOpacity>
      )}
      {player.status === 'RESTING' && (
        <Text style={styles.restingText}>休息中</Text>
      )}
    </View>
  </View>
);

const RotationScreen = () => {
  const nextToRotate = mockPlayers.filter(p => p.status === 'ACTIVE').slice(0, 2);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>轮换队列</Text>
        <TouchableOpacity style={styles.triggerButton}>
          <Text style={styles.triggerButtonText}>触发轮换</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.fairnessContainer}>
        <Text style={styles.fairnessTitle}>公平性指标</Text>
        <Text style={styles.fairnessValue}>优秀 (差2局)</Text>
        <Text style={styles.fairnessDescription}>
          下次轮换将替换打得最多的2名球员
        </Text>
      </View>

      <View style={styles.queueContainer}>
        <Text style={styles.queueTitle}>轮换队列</Text>
        <FlatList
          data={mockPlayers}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <PlayerItem player={item} index={index} />
          )}
          contentContainerStyle={styles.queueList}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {nextToRotate.length > 0 && (
        <View style={styles.nextRotationContainer}>
          <Text style={styles.nextRotationTitle}>下次轮换</Text>
          <Text style={styles.nextRotationPlayers}>
            {nextToRotate.map(p => p.name).join(', ')}
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
  triggerButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  triggerButtonText: {
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
    color: '#28a745',
    marginBottom: 4,
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
  nextToRotate: {
    borderColor: '#ffc107',
    borderWidth: 2,
    backgroundColor: '#fff3cd',
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
});

export default RotationScreen;