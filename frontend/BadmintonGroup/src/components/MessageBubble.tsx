import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Message } from '../services/messagingApi';

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  showTimestamp?: boolean;
}

/**
 * Format a date string as a readable time (e.g. "2:30 PM")
 */
const formatMessageTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwnMessage,
  showTimestamp = true,
}) => {
  const isSystemMessage = message.messageType === 'SYSTEM';

  // System messages are centered differently
  if (isSystemMessage) {
    return (
      <View style={styles.systemContainer}>
        <View style={styles.systemBubble}>
          <Text style={styles.systemText}>{message.content}</Text>
        </View>
        {showTimestamp && (
          <Text style={styles.systemTime}>{formatMessageTime(message.sentAt)}</Text>
        )}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        isOwnMessage ? styles.containerOwn : styles.containerOther,
      ]}
    >
      {/* Sender name for received messages */}
      {!isOwnMessage && message.sender && (
        <Text style={styles.senderName} numberOfLines={1}>
          {message.sender.name}
        </Text>
      )}

      {/* Message bubble */}
      <View
        style={[
          styles.bubble,
          isOwnMessage ? styles.bubbleOwn : styles.bubbleOther,
        ]}
      >
        <Text
          style={[
            styles.messageText,
            isOwnMessage ? styles.messageTextOwn : styles.messageTextOther,
          ]}
        >
          {message.content}
        </Text>
      </View>

      {/* Footer: timestamp + read status */}
      {showTimestamp && (
        <View
          style={[
            styles.footer,
            isOwnMessage ? styles.footerOwn : styles.footerOther,
          ]}
        >
          <Text style={styles.timestamp}>
            {formatMessageTime(message.sentAt)}
          </Text>
          {isOwnMessage && (
            <Text style={styles.readStatus}>
              {message.isRead ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  /* Layout containers */
  container: {
    marginVertical: 3,
    marginHorizontal: 12,
    maxWidth: '80%',
  },
  containerOwn: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  containerOther: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },

  /* Sender name */
  senderName: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
    marginBottom: 2,
    marginLeft: 4,
  },

  /* Bubble */
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleOwn: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#E8E8E8',
    borderBottomLeftRadius: 4,
  },

  /* Message text */
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  messageTextOwn: {
    color: '#fff',
  },
  messageTextOther: {
    color: '#212121',
  },

  /* Footer */
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    paddingHorizontal: 4,
    gap: 4,
  },
  footerOwn: {
    justifyContent: 'flex-end',
  },
  footerOther: {
    justifyContent: 'flex-start',
  },
  timestamp: {
    fontSize: 11,
    color: '#999',
  },
  readStatus: {
    fontSize: 11,
    color: '#34C759',
  },

  /* System messages */
  systemContainer: {
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 20,
  },
  systemBubble: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  systemText: {
    fontSize: 13,
    color: '#888',
    fontStyle: 'italic',
  },
  systemTime: {
    fontSize: 10,
    color: '#bbb',
    marginTop: 2,
  },
});

export default MessageBubble;
