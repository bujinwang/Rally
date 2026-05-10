import { StyleSheet } from 'react-native';
import { colors, spacing } from '../../../theme/theme';

export const playerCardStyles = StyleSheet.create({
  card: {
    borderRadius: 4,
    padding: spacing.md, // 16px
    marginBottom: spacing.sm + 4, // 12px
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  
  // Status-specific card styles
  cardActive: {
    backgroundColor: colors.activeBackground, // #DCFCE7 light green
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
  },

  cardResting: {
    backgroundColor: '#FEF3C7', // Light yellow/orange for resting
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B', // Orange
  },

  cardLeft: {
    backgroundColor: '#FEE2E2', // Light red for left
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444', // Red
  },

  // Legacy variant styles (for backward compatibility)
  cardWaiting: {
    backgroundColor: colors.waitingBackground, // #FEF3C7 light orange
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },

  cardConfirmed: {
    backgroundColor: colors.surface, // #F8FAFC neutral light
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  
  // Content layout
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 32, // Ensure consistent height
  },
  
  leftContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 22,
    marginBottom: 2,
  },
  
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  
  roleText: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    marginRight: spacing.xs,
  },
  
  gamesText: {
    fontSize: 14,
    fontWeight: '400', 
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  
  statusBadge: {
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 2,
  },
  
  statusBadgeActive: {
    backgroundColor: colors.success,
    color: '#FFFFFF',
  },

  statusBadgeResting: {
    backgroundColor: '#F59E0B', // Orange
    color: '#FFFFFF',
  },

  statusBadgeLeft: {
    backgroundColor: '#EF4444', // Red
    color: '#FFFFFF',
  },

  statusBadgeWaiting: {
    backgroundColor: colors.warning,
    color: '#FFFFFF',
  },

  pendingRequestText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#F59E0B', // Orange
    marginTop: 4,
  },
  
  // Action button styles
  actionButton: {
    height: 28,
    minWidth: 60,
    borderRadius: 4,
    paddingHorizontal: spacing.sm + 4, // 12px
    justifyContent: 'center',
  },
  
  actionButtonActive: {
    backgroundColor: colors.warning, // Orange for "下场" (leave)
  },

  actionButtonRest: {
    backgroundColor: '#F59E0B', // Orange for rest requests
  },

  actionButtonWaiting: {
    backgroundColor: colors.success, // Green for "上场" (join)
  },

  actionButtonConfirmed: {
    backgroundColor: colors.primary, // Blue for general actions
  },
  
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  
  // Disabled state
  cardDisabled: {
    opacity: 0.6,
  },
  
  actionButtonDisabled: {
    backgroundColor: colors.border,
  },
});