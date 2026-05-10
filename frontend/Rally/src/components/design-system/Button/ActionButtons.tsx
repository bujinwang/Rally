import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button } from 'react-native-elements';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../../theme/theme';

interface ActionButtonsProps {
  // Join functionality
  canJoin: boolean;
  isJoined: boolean;
  onJoin: () => void;
  joinLoading?: boolean;
  
  // Copy functionality
  onCopyList: () => void;
  copyLoading?: boolean;
  
  // Share functionality
  onShare: () => void;
  shareLoading?: boolean;
  
  // User role
  isOrganizer?: boolean;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  canJoin,
  isJoined,
  onJoin,
  joinLoading = false,
  onCopyList,
  copyLoading = false,
  onShare,
  shareLoading = false,
  isOrganizer = false,
}) => {
  
  const getJoinButtonConfig = () => {
    if (isJoined) {
      return {
        title: '更新状态',
        color: colors.warning,
        icon: 'person-circle-outline',
      };
    }
    if (!canJoin) {
      return {
        title: '已满员',
        color: colors.border,
        icon: 'close-circle-outline',
        disabled: true,
      };
    }
    return {
      title: '加入游戏',
      color: colors.primary,
      icon: 'add-circle-outline',
    };
  };

  const joinConfig = getJoinButtonConfig();

  return (
    <View style={styles.container}>
      
      {/* Primary Action Row */}
      <View style={styles.primaryRow}>
        <Button
          title={joinConfig.title}
          onPress={onJoin}
          loading={joinLoading}
          disabled={joinConfig.disabled || joinLoading}
          buttonStyle={[
            styles.primaryButton,
            { backgroundColor: joinConfig.color },
            joinConfig.disabled && styles.disabledButton,
          ]}
          titleStyle={styles.primaryButtonText}
          icon={
            <Ionicons 
              name={joinConfig.icon as any} 
              size={20} 
              color="#FFFFFF" 
              style={styles.buttonIcon}
            />
          }
        />
      </View>

      {/* Secondary Actions Row */}
      <View style={styles.secondaryRow}>
        <Button
          title="复制名单"
          onPress={onCopyList}
          loading={copyLoading}
          disabled={copyLoading}
          buttonStyle={[styles.secondaryButton, styles.copyButton]}
          titleStyle={styles.secondaryButtonText}
          icon={
            <Ionicons 
              name="copy-outline" 
              size={18} 
              color={colors.textSecondary}
              style={styles.buttonIcon}
            />
          }
        />
        
        <Button
          title="分享链接"
          onPress={onShare}
          loading={shareLoading}
          disabled={shareLoading}
          buttonStyle={[styles.secondaryButton, styles.shareButton]}
          titleStyle={styles.secondaryButtonText}
          icon={
            <Ionicons 
              name="share-outline" 
              size={18} 
              color={colors.textSecondary}
              style={styles.buttonIcon}
            />
          }
        />
      </View>
      
      {/* Organizer Actions (if applicable) */}
      {isOrganizer && (
        <View style={styles.organizerRow}>
          <Button
            title="编辑设置"
            buttonStyle={[styles.secondaryButton, styles.editButton]}
            titleStyle={styles.secondaryButtonText}
            icon={
              <Ionicons 
                name="settings-outline" 
                size={18} 
                color={colors.textSecondary}
                style={styles.buttonIcon}
              />
            }
          />
        </View>
      )}
      
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  
  // Button rows
  primaryRow: {
    width: '100%',
  },
  
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  
  organizerRow: {
    width: '100%',
  },
  
  // Primary button (Join/Update)
  primaryButton: {
    height: 48, // Larger for primary action
    borderRadius: 6,
    paddingHorizontal: spacing.lg,
  },
  
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  
  // Secondary buttons (Copy, Share)
  secondaryButton: {
    flex: 1,
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  
  copyButton: {
    borderColor: colors.border,
  },
  
  shareButton: {
    borderColor: colors.border,
  },
  
  editButton: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  
  // Disabled state
  disabledButton: {
    backgroundColor: colors.border,
    opacity: 0.6,
  },
  
  // Icon spacing
  buttonIcon: {
    marginRight: spacing.xs,
  },
});

export default ActionButtons;