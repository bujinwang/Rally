// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { friendsApi, Friend } from '../services/friendsApi';
import { FriendCard } from '../components/FriendCard';
import { useTranslation } from '../i18n/LanguageContext';

export default function FriendsListScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [filteredFriends, setFilteredFriends] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadFriends();
  }, []);

  useEffect(() => {
    filterFriends();
  }, [searchQuery, friends]);

  const loadFriends = async () => {
    try {
      setLoading(true);
      const data = await friendsApi.getFriends();
      setFriends(data);
    } catch (error: any) {
      console.error('Error loading friends:', error);
      Alert.alert(t.common.error, 'Failed to load friends list');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFriends();
    setRefreshing(false);
  }, []);

  const filterFriends = () => {
    if (!searchQuery.trim()) {
      setFilteredFriends(friends);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = friends.filter(friend =>
      friend.friend.name.toLowerCase().includes(query)
    );
    setFilteredFriends(filtered);
  };

  const handleRemoveFriend = async (friendshipId: string) => {
    try {
      const friendToRemove = friends.find(f => f.id === friendshipId);
      await friendsApi.removeFriend(friendToRemove?.friend.id || friendshipId);
      
      // Remove from local state
      setFriends(prev => prev.filter(f => f.id !== friendshipId));
      
      Alert.alert('Success', 'Friend removed successfully');
    } catch (error: any) {
      console.error('Error removing friend:', error);
      Alert.alert('Error', error.message || 'Failed to remove friend');
    }
  };

  const handleBlockUser = async (userId: string) => {
    try {
      await friendsApi.blockUser(userId);
      
      // Remove from friends list
      setFriends(prev => prev.filter(f => f.friend.id !== userId));
      
      Alert.alert('Success', 'User blocked successfully');
    } catch (error: any) {
      console.error('Error blocking user:', error);
      Alert.alert('Error', error.message || 'Failed to block user');
    }
  };

  const handleMessage = async (friendId: string) => {
    try {
      // Create a thread if one doesn't exist, then navigate
      const { messagingApi } = require('../services/messagingApi');
      const threads = await messagingApi.getUserThreads();
      const existingThread = threads.find((t: any) =>
        t.participants?.includes(friendId) && t.participants?.length === 2
      );

      let threadId: string;
      if (existingThread) {
        threadId = existingThread.id;
      } else {
        const thread = await messagingApi.createThread([friendId]);
        threadId = thread.id;
      }

      navigation.navigate('MessagesTab', {
        screen: 'Chat',
        params: { threadId }
      } as never);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to open chat');
    }
  };

  const navigateToAddFriend = () => {
    navigation.navigate('AddFriend' as never);
  };

  const navigateToRequests = () => {
    navigation.navigate('FriendRequests' as never);
  };

  const renderHeader = () => (
    <View style={styles.header}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t.friends.search}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity style={styles.actionButtonPrimary} onPress={navigateToAddFriend}>
          <Ionicons name="person-add" size={20} color="#fff" />
          <Text style={styles.actionButtonText}>{t.friends.add}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButtonSecondary} onPress={navigateToRequests}>
          <Ionicons name="mail" size={20} color="#007AFF" />
          <Text style={styles.actionButtonTextSecondary}>{t.friends.requests}</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <Text style={styles.statsText}>
          {filteredFriends.length} {filteredFriends.length === 1 ? 'friend' : 'friends'}
        </Text>
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="people-outline" size={64} color="#ccc" />
      <Text style={styles.emptyText}>
        {searchQuery ? t.common.noResults : t.friends.noFriends}
      </Text>
      <Text style={styles.emptySubtext}>
        {searchQuery
          ? 'Try a different search term'
          : 'Add friends to start connecting with other players!'}
      </Text>
      {!searchQuery && (
        <TouchableOpacity style={styles.addFriendButton} onPress={navigateToAddFriend}>
          <Text style={styles.addFriendButtonText}>{t.friends.add}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderFriend = ({ item }: { item: Friend }) => (
    <FriendCard
      friend={{
        ...item.friend,
        friendshipId: item.id
      }}
      onRemove={handleRemoveFriend}
      onBlock={handleBlockUser}
      onMessage={handleMessage}
      showActions={true}
    />
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>{t.common.loading}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredFriends}
        keyExtractor={item => item.id}
        renderItem={renderFriend}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={
          filteredFriends.length === 0 ? styles.emptyListContent : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5'
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666'
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 15,
    height: 44
  },
  searchIcon: {
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333'
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15
  },
  actionButtonPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600'
  },
  actionButtonSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6
  },
  actionButtonTextSecondary: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600'
  },
  statsContainer: {
    paddingVertical: 8
  },
  statsText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500'
  },
  emptyListContent: {
    flexGrow: 1
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666',
    marginTop: 15,
    marginBottom: 8
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20
  },
  addFriendButton: {
    marginTop: 20,
    paddingHorizontal: 30,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8
  },
  addFriendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  }
});
