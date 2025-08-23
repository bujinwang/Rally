import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';

interface Session {
  id: string;
  name: string;
  scheduledAt: string;
  location?: string;
  maxPlayers: number;
  playerCount: number;
  isOwner: boolean;
}

const mockSessions: Session[] = [
  {
    id: '1',
    name: '北京羽毛球会 - 8/25 14:00',
    scheduledAt: '2025-08-25T14:00:00Z',
    location: '北京朝阳区羽毛球馆',
    maxPlayers: 20,
    playerCount: 12,
    isOwner: true,
  },
  {
    id: '2',
    name: '上海羽毛球友谊赛 - 8/26 10:00',
    scheduledAt: '2025-08-26T10:00:00Z',
    location: '上海浦东新区羽毛球中心',
    maxPlayers: 16,
    playerCount: 8,
    isOwner: false,
  },
];

const SessionItem = ({ session }: { session: Session }) => (
  <TouchableOpacity style={styles.sessionItem}>
    <View style={styles.sessionHeader}>
      <Text style={styles.sessionName}>{session.name}</Text>
      {session.isOwner && <Text style={styles.ownerBadge}>局长</Text>}
    </View>
    <Text style={styles.sessionLocation}>{session.location}</Text>
    <View style={styles.sessionFooter}>
      <Text style={styles.playerCount}>
        {session.playerCount}/{session.maxPlayers} 人
      </Text>
      <Text style={styles.sessionTime}>
        {new Date(session.scheduledAt).toLocaleDateString('zh-CN')}
      </Text>
    </View>
  </TouchableOpacity>
);

const SessionListScreen = () => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>羽毛球局</Text>
        <TouchableOpacity style={styles.addButton}>
          <Text style={styles.addButtonText}>+ 新建</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={mockSessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SessionItem session={item} />}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
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
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  sessionItem: {
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
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sessionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  ownerBadge: {
    fontSize: 12,
    color: '#007AFF',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sessionLocation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  sessionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playerCount: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  sessionTime: {
    fontSize: 14,
    color: '#999',
  },
});

export default SessionListScreen;