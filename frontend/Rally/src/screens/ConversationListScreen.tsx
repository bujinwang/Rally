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
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { messagingApi, MessageThread } from '../services/messagingApi';
import { ConversationCard } from '../components/ConversationCard';
import { useTranslation } from '../i18n/LanguageContext';

export default function ConversationListScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [filteredThreads, setFilteredThreads] = useState<MessageThread[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load threads on mount and when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadThreads();
    }, [])
  );

  // Filter threads when search query changes
  useEffect(() => {
    filterThreads();
  }, [searchQuery, threads]);

  const loadThreads = async () => {
    try {
      const data = await messagingApi.getUserThreads();
      setThreads(data);
    } catch (error: any) {
      console.error('Error loading threads:', error);
      // Only show alert on initial load failure
      if (threads.length === 0) {
        Alert.alert(t.common.error, 'Failed to load conversations');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadThreads();
  }, []);

  const filterThreads = () => {
    if (!searchQuery.trim()) {
      setFilteredThreads(threads);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = threads.filter(thread => {
      const title = (thread.title || thread.participants?.join(', ') || '').toLowerCase();
      return title.includes(query);
    });
    setFilteredThreads(filtered);
  };

  const navigateToChat = (threadId: string) => {
    navigation.navigate('Chat', { threadId });
  };

  const handleLongPress = (threadId: string) => {
    Alert.alert(
      'Conversation Options',
      'What would you like to do?',
      [
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: () => confirmDeleteThread(threadId),
        },
        { text: t.common.cancel, style: 'cancel' },
      ]
    );
  };

  const confirmDeleteThread = (threadId: string) => {
    Alert.alert(
      t.common.delete + ' Conversation',
      'Are you sure you want to delete this conversation?',
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            try {
              await messagingApi.leaveThread(threadId);
              setThreads(prev => prev.filter(t => t.id !== threadId));
            } catch (error: any) {
              Alert.alert(t.common.error, error.message || 'Failed to delete conversation');
            }
          },
        },
      ]
    );
  };

  const navigateToNewChat = () => {
    Alert.alert(
      t.messages.newMessage,
      'Start a conversation with a friend from your friends list.',
      [
        {
          text: 'Select Friend',
          onPress: () => {
            // Navigate to friends list to pick a friend for messaging
            navigation.navigate('ProfileTab', {
              screen: 'FriendsList',
            });
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
      <Text style={styles.emptyTitle}>
        {searchQuery ? t.common.noResults : t.messages.noMessages}
      </Text>
      <Text style={styles.emptySubtext}>
        {searchQuery
          ? 'Try a different search term'
          : 'Start a conversation with your badminton friends!'}
      </Text>
      {!searchQuery && (
        <TouchableOpacity style={styles.newChatButton} onPress={navigateToNewChat}>
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text style={styles.newChatButtonText}>{t.messages.newMessage}</Text>
        </TouchableOpacity>
      )}
    </View>
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
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t.messages.search}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            placeholderTextColor="#999"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#999" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.composeButton} onPress={navigateToNewChat}>
          <Ionicons name="create-outline" size={22} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Thread list */}
      <FlatList
        data={filteredThreads}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ConversationCard
            thread={item}
            onPress={navigateToChat}
            onLongPress={handleLongPress}
          />
        )}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={
          filteredThreads.length === 0 ? styles.emptyListContent : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    padding: 0,
  },
  composeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyListContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666',
    marginTop: 15,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  newChatButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
