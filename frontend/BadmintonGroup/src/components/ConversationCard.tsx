import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MessageThread } from '../services/messagingApi';

interface ConversationCardProps {
  thread: MessageThread;
  onPress: (threadId: string) => void;
  onLongPress?: (threadId: string) => void;
}

/**
 * Format a date string as a relative time (e.g. "2m ago", "3h ago", "yesterday")
 */
const formatRelativeTime = (dateString: string): string => {
  const now = Date.now();
  const date = new Date(dateString).getTime();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d`;
  
  const d = new Date(dateString);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * Get initials from a name or title string
 */
const getInitials = (text: string): string => {
  const words = text.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return text.substring(0, 2).toUpperCase();
};

/**
 * Generate a display title from thread participants
 */
const getDisplayTitle = (thread: MessageThread): string => {
  if (thread.title) return thread.title;
  // Use participants as comma-separated names
  const names = thread.participants || [];
  if (names.length === 0) return 'Chat';
  if (names.length === 1) return names[0];
  return names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '');
};

/**
 * Get a preview of the last message content, trimmed
 */
const getMessagePreview = (thread: MessageThread): string => {
  if (!thread.lastMessage) return 'No messages yet';
  const content = thread.lastMessage.content;
  return content.length > 50 ? content.substring(0, 50) + '…' : content;
};

export const ConversationCard: React.FC<ConversationCardProps> = ({
  thread,
  onPress,
  onLongPress,
}) => {
  const displayTitle = getDisplayTitle(thread);
  const initials = getInitials(displayTitle);
  const preview = getMessagePreview(thread);
  const relativeTime = formatRelativeTime(thread.lastMessageAt);

  // Calculate unread count from thread metadata (if available)
  const unreadCount = (thread as any).unreadCount || 0;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(thread.id)}
      onLongPress={() => onLongPress?.(thread.id)}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        {/* Online dot (shown if thread is active) */}
        {thread.isActive && (
          <View style={styles.onlineDot} />
        )}
      </View>

      {/* Content */}
      <View style={styles.contentContainer}>
        <View style={styles.topRow}>
          <Text style={styles.title} numberOfLines={1}>
            {displayTitle}
          </Text>
          <Text style={styles.timestamp}>{relativeTime}</Text>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.preview} numberOfLines={1}>
            {preview}
          </Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Chevron */}
      <Ionicons name="chevron-forward" size={16} color="#ccc" style={styles.chevron} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    backgroundColor: '#007AFF',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#fff',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
    marginRight: 8,
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  preview: {
    fontSize: 14,
    color: '#757575',
    flex: 1,
    marginRight: 8,
  },
  unreadBadge: {
    backgroundColor: '#007AFF',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  chevron: {
    marginLeft: 4,
  },
});

export default ConversationCard;
