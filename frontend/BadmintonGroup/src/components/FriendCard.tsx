import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Friend } from '../services/friendsApi';

interface FriendCardProps {
  friend: Friend['friend'] & { friendshipId: string };
  onRemove?: (friendId: string) => void;
  onBlock?: (friendId: string) => void;
  onMessage?: (friendId: string) => void;
  showActions?: boolean;
}

export const FriendCard: React.FC<FriendCardProps> = ({
  friend,
  onRemove,
  onBlock,
  onMessage,
  showActions = true
}) => {
  const handleRemove = () => {
    Alert.alert(
      'Remove Friend',
      `Are you sure you want to remove ${friend.name} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onRemove?.(friend.friendshipId)
        }
      ]
    );
  };

  const handleBlock = () => {
    Alert.alert(
      'Block User',
      `Are you sure you want to block ${friend.name}? This will remove them from your friends.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => onBlock?.(friend.id)
        }
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return '#4CAF50';
      case 'RESTING':
        return '#FF9800';
      case 'LEFT':
        return '#9E9E9E';
      default:
        return '#9E9E9E';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {friend.avatarUrl ? (
            <Image source={{ uri: friend.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={24} color="#fff" />
            </View>
          )}
          {/* Status Indicator */}
          <View
            style={[
              styles.statusIndicator,
              { backgroundColor: getStatusColor(friend.status) }
            ]}
          />
        </View>

        {/* Friend Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.name}>{friend.name}</Text>
          <Text style={styles.status}>
            {friend.status === 'ACTIVE' ? 'Active' : 
             friend.status === 'RESTING' ? 'Resting' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      {showActions && (
        <View style={styles.actionsContainer}>
          {onMessage && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onMessage(friend.id)}
            >
              <Ionicons name="chatbubble-outline" size={20} color="#007AFF" />
            </TouchableOpacity>
          )}
          
          {onRemove && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleRemove}
            >
              <Ionicons name="person-remove-outline" size={20} color="#FF9800" />
            </TouchableOpacity>
          )}
          
          {onBlock && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleBlock}
            >
              <Ionicons name="ban-outline" size={20} color="#F44336" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#e0e0e0'
  },
  avatarPlaceholder: {
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center'
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff'
  },
  infoContainer: {
    flex: 1
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 3
  },
  status: {
    fontSize: 13,
    color: '#666'
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 8
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center'
  }
});
