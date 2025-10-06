import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { friendsApi, FriendRequest } from '../services/friendsApi';

type TabType = 'received' | 'sent';

export default function FriendRequestsScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('received');
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const [received, sent] = await Promise.all([
        friendsApi.getFriendRequests('received'),
        friendsApi.getFriendRequests('sent')
      ]);
      setReceivedRequests(received);
      setSentRequests(sent);
    } catch (error) {
      console.error('Error loading friend requests:', error);
      Alert.alert('Error', 'Failed to load friend requests');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  };

  const handleAccept = async (requestId: string) => {
    try {
      setProcessingId(requestId);
      await friendsApi.respondToFriendRequest(requestId, true);
      
      // Remove from received requests
      setReceivedRequests(prev => prev.filter(r => r.id !== requestId));
      
      Alert.alert('Success', 'Friend request accepted!');
    } catch (error) {
      console.error('Error accepting request:', error);
      Alert.alert('Error', error.message || 'Failed to accept friend request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (requestId: string) => {
    Alert.alert(
      'Decline Request',
      'Are you sure you want to decline this friend request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessingId(requestId);
              await friendsApi.respondToFriendRequest(requestId, false);
              
              // Remove from received requests
              setReceivedRequests(prev => prev.filter(r => r.id !== requestId));
              
              Alert.alert('Success', 'Friend request declined');
            } catch (error) {
              console.error('Error declining request:', error);
              Alert.alert('Error', error.message || 'Failed to decline friend request');
            } finally {
              setProcessingId(null);
            }
          }
        }
      ]
    );
  };

  const handleCancel = async (requestId: string) => {
    Alert.alert(
      'Cancel Request',
      'Are you sure you want to cancel this friend request?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          onPress: async () => {
            try {
              setProcessingId(requestId);
              await friendsApi.respondToFriendRequest(requestId, false);
              
              // Remove from sent requests
              setSentRequests(prev => prev.filter(r => r.id !== requestId));
              
              Alert.alert('Success', 'Friend request cancelled');
            } catch (error) {
              console.error('Error cancelling request:', error);
              Alert.alert('Error', error.message || 'Failed to cancel friend request');
            } finally {
              setProcessingId(null);
            }
          }
        }
      ]
    );
  };

  const renderReceivedRequest = ({ item }: { item: FriendRequest }) => {
    const isProcessing = processingId === item.id;

    return (
      <View style={styles.requestCard}>
        <View style={styles.requestHeader}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {item.sender.avatarUrl ? (
              <Image source={{ uri: item.sender.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={24} color="#fff" />
              </View>
            )}
          </View>

          {/* User Info */}
          <View style={styles.infoContainer}>
            <Text style={styles.userName}>{item.sender.name}</Text>
            <Text style={styles.timestamp}>
              {new Date(item.sentAt).toLocaleDateString()}
            </Text>
            {item.message && (
              <Text style={styles.message} numberOfLines={2}>
                "{item.message}"
              </Text>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.acceptButton, isProcessing && styles.buttonDisabled]}
            onPress={() => handleAccept(item.id)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.acceptButtonText}>Accept</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.declineButton, isProcessing && styles.buttonDisabled]}
            onPress={() => handleDecline(item.id)}
            disabled={isProcessing}
          >
            <Ionicons name="close" size={20} color="#666" />
            <Text style={styles.declineButtonText}>Decline</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSentRequest = ({ item }: { item: FriendRequest }) => {
    const isProcessing = processingId === item.id;

    return (
      <View style={styles.requestCard}>
        <View style={styles.requestHeader}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {item.receiver.avatarUrl ? (
              <Image source={{ uri: item.receiver.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={24} color="#fff" />
              </View>
            )}
          </View>

          {/* User Info */}
          <View style={styles.infoContainer}>
            <Text style={styles.userName}>{item.receiver.name}</Text>
            <Text style={styles.timestamp}>
              Sent {new Date(item.sentAt).toLocaleDateString()}
            </Text>
            <View style={styles.statusBadge}>
              <Ionicons name="time-outline" size={14} color="#FF9800" />
              <Text style={styles.statusText}>Pending</Text>
            </View>
          </View>
        </View>

        {/* Cancel Button */}
        <TouchableOpacity
          style={[styles.cancelButton, isProcessing && styles.buttonDisabled]}
          onPress={() => handleCancel(item.id)}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#666" />
          ) : (
            <Text style={styles.cancelButtonText}>Cancel Request</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons
        name={activeTab === 'received' ? 'mail-open-outline' : 'paper-plane-outline'}
        size={64}
        color="#ccc"
      />
      <Text style={styles.emptyText}>
        {activeTab === 'received' ? 'No pending requests' : 'No sent requests'}
      </Text>
      <Text style={styles.emptySubtext}>
        {activeTab === 'received'
          ? "You'll see friend requests here"
          : "Friend requests you've sent will appear here"}
      </Text>
    </View>
  );

  const currentRequests = activeTab === 'received' ? receivedRequests : sentRequests;

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'received' && styles.activeTab]}
          onPress={() => setActiveTab('received')}
        >
          <Text style={[styles.tabText, activeTab === 'received' && styles.activeTabText]}>
            Received
          </Text>
          {receivedRequests.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{receivedRequests.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'sent' && styles.activeTab]}
          onPress={() => setActiveTab('sent')}
        >
          <Text style={[styles.tabText, activeTab === 'sent' && styles.activeTabText]}>
            Sent
          </Text>
          {sentRequests.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{sentRequests.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      ) : (
        <FlatList
          data={currentRequests}
          keyExtractor={item => item.id}
          renderItem={activeTab === 'received' ? renderReceivedRequest : renderSentRequest}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          contentContainerStyle={
            currentRequests.length === 0 ? styles.emptyListContent : styles.listContent
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666'
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    gap: 6
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF'
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666'
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600'
  },
  badge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  listContent: {
    padding: 15,
    gap: 10
  },
  emptyListContent: {
    flexGrow: 1
  },
  requestCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2
  },
  requestHeader: {
    flexDirection: 'row',
    marginBottom: 15
  },
  avatarContainer: {
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
  infoContainer: {
    flex: 1
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 3
  },
  timestamp: {
    fontSize: 13,
    color: '#999',
    marginBottom: 5
  },
  message: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 5
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5
  },
  statusText: {
    fontSize: 13,
    color: '#FF9800',
    fontWeight: '500'
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600'
  },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6
  },
  declineButtonText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '600'
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center'
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500'
  },
  buttonDisabled: {
    opacity: 0.5
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666',
    marginTop: 15,
    marginBottom: 8
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20
  }
});
