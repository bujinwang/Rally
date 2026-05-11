import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';
import { Message } from '../services/messagingApi';

const SOCKET_URL = API_BASE_URL; // Update with your backend URL

interface UseMessagingOptions {
  threadId?: string;
  onNewMessage?: (message: Message) => void;
  onMessageDeleted?: (messageId: string) => void;
  onUserTyping?: (userId: string, userName: string) => void;
  onUserStoppedTyping?: (userId: string) => void;
  onMessagesRead?: (userId: string) => void;
}

interface UseMessagingReturn {
  isConnected: boolean;
  sendMessage: (content: string, messageType?: string) => void;
  startTyping: () => void;
  stopTyping: () => void;
  deleteMessage: (messageId: string) => void;
  markAsRead: () => void;
  typingUsers: string[];
}

export const useMessaging = (options: UseMessagingOptions = {}): UseMessagingReturn => {
  const {
    threadId,
    onNewMessage,
    onMessageDeleted,
    onUserTyping,
    onUserStoppedTyping,
    onMessagesRead
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const userIdRef = useRef<string | null>(null);
  const userNameRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize socket connection
  useEffect(() => {
    const initSocket = async () => {
      try {
        // Get user info from storage
        const userId = await AsyncStorage.getItem('userId');
        const userName = await AsyncStorage.getItem('userName');
        
        if (!userId) {
          console.warn('No userId found, skipping socket connection');
          return;
        }

        userIdRef.current = userId;
        userNameRef.current = userName || 'Unknown';

        // Create socket connection
        const socket = io(SOCKET_URL, {
          transports: ['websocket'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5
        });

        socketRef.current = socket;

        // Connection event handlers
        socket.on('connect', () => {
          console.log('✅ Socket connected');
          setIsConnected(true);
          
          // Identify user
          socket.emit('auth:identify', { userId });
          
          // Join thread if provided
          if (threadId) {
            socket.emit('messaging:join-thread', { threadId, userId });
          }
        });

        socket.on('disconnect', () => {
          console.log('❌ Socket disconnected');
          setIsConnected(false);
        });

        socket.on('connect_error', (error) => {
          console.error('Socket connection error:', error);
          setIsConnected(false);
        });

        // Messaging event handlers
        socket.on('messaging:new-message', (data: { message: Message }) => {
          console.log('📨 New message received:', data.message);
          if (onNewMessage) {
            onNewMessage(data.message);
          }
        });

        socket.on('messaging:message-deleted', (data: { messageId: string }) => {
          console.log('🗑️ Message deleted:', data.messageId);
          if (onMessageDeleted) {
            onMessageDeleted(data.messageId);
          }
        });

        socket.on('messaging:user-typing', (data: { userId: string; userName: string }) => {
          console.log('✍️ User typing:', data.userName);
          setTypingUsers(prev => {
            if (!prev.includes(data.userName)) {
              return [...prev, data.userName];
            }
            return prev;
          });
          if (onUserTyping) {
            onUserTyping(data.userId, data.userName);
          }
        });

        socket.on('messaging:user-stopped-typing', (data: { userId: string }) => {
          console.log('⏸️ User stopped typing');
          setTypingUsers(prev => prev.filter(name => name !== data.userId));
          if (onUserStoppedTyping) {
            onUserStoppedTyping(data.userId);
          }
        });

        socket.on('messaging:messages-read', (data: { userId: string }) => {
          console.log('✅ Messages marked as read');
          if (onMessagesRead) {
            onMessagesRead(data.userId);
          }
        });

        socket.on('messaging:error', (data: { message: string; error?: string }) => {
          console.error('Messaging error:', data);
        });

        // Presence handlers
        socket.on('presence:user-online', (data: { userId: string }) => {
          console.log('👤 User came online:', data.userId);
        });

        socket.on('presence:user-offline', (data: { userId: string }) => {
          console.log('👤 User went offline:', data.userId);
        });

      } catch (error) {
        console.error('Error initializing socket:', error);
      }
    };

    initSocket();

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        if (threadId) {
          socketRef.current.emit('messaging:leave-thread', { threadId });
        }
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [threadId, onNewMessage, onMessageDeleted, onUserTyping, onUserStoppedTyping, onMessagesRead]);

  // Join thread when threadId changes
  useEffect(() => {
    if (socketRef.current && isConnected && threadId && userIdRef.current) {
      socketRef.current.emit('messaging:join-thread', {
        threadId,
        userId: userIdRef.current
      });
    }
    return () => {
      if (socketRef.current && threadId) {
        socketRef.current.emit('messaging:leave-thread', { threadId });
      }
    };
  }, [threadId, isConnected]);

  /**
   * Send a message via Socket.io
   */
  const sendMessage = useCallback((content: string, messageType: string = 'TEXT') => {
    if (!socketRef.current || !isConnected || !threadId || !userIdRef.current) {
      console.warn('Cannot send message: not connected or missing data');
      return;
    }

    socketRef.current.emit('messaging:send-message', {
      threadId,
      senderId: userIdRef.current,
      content,
      messageType
    });
  }, [threadId, isConnected]);

  /**
   * Start typing indicator
   */
  const startTyping = useCallback(() => {
    if (!socketRef.current || !isConnected || !threadId || !userIdRef.current) {
      return;
    }

    socketRef.current.emit('messaging:typing-start', {
      threadId,
      userId: userIdRef.current,
      userName: userNameRef.current || 'Unknown'
    });

    // Auto-stop after 3 seconds of inactivity
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 3000);
  }, [threadId, isConnected]);

  /**
   * Stop typing indicator
   */
  const stopTyping = useCallback(() => {
    if (!socketRef.current || !isConnected || !threadId || !userIdRef.current) {
      return;
    }

    socketRef.current.emit('messaging:typing-stop', {
      threadId,
      userId: userIdRef.current
    });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, [threadId, isConnected]);

  /**
   * Delete a message
   */
  const deleteMessage = useCallback((messageId: string) => {
    if (!socketRef.current || !isConnected || !threadId || !userIdRef.current) {
      console.warn('Cannot delete message: not connected');
      return;
    }

    socketRef.current.emit('messaging:delete-message', {
      messageId,
      threadId,
      userId: userIdRef.current
    });
  }, [threadId, isConnected]);

  /**
   * Mark messages as read
   */
  const markAsRead = useCallback(() => {
    if (!socketRef.current || !isConnected || !threadId || !userIdRef.current) {
      return;
    }

    socketRef.current.emit('messaging:mark-read', {
      threadId,
      userId: userIdRef.current
    });
  }, [threadId, isConnected]);

  return {
    isConnected,
    sendMessage,
    startTyping,
    stopTyping,
    deleteMessage,
    markAsRead,
    typingUsers
  };
};
