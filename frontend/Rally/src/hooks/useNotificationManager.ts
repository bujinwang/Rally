// @ts-nocheck
import { useEffect, useState, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { notificationService, NotificationType } from '../services/NotificationService';
import { InAppNotificationData } from '../components/InAppNotification';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config';

interface UseNotificationManagerProps {
  shareCode?: string;
  deviceId?: string;
  playerName?: string;
}

export function useNotificationManager({
  shareCode,
  deviceId,
  playerName,
}: UseNotificationManagerProps = {}) {
  const [inAppNotification, setInAppNotification] = useState<InAppNotificationData | null>(
    null
  );
  const [isInitialized, setIsInitialized] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const appState = useRef(AppState.currentState);

  // Initialize notification service
  useEffect(() => {
    initializeNotifications();

    // Handle app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      cleanup();
    };
  }, []);

  // Connect to Socket.io when shareCode is available
  useEffect(() => {
    if (shareCode && deviceId && isInitialized) {
      connectToSocket();
    }

    return () => {
      disconnectFromSocket();
    };
  }, [shareCode, deviceId, isInitialized]);

  const initializeNotifications = async () => {
    try {
      const pushToken = await notificationService.initialize();
      
      if (pushToken && deviceId) {
        // Register push token with backend
        await registerPushToken(pushToken, deviceId);
      }

      setIsInitialized(true);
      console.log('✅ Notification manager initialized');
    } catch (error) {
      console.error('Failed to initialize notifications:', error);
    }
  };

  const registerPushToken = async (pushToken: string, deviceId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/notifications/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pushToken,
          deviceId,
          platform: Platform.OS,
          playerName,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Push token registered');
      }
    } catch (error) {
      console.error('Failed to register push token:', error);
    }
  };

  const connectToSocket = () => {
    if (socketRef.current?.connected) {
      console.log('Socket already connected');
      return;
    }

    console.log('📡 Connecting to Socket.io...');

    socketRef.current = io(API_BASE_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('✅ Socket.io connected');
      
      // Join session room
      if (shareCode && deviceId) {
        socket.emit('join_session', { shareCode, deviceId });
        console.log(`📡 Joined session ${shareCode}`);
      }
    });

    // Listen for notification events
    socket.on('game_ready', (data) => {
      console.log('📱 Received game_ready notification:', data);
      showInAppNotification({
        id: `game_ready_${Date.now()}`,
        type: data.type,
        title: data.title,
        message: data.body,
      });
      
      // Show push notification if app is in background
      if (appState.current !== 'active') {
        notificationService.notifyGameReady(
          data.data.gameId,
          data.data.players,
          data.data.courtName
        );
      }
    });

    socket.on('rest_approved', (data) => {
      console.log('📱 Received rest_approved notification:', data);
      showInAppNotification({
        id: `rest_approved_${Date.now()}`,
        type: data.type,
        title: data.title,
        message: data.body,
      });
      
      if (appState.current !== 'active') {
        notificationService.notifyRestApproved(
          data.data.playerName,
          data.data.duration
        );
      }
    });

    socket.on('rest_denied', (data) => {
      console.log('📱 Received rest_denied notification:', data);
      showInAppNotification({
        id: `rest_denied_${Date.now()}`,
        type: data.type,
        title: data.title,
        message: data.body,
      });
      
      if (appState.current !== 'active') {
        notificationService.notifyRestDenied(
          data.data.playerName,
          data.data.reason
        );
      }
    });

    socket.on('score_recorded', (data) => {
      console.log('📱 Received score_recorded notification:', data);
      showInAppNotification({
        id: `score_recorded_${Date.now()}`,
        type: data.type,
        title: data.title,
        message: data.body,
      });
    });

    socket.on('next_up', (data) => {
      console.log('📱 Received next_up notification:', data);
      showInAppNotification({
        id: `next_up_${Date.now()}`,
        type: data.type,
        title: data.title,
        message: data.body,
        duration: 6000, // Show longer for important notification
      });
      
      if (appState.current !== 'active') {
        notificationService.notifyNextUp(
          data.data.playerName,
          data.data.position
        );
      }
    });

    socket.on('session_starting', (data) => {
      console.log('📱 Received session_starting notification:', data);
      showInAppNotification({
        id: `session_starting_${Date.now()}`,
        type: data.type,
        title: data.title,
        message: data.body,
      });
      
      if (appState.current !== 'active') {
        notificationService.notifySessionStarting(
          data.data.sessionName,
          data.data.minutesUntilStart
        );
      }
    });

    socket.on('session_updated', (data) => {
      console.log('📱 Received session_updated notification:', data);
      showInAppNotification({
        id: `session_updated_${Date.now()}`,
        type: data.type,
        title: data.title,
        message: data.body,
      });
    });

    socket.on('player_joined', (data) => {
      console.log('📱 Received player_joined notification:', data);
      showInAppNotification({
        id: `player_joined_${Date.now()}`,
        type: data.type,
        title: data.title,
        message: data.body,
        duration: 3000, // Shorter for less important notification
      });
    });

    socket.on('pairing_generated', (data) => {
      console.log('📱 Received pairing_generated notification:', data);
      showInAppNotification({
        id: `pairing_generated_${Date.now()}`,
        type: data.type,
        title: data.title,
        message: data.body,
      });
    });

    socket.on('disconnect', () => {
      console.log('❌ Socket.io disconnected');
    });

    socket.on('error', (error) => {
      console.error('Socket.io error:', error);
    });
  };

  const disconnectFromSocket = () => {
    if (socketRef.current) {
      if (shareCode && deviceId) {
        socketRef.current.emit('leave_session', { shareCode, deviceId });
      }
      socketRef.current.disconnect();
      socketRef.current = null;
      console.log('📡 Socket.io disconnected');
    }
  };

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    console.log('App state changed:', appState.current, '→', nextAppState);
    
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground
      console.log('📱 App came to foreground');
      
      // Reconnect socket if needed
      if (shareCode && deviceId && !socketRef.current?.connected) {
        connectToSocket();
      }
    }

    appState.current = nextAppState;
  };

  const showInAppNotification = (notification: InAppNotificationData) => {
    setInAppNotification(notification);
  };

  const dismissInAppNotification = () => {
    setInAppNotification(null);
  };

  const cleanup = () => {
    disconnectFromSocket();
    notificationService.cleanup();
  };

  return {
    inAppNotification,
    dismissInAppNotification,
    isInitialized,
    showInAppNotification,
  };
}
