import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from 'react-native-elements';
import { PlayerCardProps } from './PlayerCard.types';
import { playerCardStyles as styles } from './PlayerCard.styles';

export const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  variant = 'confirmed',
  onActionPress,
  showActionButton = true,
  disabled = false,
}) => {
  // Determine card styling based on variant
  const cardVariantStyle = {
    active: styles.cardActive,
    waiting: styles.cardWaiting,
    confirmed: styles.cardConfirmed,
  }[variant];
  
  // Determine button styling and text based on variant
  const buttonVariantStyle = {
    active: styles.actionButtonActive,
    waiting: styles.actionButtonWaiting,  
    confirmed: styles.actionButtonConfirmed,
  }[variant];
  
  const buttonText = {
    active: '下场',      // "Leave court"
    waiting: '上场',     // "Join court"
    confirmed: '更新',   // "Update"
  }[variant];
  
  const statusText = {
    active: '建议下场',    // "Suggested to leave"
    waiting: '可以上场',   // "Can join court"
    confirmed: '已确认',   // "Confirmed"
  }[variant];
  
  const handleActionPress = () => {
    if (!disabled && onActionPress) {
      onActionPress(player);
    }
  };
  
  return (
    <Card 
      containerStyle={[
        styles.card,
        cardVariantStyle,
        disabled && styles.cardDisabled,
      ]}
    >
      <View style={styles.content}>
        <View style={styles.leftContent}>
          {/* Player name */}
          <Text style={styles.playerName}>{player.name}</Text>
          
          {/* Status information */}
          <View style={styles.statusContainer}>
            <Text style={styles.roleText}>
              {player.isOrganizer ? '🏆 Organizer' : '👤 Player'}
            </Text>
            <Text style={styles.gamesText}>
              已打局数: {player.gamesPlayed}
            </Text>
            <Text style={[
              styles.statusBadge,
              variant === 'active' ? styles.statusBadgeActive : styles.statusBadgeWaiting
            ]}>
              {statusText}
            </Text>
          </View>
        </View>
        
        {/* Action button */}
        {showActionButton && (
          <TouchableOpacity
            style={[
              styles.actionButton,
              buttonVariantStyle,
              disabled && styles.actionButtonDisabled,
            ]}
            onPress={handleActionPress}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={styles.actionButtonText}>
              {buttonText}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
};

export default PlayerCard;