import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { messagingApi, Message, MessageThread, ThreadDetails } from '../services/messagingApi';
import { useMessaging } from '../hooks/useMessaging';
import { MessageBubble } from '../components/MessageBubble';
import { MessageInput } from '../components/MessageInput';
import { TypingIndicator } from '../components/TypingIndicator';

const MESSAGES_PER_PAGE = 50;

export default function ChatScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const { threadId } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [threadDetails, setThreadDetails] = useState<ThreadDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  // Load current user ID
  useEffect(() => {
    const loadUserId = async () => {
      const id = await AsyncStorage.getItem('userId');
      if (id) setCurrentUserId(id);
    };
    loadUserId();
  }, []);

  // Real-time messaging via Socket.io
  const {
    isConnected,
    sendMessage: sendSocketMessage,
    startTyping,
    stopTyping,
    deleteMessage: deleteSocketMessage,
    markAsRead: markSocketRead,
    typingUsers,
  } = useMessaging({
    threadId,
    onNewMessage: (newMessage: Message) => {
      setMessages(prev => {
        // Deduplicate - don't add if already present
        if (prev.some(m => m.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
    },
    onMessageDeleted: (messageId: string) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    },
  });

  // Load thread details and initial messages
  useEffect(() => {
    loadThreadData();
  }, [threadId]);

  const loadThreadData = async () => {
    try {
      setLoading(true);
      const [details, messageList] = await Promise.all([
        messagingApi.getThreadDetails(threadId),
        messagingApi.getThreadMessages(threadId, MESSAGES_PER_PAGE, 0),
      ]);
      setThreadDetails(details);
      setMessages(messageList);
      setHasMore(messageList.length >= MESSAGES_PER_PAGE);
    } catch (error: any) {
      console.error('Error loading chat:', error);
      Alert.alert('Error', 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  };

  // Mark messages as read when entering
  useEffect(() => {
    const markRead = async () => {
      try {
        await messagingApi.markAsRead(threadId);
        markSocketRead();
      } catch (error) {
        // Non-critical, suppress error
      }
    };
    if (threadId) markRead();
  }, [threadId]);

  // Update navigation title
  useEffect(() => {
    if (threadDetails) {
      navigation.setOptions({
        title: threadDetails.title || 'Chat',
      });
    }
  }, [threadDetails, navigation]);

  /**
   * Load older messages (pagination)
   */
  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;

    try {
      setLoadingMore(true);
      const olderMessages = await messagingApi.getThreadMessages(
        threadId,
        MESSAGES_PER_PAGE,
        messages.length
      );
      if (olderMessages.length < MESSAGES_PER_PAGE) {
        setHasMore(false);
      }
      setMessages(prev => [...olderMessages, ...prev]);
    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  /**
   * Send a message via Socket.io (real-time) with REST fallback
   */
  const handleSendMessage = useCallback(
    async (text: string) => {
      try {
        // Try real-time first
        if (isConnected) {
          sendSocketMessage(text);
        } else {
          // Fallback to REST
          const sent = await messagingApi.sendMessage(threadId, text);
          setMessages(prev => [...prev, sent]);
        }
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to send message');
      }
    },
    [threadId, isConnected, sendSocketMessage]
  );

  /**
   * Render a single message with date separator logic
   */
  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isOwnMessage = item.senderId === currentUserId;

      // Show date separator if this is the first message or date changed
      const showDateSeparator =
        index === 0 ||
        new Date(item.sentAt).toDateString() !==
          new Date(messages[index - 1].sentAt).toDateString();

      return (
        <View>
          {showDateSeparator && (
            <View style={styles.dateSeparator}>
              <Text style={styles.dateSeparatorText}>
                {formatDateSeparator(item.sentAt)}
              </Text>
            </View>
          )}
          <MessageBubble message={item} isOwnMessage={isOwnMessage} />
        </View>
      );
    },
    [currentUserId, messages]
  );

  /**
   * Scroll to bottom helper
   */
  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading messages...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Connection status banner */}
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Connecting...</Text>
        </View>
      )}

      {/* Message list */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={scrollToBottom}
        onLayout={scrollToBottom}
        inverted={false}
        // Load more when reaching the top
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          loadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color="#007AFF" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Say hello!</Text>
          </View>
        }
      />

      {/* Typing indicator */}
      <TypingIndicator users={typingUsers} isVisible={typingUsers.length > 0} />

      {/* Message input */}
      <MessageInput
        onSend={handleSendMessage}
        onTypingStart={startTyping}
        onTypingStop={stopTyping}
        disabled={!isConnected && !threadId}
      />
    </KeyboardAvoidingView>
  );
}

/**
 * Format a date for the separator (e.g. "Today", "Yesterday", "Monday, Jan 5")
 */
const formatDateSeparator = (dateString: string): string => {
  const now = new Date();
  const date = new Date(dateString);

  // Reset time components for date comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - messageDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  offlineBanner: {
    backgroundColor: '#FFF3CD',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#FFE69C',
  },
  offlineText: {
    fontSize: 12,
    color: '#856404',
    fontWeight: '500',
  },
  messageList: {
    paddingVertical: 8,
    flexGrow: 1,
  },
  loadingMore: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 10,
  },
  dateSeparatorText: {
    fontSize: 12,
    color: '#999',
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 4,
  },
});
