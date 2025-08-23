import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from 'react-native-elements';
import { colors, spacing } from '../../../theme/theme';

interface PlayerCountIndicatorProps {
  confirmed: number;
  total: number;
  variant?: 'default' | 'compact';
}

export const PlayerCountIndicator: React.FC<PlayerCountIndicatorProps> = ({
  confirmed,
  total,
  variant = 'default',
}) => {
  const percentage = total > 0 ? (confirmed / total) * 100 : 0;
  
  // Create visual dots for player count
  const renderDots = () => {
    const dots = [];
    for (let i = 0; i < total; i++) {
      dots.push(
        <View
          key={i}
          style={[
            styles.dot,
            i < confirmed ? styles.dotConfirmed : styles.dotEmpty,
          ]}
        />
      );
    }
    return dots;
  };

  const getStatusColor = () => {
    if (confirmed === 0) return colors.error;
    if (confirmed < total / 2) return colors.warning;
    if (confirmed === total) return colors.success;
    return colors.primary;
  };

  const getStatusText = () => {
    if (confirmed === 0) return '需要球员';
    if (confirmed < total / 2) return '还需球员';
    if (confirmed === total) return '人数已满';
    return '接近满员';
  };

  return (
    <Card containerStyle={[
      styles.card,
      variant === 'compact' && styles.cardCompact,
    ]}>
      <View style={styles.container}>
        
        {/* Dots visualization */}
        <View style={styles.dotsContainer}>
          {renderDots()}
        </View>
        
        {/* Count display */}
        <View style={styles.countContainer}>
          <Text style={styles.countText}>
            <Text style={[styles.confirmed, { color: getStatusColor() }]}>
              {confirmed}
            </Text>
            <Text style={styles.separator}>/{total}</Text>
            <Text style={styles.label}> 已确认</Text>
          </Text>
          
          {variant === 'default' && (
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {getStatusText()}
            </Text>
          )}
        </View>
        
        {/* Progress bar (optional visual enhancement) */}
        {variant === 'default' && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBackground}>
              <View 
                style={[
                  styles.progressFill,
                  { 
                    width: `${percentage}%`,
                    backgroundColor: getStatusColor(),
                  }
                ]}
              />
            </View>
          </View>
        )}
        
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 4,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  
  cardCompact: {
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  
  container: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  
  // Dots visualization
  dotsContainer: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  
  dotConfirmed: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  
  dotEmpty: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  
  // Count display
  countContainer: {
    alignItems: 'center',
    gap: spacing.xs / 2,
  },
  
  countText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  
  confirmed: {
    fontSize: 24,
    fontWeight: '700',
  },
  
  separator: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  
  label: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  
  // Progress bar
  progressContainer: {
    width: '100%',
    marginTop: spacing.xs,
  },
  
  progressBackground: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  
  progressFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
});

export default PlayerCountIndicator;