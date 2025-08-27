import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Player {
  id: string;
  name: string;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
  gamesPlayed: number;
  wins: number;
  losses: number;
}

interface UpNextBannerProps {
  nextPlayers: Player[];
  queueLength: number;
  showDuringGame: boolean;
  courtId: string;
  estimatedWaitTimes?: number[];
  onDismiss?: () => void;
  autoHideAfter?: number; // seconds
  isVisible?: boolean;
}

export const UpNextBanner: React.FC<UpNextBannerProps> = ({
  nextPlayers,
  queueLength,
  showDuringGame,
  courtId,
  estimatedWaitTimes = [],
  onDismiss,
  autoHideAfter = 10,
  isVisible = true
}) => {
  const [visible, setVisible] = useState(false);
  const [userDismissed, setUserDismissed] = useState(false);
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const autoHideTimer = useRef<NodeJS.Timeout | null>(null);

  // Determine if banner should be shown
  const shouldShow = 
    isVisible &&
    !userDismissed &&
    showDuringGame &&
    nextPlayers.length >= 2 &&
    queueLength >= 2;

  useEffect(() => {
    if (shouldShow && !visible) {
      // Show banner
      setVisible(true);
      
      // Entrance animation
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start();

      // Set auto-hide timer
      if (autoHideAfter > 0) {
        autoHideTimer.current = setTimeout(() => {
          handleAutoDismiss();
        }, autoHideAfter * 1000);
      }
    } else if (!shouldShow && visible) {
      // Hide banner
      hideBanner();
    }

    return () => {
      if (autoHideTimer.current) {
        clearTimeout(autoHideTimer.current);
      }
    };
  }, [shouldShow, visible, autoHideAfter]);

  // Reset user dismissal when queue changes significantly
  useEffect(() => {
    setUserDismissed(false);
  }, [nextPlayers.length, courtId]);

  const hideBanner = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start(() => {
      setVisible(false);
    });
    
    if (autoHideTimer.current) {
      clearTimeout(autoHideTimer.current);
      autoHideTimer.current = null;
    }
  };

  const handleManualDismiss = () => {
    setUserDismissed(true);
    hideBanner();
    onDismiss?.();
  };

  const handleAutoDismiss = () => {
    hideBanner();
    // Don't set userDismissed for auto-hide, allow it to reappear
  };

  const formatWaitTime = (minutes: number): string => {
    if (minutes < 1) return "Soon";
    if (minutes < 60) return `~${Math.round(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `~${hours}h ${Math.round(mins)}m`;
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: fadeAnim,
        }
      ]}
    >
      <View style={styles.content}>
        {/* Icon and Title */}
        <View style={styles.header}>
          <Ionicons name="hourglass-outline" size={16} color="#1565C0" />
          <Text style={styles.title}>Up Next:</Text>
        </View>

        {/* Next Players */}
        <View style={styles.playersContainer}>
          {nextPlayers.slice(0, 2).map((player, index) => (
            <View key={player.id} style={styles.playerInfo}>
              <View style={styles.positionBadge}>
                <Text style={styles.positionText}>{index + 1}</Text>
              </View>
              <Text style={styles.playerName} numberOfLines={1}>
                {player.name}
              </Text>
              {estimatedWaitTimes[index] !== undefined && (
                <Text style={styles.waitTime}>
                  {formatWaitTime(estimatedWaitTimes[index])}
                </Text>
              )}
            </View>
          ))}
        </View>

        {/* Queue Length Indicator */}
        {queueLength > 2 && (
          <View style={styles.queueIndicator}>
            <Text style={styles.queueText}>
              +{queueLength - 2} more
            </Text>
          </View>
        )}
      </View>

      {/* Dismiss Button */}
      <TouchableOpacity
        style={styles.dismissButton}
        onPress={handleManualDismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={16} color="#757575" />
      </TouchableOpacity>

      {/* Auto-hide Progress Indicator */}
      {autoHideAfter > 0 && (
        <View style={styles.progressContainer}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                width: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%']
                })
              }
            ]}
          />
        </View>
      )}
    </Animated.View>
  );
};

// Reappear Button Component (shows when banner is dismissed)
interface ReappearButtonProps {
  onPress: () => void;
  nextPlayersCount: number;
  isVisible: boolean;
}

export const UpNextReappearButton: React.FC<ReappearButtonProps> = ({
  onPress,
  nextPlayersCount,
  isVisible
}) => {
  const [bounceAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (isVisible) {
      // Gentle bounce animation
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(bounceAnim, {
          toValue: 0.95,
          tension: 300,
          friction: 10,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.reappearButton,
        {
          transform: [
            { scale: bounceAnim },
            {
              translateY: bounceAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0]
              })
            }
          ],
          opacity: bounceAnim
        }
      ]}
    >
      <TouchableOpacity
        style={styles.reappearTouchable}
        onPress={onPress}
      >
        <Ionicons name="chevron-down" size={14} color="#1565C0" />
        <Text style={styles.reappearText}>
          Next {nextPlayersCount}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: 'rgba(21, 101, 192, 0.2)',
    borderRadius: 8,
    marginVertical: 8,
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1565C0',
    marginLeft: 4,
  },
  playersContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  playerInfo: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  positionBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  positionText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  playerName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#212121',
    textAlign: 'center',
    marginBottom: 2,
  },
  waitTime: {
    fontSize: 10,
    color: '#FF9500',
    fontWeight: '600',
  },
  queueIndicator: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(21, 101, 192, 0.1)',
    borderRadius: 12,
  },
  queueText: {
    fontSize: 10,
    color: '#1565C0',
    fontWeight: '500',
  },
  dismissButton: {
    marginLeft: 8,
    padding: 4,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(21, 101, 192, 0.1)',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#1565C0',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  reappearButton: {
    position: 'absolute',
    top: 8,
    right: 16,
    zIndex: 10,
  },
  reappearTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  reappearText: {
    fontSize: 10,
    color: '#1565C0',
    fontWeight: '500',
    marginLeft: 2,
  },
});

export default UpNextBanner;