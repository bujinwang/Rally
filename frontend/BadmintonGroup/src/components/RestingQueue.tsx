import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

interface Player {
  id: string;
  name: string;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
  gamesPlayed: number;
  wins: number;
  losses: number;
  restGamesRemaining?: number;
  restExpiresAt?: string;
  restRequestedAt?: string;
  requestedAction?: 'rest' | 'leave';
}

interface RestingQueueProps {
  players: Player[];
  isOrganizer: boolean;
  onApproveRest?: (playerId: string, approve: boolean) => void;
  onExpireRest?: (playerId: string) => void;
}

export const RestingQueue: React.FC<RestingQueueProps> = ({
  players,
  isOrganizer,
  onApproveRest,
  onExpireRest
}) => {
  // Filter players who are resting or have pending rest requests
  const restingPlayers = players.filter(p => p.status === 'RESTING');
  const pendingRequests = players.filter(p => p.restRequestedAt && p.status === 'ACTIVE');

  const getRestTimeRemaining = (expiresAt?: string): string => {
    if (!expiresAt) return 'Indefinite';
    
    const now = new Date().getTime();
    const expires = new Date(expiresAt).getTime();
    const minutesRemaining = Math.ceil((expires - now) / (1000 * 60));
    
    if (minutesRemaining <= 0) return 'Expired';
    if (minutesRemaining === 1) return '1 minute';
    return `${minutesRemaining} minutes`;
  };

  const isRestExpired = (expiresAt?: string): boolean => {
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() < new Date().getTime();
  };

  if (restingPlayers.length === 0 && pendingRequests.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🛋️ Resting & Leave Requests</Text>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pending Requests ({pendingRequests.length})</Text>
          {pendingRequests.map(player => (
            <View key={player.id} style={styles.requestCard}>
              <View style={styles.requestInfo}>
                <Text style={styles.playerName}>{player.name}</Text>
                <Text style={styles.requestType}>
                  {player.requestedAction === 'rest' ? '🛋️ Rest' : '🚪 Leave'}
                </Text>
                <Text style={styles.requestTime}>
                  Requested {new Date(player.restRequestedAt!).toLocaleTimeString()}
                </Text>
              </View>
              
              {isOrganizer && onApproveRest && (
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.approveButton]}
                    onPress={() => onApproveRest(player.id, true)}
                  >
                    <Text style={styles.actionButtonText}>✓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.denyButton]}
                    onPress={() => onApproveRest(player.id, false)}
                  >
                    <Text style={styles.actionButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Currently Resting */}
      {restingPlayers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Currently Resting ({restingPlayers.length})</Text>
          {restingPlayers.map(player => {
            const expired = isRestExpired(player.restExpiresAt);
            const timeRemaining = getRestTimeRemaining(player.restExpiresAt);
            
            return (
              <View key={player.id} style={[
                styles.restingCard,
                expired && styles.expiredCard
              ]}>
                <View style={styles.restingInfo}>
                  <Text style={styles.playerName}>{player.name}</Text>
                  <Text style={styles.restStats}>
                    {player.gamesPlayed} games • {player.wins}W/{player.losses}L
                  </Text>
                  <Text style={[
                    styles.restTime,
                    expired && styles.expiredText
                  ]}>
                    {expired ? '⏰ Rest expired!' : `⏱️ ${timeRemaining} remaining`}
                  </Text>
                  {player.restGamesRemaining !== undefined && player.restGamesRemaining > 0 && (
                    <Text style={styles.gamesRemaining}>
                      {player.restGamesRemaining} game{player.restGamesRemaining !== 1 ? 's' : ''} to rest
                    </Text>
                  )}
                </View>
                
                {isOrganizer && expired && onExpireRest && (
                  <TouchableOpacity
                    style={styles.expireButton}
                    onPress={() => onExpireRest(player.id)}
                  >
                    <Text style={styles.expireButtonText}>Return to Active</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#FFB300',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F57C00',
    marginBottom: 12,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  requestCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FFA726',
  },
  requestInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  requestType: {
    fontSize: 14,
    color: '#F57C00',
    fontWeight: '600',
    marginBottom: 2,
  },
  requestTime: {
    fontSize: 12,
    color: '#666',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#4CAF50',
  },
  denyButton: {
    backgroundColor: '#FF5252',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  restingCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  expiredCard: {
    borderColor: '#FF9800',
    borderWidth: 2,
    backgroundColor: '#FFF3E0',
  },
  restingInfo: {
    flex: 1,
  },
  restStats: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  restTime: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  expiredText: {
    color: '#FF9800',
  },
  gamesRemaining: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  expireButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  expireButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
});
