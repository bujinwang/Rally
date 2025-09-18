import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { socialApi, CommunityFeedItem } from '../services/socialApi';

interface CommunityFeedScreenProps {
  onSessionPress?: (sessionId: string) => void;
  onSharePress?: (item: CommunityFeedItem) => void;
}

export default function CommunityFeedScreen({
  onSessionPress,
  onSharePress,
}: CommunityFeedScreenProps) {
  const [feed, setFeed] = useState<{
    shares: CommunityFeedItem[];
    sessions: any[];
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFeed();
  }, []);

  const loadFeed = async () => {
    try {
      setError(null);
      const response = await socialApi.getCommunityFeed();

      if (response.success) {
        setFeed(response.data || { shares: [], sessions: [], total: 0 });
      } else {
        setError(response.error?.message || 'Failed to load feed');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadFeed();
  };

  const renderShareItem = ({ item }: { item: CommunityFeedItem }) => (
    <TouchableOpacity
      style={styles.shareItem}
      onPress={() => onSharePress?.(item)}
    >
      <View style={styles.shareHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.sharer.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.shareInfo}>
          <Text style={styles.sharerName}>{item.sharer.name}</Text>
          <Text style={styles.shareTime}>
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.platformBadge}>
          <Ionicons
            name={getPlatformIcon(item.platform)}
            size={16}
            color="#666"
          />
        </View>
      </View>

      {item.message && (
        <Text style={styles.shareMessage}>{item.message}</Text>
      )}

      {item.preview && (
        <TouchableOpacity style={styles.previewCard}>
          {item.preview.image && (
            <Image
              source={{ uri: item.preview.image }}
              style={styles.previewImage}
              resizeMode="cover"
            />
          )}
          <View style={styles.previewContent}>
            <Text style={styles.previewTitle} numberOfLines={2}>
              {item.preview.title}
            </Text>
            <Text style={styles.previewDescription} numberOfLines={2}>
              {item.preview.description}
            </Text>
            <Text style={styles.previewUrl} numberOfLines={1}>
              {item.preview.url}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.shareActions}>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="heart-outline" size={20} color="#666" />
          <Text style={styles.actionText}>Like</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="chatbubble-outline" size={20} color="#666" />
          <Text style={styles.actionText}>Comment</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="share-outline" size={20} color="#666" />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderSessionItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.sessionItem}
      onPress={() => onSessionPress?.(item.id)}
    >
      <View style={styles.sessionHeader}>
        <Text style={styles.sessionName}>{item.name}</Text>
        <Text style={styles.sessionDate}>
          {new Date(item.scheduledAt).toLocaleDateString()}
        </Text>
      </View>
      <Text style={styles.sessionLocation}>{item.location}</Text>
      <View style={styles.sessionStats}>
        <Text style={styles.sessionPlayers}>
          {item._count?.players || 0} players
        </Text>
        <Text style={styles.sessionSkill}>{item.skillLevel}</Text>
      </View>
    </TouchableOpacity>
  );

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'twitter':
        return 'logo-twitter';
      case 'facebook':
        return 'logo-facebook';
      case 'whatsapp':
        return 'logo-whatsapp';
      default:
        return 'link';
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading community feed...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={48} color="#ff6b6b" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadFeed}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const combinedData = [
    ...(feed?.shares || []).map(item => ({ ...item, type: 'share' })),
    ...(feed?.sessions || []).map(item => ({ ...item, type: 'session' })),
  ].sort((a, b) => new Date(b.createdAt || b.scheduledAt).getTime() - new Date(a.createdAt || a.scheduledAt).getTime());

  return (
    <View style={styles.container}>
      <FlatList
        data={combinedData}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        renderItem={(item) =>
          item.item.type === 'share'
            ? renderShareItem({ item: item.item })
            : renderSessionItem({ item: item.item })
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No community activity yet</Text>
            <Text style={styles.emptySubtext}>Be the first to share something!</Text>
          </View>
        }
        contentContainerStyle={combinedData.length === 0 ? styles.emptyList : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: '#ff6b6b',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  shareItem: {
    backgroundColor: 'white',
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  shareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  shareInfo: {
    flex: 1,
    marginLeft: 10,
  },
  sharerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  shareTime: {
    fontSize: 12,
    color: '#666',
  },
  platformBadge: {
    padding: 5,
  },
  shareMessage: {
    fontSize: 16,
    color: '#333',
    marginBottom: 10,
    lineHeight: 22,
  },
  previewCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 150,
  },
  previewContent: {
    padding: 12,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  previewDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  previewUrl: {
    fontSize: 12,
    color: '#007AFF',
  },
  shareActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  actionText: {
    marginLeft: 5,
    fontSize: 14,
    color: '#666',
  },
  sessionItem: {
    backgroundColor: 'white',
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sessionName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  sessionDate: {
    fontSize: 14,
    color: '#666',
  },
  sessionLocation: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  sessionStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sessionPlayers: {
    fontSize: 14,
    color: '#007AFF',
  },
  sessionSkill: {
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 10,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
  },
  emptyList: {
    flex: 1,
  },
});