import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Player {
  id: string;
  name: string;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
  gamesPlayed: number;
  wins: number;
  losses: number;
}

interface EnhancedQueueItemProps {
  position: number;
  player: Player;
  estimatedWaitTime: number;
  isNextUp: boolean;
  gameCount: number;
  onRemove?: () => void;
  showRemoveButton?: boolean;
}

export const EnhancedQueueItem: React.FC<EnhancedQueueItemProps> = ({
  position,
  player,
  estimatedWaitTime,
  isNextUp,
  gameCount,
  onRemove,
  showRemoveButton = false
}) => {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      })
    ]).start();
  }, []);

  const formatWaitTime = (minutes: number): string => {
    if (isNextUp) return "Next up!";
    if (minutes < 1) return "~1 min";
    if (minutes < 60) return `~${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `~${hours}h ${Math.round(mins)}m`;
  };

  const getWaitTimeColor = (minutes: number): string => {
    if (isNextUp) return '#28a745'; // Green for "Next up!"
    if (minutes <= 5) return '#FF9500'; // Orange for short wait
    if (minutes <= 15) return '#FF9500'; // Orange for medium wait
    return '#FF6B6B'; // Red for long wait
  };

  return (
    <Animated.View 
      style={[
        styles.container,
        isNextUp && styles.nextUpContainer,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }]
        }
      ]}
    >
      {/* Position Badge */}
      <View style={[
        styles.positionBadge,
        isNextUp && styles.nextUpBadge
      ]}>
        <Text style={styles.positionNumber}>{position}</Text>
      </View>

      {/* Player Information */}
      <View style={styles.playerInfo}>
        <Text style={[
          styles.playerName,
          isNextUp && styles.nextUpText
        ]}>
          {player.name}
        </Text>
        
        <View style={styles.statsRow}>
          <View style={styles.gameCount}>
            <Ionicons name="tennisball-outline" size={12} color="#757575" />
            <Text style={styles.gameCountText}>{gameCount} games</Text>
          </View>
          
          <Text style={[
            styles.waitTime,
            { color: getWaitTimeColor(estimatedWaitTime) }
          ]}>
            <Ionicons name="time-outline" size={12} color={getWaitTimeColor(estimatedWaitTime)} />
            {' '}{formatWaitTime(estimatedWaitTime)}
          </Text>
        </View>
      </View>

      {/* Remove Button */}
      {showRemoveButton && onRemove && (
        <TouchableOpacity 
          style={styles.removeButton}
          onPress={onRemove}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={18} color="#f44336" />
        </TouchableOpacity>
      )}

      {/* Next Up Indicator */}
      {isNextUp && (
        <View style={styles.nextUpIndicator}>
          <Ionicons name="chevron-forward" size={16} color="#28a745" />
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  nextUpContainer: {
    backgroundColor: '#F8FFF9',
    borderLeftColor: '#28a745',
    shadowOpacity: 0.1,
  },
  positionBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2E7D32',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  nextUpBadge: {
    backgroundColor: '#28a745',
  },
  positionNumber: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  nextUpText: {
    color: '#1B5E20',
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gameCount: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gameCountText: {
    fontSize: 14,
    color: '#757575',
    marginLeft: 4,
  },
  waitTime: {
    fontSize: 12,
    fontWeight: '600',
    flexDirection: 'row',
    alignItems: 'center',
  },
  removeButton: {
    marginLeft: 12,
    padding: 4,
  },
  nextUpIndicator: {
    marginLeft: 8,
  },
});

export default EnhancedQueueItem;