import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, StyleSheet } from 'react-native';
import { useStatusManagement } from '../hooks/useStatusManagement';
import { Player } from './design-system/Card/PlayerCard.types';

interface StatusManagerProps {
  shareCode: string;
  currentUserId?: string;
  currentUserRole?: 'ORGANIZER' | 'PLAYER';
  players: Player[];
  onPlayerStatusChanged: (playerId: string, newStatus: Player['status'], additionalData?: any) => void;
}

interface PendingRequest {
  requestId: string;
  playerId: string;
  playerName: string;
  action: 'rest' | 'leave';
  reason?: string;
  requestedAt: string;
  requestedBy: 'self' | 'organizer';
}

export const StatusManager: React.FC<StatusManagerProps> = ({
  shareCode,
  currentUserId,
  currentUserRole,
  players,
  onPlayerStatusChanged
}) => {
  const [showRequests, setShowRequests] = useState(false);
  const [localPendingRequests, setLocalPendingRequests] = useState<PendingRequest[]>([]);

  const {
    pendingRequests,
    isConnected,
    requestStatusChange,
    approveStatusRequest,
    getPendingRequests,
    connectionStatus
  } = useStatusManagement({
    shareCode,
    currentUserId,
    onStatusRequest: (request) => {
      console.log('New status request:', request);
      // Add to local state for immediate UI update
      setLocalPendingRequests(prev => {
        const exists = prev.find(req => req.requestId === request.requestId);
        if (!exists) {
          return [...prev, request];
        }
        return prev;
      });
    },
    onStatusApproved: (approval) => {
      console.log('Status approved:', approval);
      // Remove from local pending requests
      setLocalPendingRequests(prev =>
        prev.filter(req => req.playerId !== approval.playerId)
      );
      // Update player status
      onPlayerStatusChanged(approval.playerId, approval.newStatus, approval);
    },
    onStatusDenied: (denial) => {
      console.log('Status denied:', denial);
      // Remove from local pending requests
      setLocalPendingRequests(prev =>
        prev.filter(req => req.playerId !== denial.playerId)
      );
    },
    onStatusExpired: (expiration) => {
      console.log('Status expired:', expiration);
      // Update player status to ACTIVE
      onPlayerStatusChanged(expiration.playerId, expiration.newStatus, expiration);
    },
    onPlayerStatusChanged
  });

  // Sync with hook's pending requests
  useEffect(() => {
    setLocalPendingRequests(pendingRequests);
  }, [pendingRequests]);

  // Load pending requests on mount (for organizers)
  useEffect(() => {
    if (currentUserRole === 'ORGANIZER' && shareCode) {
      getPendingRequests(shareCode).then(requests => {
        setLocalPendingRequests(requests);
      }).catch(error => {
        console.error('Failed to load pending requests:', error);
      });
    }
  }, [currentUserRole, shareCode, getPendingRequests]);

  const handleApproveRequest = async (request: PendingRequest, approved: boolean, reason?: string) => {
    try {
      await approveStatusRequest(request.requestId, approved, reason);

      if (approved) {
        Alert.alert('成功', `${request.playerName}的${request.action === 'rest' ? '休息' : '离开'}请求已批准`);
      } else {
        Alert.alert('已拒绝', `${request.playerName}的${request.action === 'rest' ? '休息' : '离开'}请求已被拒绝`);
      }
    } catch (error) {
      console.error('Failed to process status request:', error);
      Alert.alert('错误', '处理请求失败，请重试');
    }
  };

  const renderPendingRequest = ({ item }: { item: PendingRequest }) => (
    <View style={styles.requestItem}>
      <View style={styles.requestInfo}>
        <Text style={styles.playerName}>{item.playerName}</Text>
        <Text style={styles.requestDetails}>
          请求{item.action === 'rest' ? '休息15分钟' : '离开会话'}
          {item.reason && ` - ${item.reason}`}
        </Text>
        <Text style={styles.requestTime}>
          {new Date(item.requestedAt).toLocaleTimeString()}
        </Text>
      </View>

      <View style={styles.requestActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.approveButton]}
          onPress={() => handleApproveRequest(item, true)}
        >
          <Text style={styles.approveButtonText}>批准</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.denyButton]}
          onPress={() => {
            Alert.prompt(
              '拒绝原因',
              '请输入拒绝原因（可选）',
              [
                { text: '取消', style: 'cancel' },
                {
                  text: '拒绝',
                  onPress: (reason) => handleApproveRequest(item, false, reason)
                }
              ]
            );
          }}
        >
          <Text style={styles.denyButtonText}>拒绝</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Only show for organizers
  if (currentUserRole !== 'ORGANIZER') {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Connection status indicator */}
      <View style={styles.connectionStatus}>
        <Text style={[
          styles.connectionText,
          connectionStatus === 'connected' ? styles.connected :
          connectionStatus === 'connecting' ? styles.connecting :
          styles.disconnected
        ]}>
          {connectionStatus === 'connected' ? '🔗 已连接' :
           connectionStatus === 'connecting' ? '⏳ 连接中...' :
           '❌ 未连接'}
        </Text>
      </View>

      {/* Pending requests toggle */}
      {localPendingRequests.length > 0 && (
        <TouchableOpacity
          style={styles.requestsToggle}
          onPress={() => setShowRequests(!showRequests)}
        >
          <Text style={styles.requestsToggleText}>
            📋 待处理请求 ({localPendingRequests.length})
            {showRequests ? ' ▲' : ' ▼'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Pending requests list */}
      {showRequests && localPendingRequests.length > 0 && (
        <View style={styles.requestsContainer}>
          <FlatList
            data={localPendingRequests}
            keyExtractor={(item) => item.requestId}
            renderItem={renderPendingRequest}
            showsVerticalScrollIndicator={false}
            style={styles.requestsList}
          />
        </View>
      )}

      {/* No pending requests message */}
      {localPendingRequests.length === 0 && (
        <View style={styles.noRequestsContainer}>
          <Text style={styles.noRequestsText}>✅ 暂无待处理的请求</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    paddingHorizontal: 16,
  },

  connectionStatus: {
    alignItems: 'center',
    marginBottom: 8,
  },

  connectionText: {
    fontSize: 12,
    fontWeight: '500',
  },

  connected: {
    color: '#10B981', // Green
  },

  connecting: {
    color: '#F59E0B', // Orange
  },

  disconnected: {
    color: '#EF4444', // Red
  },

  requestsToggle: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },

  requestsToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },

  requestsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxHeight: 300,
  },

  requestsList: {
    padding: 8,
  },

  requestItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  requestInfo: {
    marginBottom: 12,
  },

  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },

  requestDetails: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },

  requestTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  requestActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  actionButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginHorizontal: 4,
  },

  approveButton: {
    backgroundColor: '#10B981', // Green
  },

  approveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },

  denyButton: {
    backgroundColor: '#EF4444', // Red
  },

  denyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },

  noRequestsContainer: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F0FDF4', // Light green
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },

  noRequestsText: {
    fontSize: 14,
    color: '#065F46',
    fontWeight: '500',
  },
});

export default StatusManager;