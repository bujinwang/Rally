import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { PlayerCardProps } from './PlayerCard.types';
import { playerCardStyles as styles } from './PlayerCard.styles';

export const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  variant = 'confirmed',
  onActionPress,
  showActionButton = true,
  disabled = false,
}) => {
  // Determine status-based styling and behavior
  const getStatusInfo = () => {
    switch (player.status) {
      case 'ACTIVE':
        return {
          cardStyle: styles.cardActive,
          buttonStyle: styles.actionButtonRest,
          buttonText: '歇一下', // "Take rest"
          statusText: '活跃中', // "Active"
          statusEmoji: '🎾',
          canRequestStatus: true
        };
      case 'RESTING':
        return {
          cardStyle: styles.cardResting,
          buttonStyle: styles.actionButtonDisabled,
          buttonText: '休息中', // "Resting"
          statusText: player.restExpiresAt
            ? `休息至 ${new Date(player.restExpiresAt).toLocaleTimeString()}`
            : '休息中', // "Resting until..."
          statusEmoji: '😴',
          canRequestStatus: false
        };
      case 'LEFT':
        return {
          cardStyle: styles.cardLeft,
          buttonStyle: styles.actionButtonDisabled,
          buttonText: '已离开', // "Left"
          statusText: '已离开会话', // "Left session"
          statusEmoji: '👋',
          canRequestStatus: false
        };
      default:
        // Fallback for old status types
        return {
          cardStyle: styles.cardConfirmed,
          buttonStyle: styles.actionButtonConfirmed,
          buttonText: '更新',
          statusText: '状态未知',
          statusEmoji: '❓',
          canRequestStatus: false
        };
    }
  };

  const statusInfo = getStatusInfo();

  const handleStatusRequest = (action: 'rest' | 'leave') => {
    Alert.alert(
      `${action === 'rest' ? '请求休息' : '请求离开'}`,
      `确定要${action === 'rest' ? '请求15分钟休息' : '请求离开会话'}吗？需要管理员批准。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认',
          onPress: () => {
            if (onActionPress) {
              onActionPress({ ...player, requestedAction: action });
            }
          }
        }
      ]
    );
  };

  const handleActionPress = () => {
    if (!disabled && onActionPress) {
      if (player.status === 'ACTIVE' && showActionButton) {
        // Show status request options for active players
        Alert.alert(
          '选择操作',
          '您想要做什么？',
          [
            { text: '取消', style: 'cancel' },
            {
              text: '歇一下 (15分钟)',
              onPress: () => handleStatusRequest('rest')
            },
            {
              text: '离开会话',
              onPress: () => handleStatusRequest('leave')
            }
          ]
        );
      } else {
        onActionPress(player);
      }
    }
  };
  
  return (
    <View
      style={[
        styles.card,
        statusInfo.cardStyle,
        disabled && styles.cardDisabled,
      ]}
    >
      <View style={styles.content}>
        <View style={styles.leftContent}>
          {/* Player name */}
          <Text style={styles.playerName}>
            {statusInfo.statusEmoji} {player.name}
          </Text>

          {/* Status information */}
          <View style={styles.statusContainer}>
            <Text style={styles.roleText}>
              {player.role === 'ORGANIZER' ? '🏆 Organizer' : '👤 Player'}
            </Text>
            <Text style={styles.gamesText}>
              已打局数: {player.gamesPlayed}
            </Text>
            <Text style={[
              styles.statusBadge,
              player.status === 'ACTIVE' ? styles.statusBadgeActive :
              player.status === 'RESTING' ? styles.statusBadgeResting :
              player.status === 'LEFT' ? styles.statusBadgeLeft :
              styles.statusBadgeWaiting
            ]}>
              {statusInfo.statusText}
            </Text>
          </View>

          {/* Show pending request indicator */}
          {player.statusRequestedAt && (
            <Text style={styles.pendingRequestText}>
              ⏳ 等待管理员批准
            </Text>
          )}
        </View>

        {/* Action button */}
        {showActionButton && statusInfo.canRequestStatus && (
          <TouchableOpacity
            style={[
              styles.actionButton,
              statusInfo.buttonStyle,
              disabled && styles.actionButtonDisabled,
            ]}
            onPress={handleActionPress}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={styles.actionButtonText}>
              {statusInfo.buttonText}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default PlayerCard;