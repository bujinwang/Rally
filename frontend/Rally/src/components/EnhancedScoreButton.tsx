import React, { useState, useRef, useCallback } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  View,
  GestureResponderEvent,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export type HapticType = 'light' | 'medium' | 'heavy' | 'selection';

interface EnhancedScoreButtonProps {
  currentScore: number;
  onScoreChange: (newScore: number) => void;
  team: 'team1' | 'team2';
  disabled?: boolean;
  maxScore?: number;
  type: 'increment' | 'decrement';
  hapticEnabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export const EnhancedScoreButton: React.FC<EnhancedScoreButtonProps> = ({
  currentScore,
  onScoreChange,
  team,
  disabled = false,
  maxScore,
  type,
  hapticEnabled = true,
  size = 'large'
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const rapidFireTimer = useRef<NodeJS.Timeout | null>(null);

  const buttonSize = {
    small: 48,
    medium: 60,
    large: 72
  }[size];

  const iconSize = {
    small: 20,
    medium: 24,
    large: 28
  }[size];

  // Haptic feedback function
  const triggerHaptic = useCallback((hapticType: HapticType = 'light') => {
    if (!hapticEnabled) return;
    
    try {
      switch (hapticType) {
        case 'light':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'medium':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case 'heavy':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          break;
        case 'selection':
          Haptics.selectionAsync();
          break;
      }
    } catch (error) {
      console.warn('Haptic feedback not available:', error);
    }
  }, [hapticEnabled]);

  // Handle score change with validation
  const handleScoreChange = useCallback((delta: number) => {
    const newScore = currentScore + delta;
    
    // Validation
    if (newScore < 0) {
      triggerHaptic('heavy'); // Error feedback
      return;
    }
    
    if (maxScore && newScore > maxScore) {
      triggerHaptic('heavy'); // Error feedback
      return;
    }

    // Success feedback
    triggerHaptic('light');
    onScoreChange(newScore);

    // Special feedback for game points
    if (newScore >= 21 || (maxScore && newScore >= maxScore)) {
      setTimeout(() => triggerHaptic('medium'), 100);
    }
  }, [currentScore, maxScore, onScoreChange, triggerHaptic]);

  // Press animations
  const animatePress = useCallback((pressed: boolean) => {
    Animated.spring(scaleAnim, {
      toValue: pressed ? 0.95 : 1,
      tension: 300,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  // Long press pulse animation
  const animatePulse = useCallback((pulsing: boolean) => {
    if (pulsing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
        { iterations: -1 }
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [pulseAnim]);

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    
    setIsPressed(true);
    animatePress(true);
    triggerHaptic('selection');

    // Start long press timer
    longPressTimer.current = setTimeout(() => {
      setIsLongPressing(true);
      animatePulse(true);
      triggerHaptic('medium');
      
      // Start rapid fire scoring
      rapidFireTimer.current = setInterval(() => {
        const delta = type === 'increment' ? 1 : -1;
        handleScoreChange(delta);
      }, 200); // Score every 200ms during long press
      
    }, 500); // Long press threshold
  }, [disabled, animatePress, animatePulse, triggerHaptic, type, handleScoreChange]);

  const handlePressOut = useCallback(() => {
    setIsPressed(false);
    setIsLongPressing(false);
    animatePress(false);
    animatePulse(false);
    
    // Clear timers
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    if (rapidFireTimer.current) {
      clearInterval(rapidFireTimer.current);
      rapidFireTimer.current = null;
    }
  }, [animatePress, animatePulse]);

  const handlePress = useCallback(() => {
    if (disabled || isLongPressing) return;
    
    const delta = type === 'increment' ? 1 : -1;
    handleScoreChange(delta);
  }, [disabled, isLongPressing, type, handleScoreChange]);

  // Determine button style based on team and state
  const getButtonStyle = () => {
    let teamStyle = {};
    let pressedStyle = {};
    let disabledStyle = {};
    
    if (disabled) {
      disabledStyle = styles.disabled;
    } else if (team === 'team1') {
      teamStyle = styles.team1;
    } else {
      teamStyle = styles.team2;
    }
    
    if (isPressed) {
      pressedStyle = styles.pressed;
    }
    
    return [
      styles.button,
      { 
        width: buttonSize, 
        height: buttonSize,
        borderRadius: buttonSize / 2 
      },
      teamStyle,
      pressedStyle,
      disabledStyle
    ];
  };

  const getIconColor = () => {
    if (disabled) return '#BDBDBD';
    if (isPressed) return '#FFFFFF';
    return team === 'team1' ? '#2E7D32' : '#1565C0';
  };

  return (
    <Animated.View
      style={{
        transform: [
          { scale: scaleAnim },
          { scale: pulseAnim }
        ]
      }}
    >
      <TouchableOpacity
        style={getButtonStyle()}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={0.8}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={styles.buttonContent}>
          <Ionicons
            name={type === 'increment' ? 'add' : 'remove'}
            size={iconSize}
            color={getIconColor()}
          />
          
          {isLongPressing && (
            <View style={styles.rapidFireIndicator}>
              <Text style={styles.rapidFireText}>⚡</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Score Display Component
interface EnhancedScoreDisplayProps {
  score: number;
  team: 'team1' | 'team2';
  size?: 'small' | 'medium' | 'large';
}

export const EnhancedScoreDisplay: React.FC<EnhancedScoreDisplayProps> = ({
  score,
  team,
  size = 'large'
}) => {
  const fontSize = {
    small: 24,
    medium: 32,
    large: 48
  }[size];

  return (
    <View style={[
      styles.scoreDisplay,
      team === 'team1' ? styles.team1Score : styles.team2Score
    ]}>
      <Text style={[
        styles.scoreText,
        { fontSize }
      ]}>
        {score}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  team1: {
    borderColor: '#2E7D32',
  },
  team2: {
    borderColor: '#1565C0',
  },
  pressed: {
    backgroundColor: '#2E7D32',
    borderColor: '#2E7D32',
  },
  disabled: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonContent: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rapidFireIndicator: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF6B6B',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rapidFireText: {
    fontSize: 10,
    color: '#FFFFFF',
  },
  scoreDisplay: {
    minWidth: 80,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  team1Score: {
    backgroundColor: '#E8F5E8',
    borderColor: '#2E7D32',
    borderWidth: 1,
  },
  team2Score: {
    backgroundColor: '#E3F2FD',
    borderColor: '#1565C0',
    borderWidth: 1,
  },
  scoreText: {
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'SF Mono' : 'monospace',
    color: '#212121',
  },
});

export default EnhancedScoreButton;