import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { NotificationType } from '../services/NotificationService';

const { width } = Dimensions.get('window');

export interface InAppNotificationData {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number;
  onPress?: () => void;
}

interface InAppNotificationProps {
  notification: InAppNotificationData | null;
  onDismiss: () => void;
}

export const InAppNotification: React.FC<InAppNotificationProps> = ({
  notification,
  onDismiss,
}) => {
  const [slideAnim] = useState(new Animated.Value(-100));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (notification) {
      setVisible(true);
      
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }).start();

      timer = setTimeout(() => {
        handleDismiss();
      }, notification.duration || 4000);
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [notification]);

  const handleDismiss = () => {
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      onDismiss();
    });
  };

  const handlePress = () => {
    if (notification?.onPress) {
      notification.onPress();
    }
    handleDismiss();
  };

  if (!visible || !notification) {
    return null;
  }

  const getNotificationStyle = () => {
    switch (notification.type) {
      case 'GAME_READY':
        return styles.gameReady;
      case 'REST_APPROVED':
        return styles.success;
      case 'REST_DENIED':
        return styles.error;
      case 'SCORE_RECORDED':
        return styles.info;
      case 'NEXT_UP':
        return styles.warning;
      case 'SESSION_STARTING':
        return styles.warning;
      case 'SESSION_UPDATED':
        return styles.info;
      case 'PLAYER_JOINED':
        return styles.info;
      case 'PAIRING_GENERATED':
        return styles.success;
      default:
        return styles.default;
    }
  };

  const getIcon = () => {
    switch (notification.type) {
      case 'GAME_READY':
        return '🏸';
      case 'REST_APPROVED':
        return '✅';
      case 'REST_DENIED':
        return '❌';
      case 'SCORE_RECORDED':
        return '🎯';
      case 'NEXT_UP':
        return '⏰';
      case 'SESSION_STARTING':
        return '⏰';
      case 'SESSION_UPDATED':
        return '📢';
      case 'PLAYER_JOINED':
        return '👋';
      case 'PAIRING_GENERATED':
        return '🎲';
      default:
        return '📱';
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        getNotificationStyle(),
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.content}
        onPress={handlePress}
        activeOpacity={0.9}
      >
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{getIcon()}</Text>
        </View>
        
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {notification.message}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.dismissButton}
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.dismissText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    marginTop: 50, // Below status bar
    marginHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissText: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
  },
  
  // Type-specific styles
  gameReady: {
    backgroundColor: '#4CAF50',
  },
  success: {
    backgroundColor: '#4CAF50',
  },
  error: {
    backgroundColor: '#FF5252',
  },
  info: {
    backgroundColor: '#2196F3',
  },
  warning: {
    backgroundColor: '#FF9800',
  },
  default: {
    backgroundColor: '#607D8B',
  },
});
