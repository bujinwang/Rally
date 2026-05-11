import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface GameTimerProps {
  startTime: string; // ISO timestamp when game started
  targetDurationMinutes: number; // Target game duration
  warningMinutes?: number; // Minutes before target to show warning (default 5)
  isCompleted?: boolean; // Whether game is already done
  compact?: boolean; // Compact layout option
  onTimeWarning?: () => void; // Callback when warning threshold reached
  onTimeExceeded?: () => void; // Callback when time exceeded
}

/**
 * Reusable game timer component.
 * Shows elapsed time with visual progress bar and warnings.
 */
export default function GameTimer({
  startTime,
  targetDurationMinutes,
  warningMinutes = 5,
  isCompleted = false,
  compact = false,
  onTimeWarning,
  onTimeExceeded,
}: GameTimerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const warningFired = useRef(false);
  const exceededFired = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const targetSeconds = targetDurationMinutes * 60;
  const warningSeconds = warningMinutes * 60;

  // Tick every second
  useEffect(() => {
    if (isCompleted) {
      // Calculate final elapsed once
      const elapsed = Math.floor(
        (new Date().getTime() - new Date(startTime).getTime()) / 1000
      );
      setElapsedSeconds(Math.max(0, elapsed));
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor(
        (now - new Date(startTime).getTime()) / 1000
      );
      setElapsedSeconds(Math.max(0, elapsed));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, isCompleted]);

  // Warning / exceeded callbacks
  useEffect(() => {
    if (isCompleted) return;

    const remaining = targetSeconds - elapsedSeconds;

    if (remaining <= warningSeconds && remaining > 0 && !warningFired.current) {
      warningFired.current = true;
      onTimeWarning?.();
    }

    if (remaining <= 0 && !exceededFired.current) {
      exceededFired.current = true;
      onTimeExceeded?.();
      // Start pulsing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [elapsedSeconds, targetSeconds, warningSeconds, isCompleted]);

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = Math.min(elapsedSeconds / targetSeconds, 1);
  const remaining = targetSeconds - elapsedSeconds;
  const isWarning = !isCompleted && remaining <= warningSeconds && remaining > 0;
  const isExceeded = !isCompleted && remaining <= 0;

  const progressColor = isExceeded
    ? '#FF3B30'
    : isWarning
    ? '#FF9500'
    : '#34C759';

  const statusIcon = isCompleted
    ? 'checkmark-circle'
    : isExceeded
    ? 'alert-circle'
    : isWarning
    ? 'time'
    : 'timer';

  const statusColor = isCompleted
    ? '#34C759'
    : isExceeded
    ? '#FF3B30'
    : isWarning
    ? '#FF9500'
    : '#007AFF';

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Ionicons name={statusIcon} size={14} color={statusColor} />
        <Text
          style={[
            styles.compactTime,
            { color: isExceeded ? '#FF3B30' : isWarning ? '#FF9500' : '#333' },
          ]}
        >
          {formatTime(elapsedSeconds)}
        </Text>
        {!isCompleted && (
          <Text style={styles.compactTarget}>/ {targetDurationMinutes}m</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressBarBg}>
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${Math.min(progress * 100, 100)}%`,
              backgroundColor: progressColor,
            },
          ]}
        />
      </View>

      {/* Time display */}
      <View style={styles.timeRow}>
        <Ionicons name={statusIcon} size={20} color={statusColor} />
        <Animated.Text
          style={[
            styles.elapsedTime,
            {
              color: isExceeded ? '#FF3B30' : isWarning ? '#FF9500' : '#333',
              transform: [{ scale: isExceeded ? pulseAnim : 1 }],
            },
          ]}
        >
          {formatTime(elapsedSeconds)}
        </Animated.Text>
        <Text style={styles.targetTime}>
          / {formatTime(targetSeconds)}
        </Text>
      </View>

      {/* Status label */}
      <View style={styles.statusRow}>
        {isCompleted ? (
          <Text style={[styles.statusLabel, { color: '#34C759' }]}>
            Completed
          </Text>
        ) : isExceeded ? (
          <Text style={[styles.statusLabel, { color: '#FF3B30' }]}>
            Over time by {formatTime(Math.abs(remaining))}
          </Text>
        ) : isWarning ? (
          <Text style={[styles.statusLabel, { color: '#FF9500' }]}>
            {formatTime(remaining)} remaining
          </Text>
        ) : (
          <Text style={[styles.statusLabel, { color: '#8E8E93' }]}>
            {formatTime(remaining)} remaining
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#E5E5EA',
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  elapsedTime: {
    fontSize: 28,
    fontWeight: '700',
    marginLeft: 8,
    fontVariant: ['tabular-nums'],
  },
  targetTime: {
    fontSize: 14,
    color: '#8E8E93',
    marginLeft: 4,
    marginTop: 10,
  },
  statusRow: {
    marginTop: 4,
    marginLeft: 28,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Compact variant
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactTime: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  compactTarget: {
    fontSize: 11,
    color: '#8E8E93',
  },
});
