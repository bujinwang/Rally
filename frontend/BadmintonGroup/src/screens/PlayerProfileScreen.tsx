import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'http://localhost:3001/api/v1';

interface PlayerStats {
  totalGames: number;
  winRate: number;
  favoritePartners: string[];
  averageGamesPerSession: number;
  totalSessions: number;
  currentStreak: number;
}

interface ActivityItem {
  id: string;
  type: 'session_joined' | 'game_won' | 'game_lost' | 'session_created';
  sessionName: string;
  timestamp: string;
  details: string;
}

interface PlayerPreferences {
  preferredPlayingTimes: string[];
  favoriteLocations: string[];
  playingStyle: 'Aggressive' | 'Defensive' | 'Balanced' | 'Power' | 'Technical';
  availableDays: string[];
}

interface PlayerProfile {
  id: string;
  name: string;
  deviceId: string;
  skillLevel: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  avatar?: string;
  joinedDate: string;
  stats: PlayerStats;
  preferences: PlayerPreferences;
  recentActivity: ActivityItem[];
}

type RouteParams = {
  playerId?: string;
  deviceId?: string;
  isOwnProfile?: boolean;
};

export default function PlayerProfileScreen() {
  const route = useRoute<RouteProp<{ params: RouteParams }, 'params'>>();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  useEffect(() => {
    initializeProfile();
  }, [route.params]);

  const initializeProfile = async () => {
    const params = route.params || {};
    const currentDeviceId = await AsyncStorage.getItem('deviceId');
    
    // Determine if this is the user's own profile
    const ownProfile = params.isOwnProfile || 
                      params.deviceId === currentDeviceId || 
                      !params.playerId;
    
    setIsOwnProfile(ownProfile);
    
    if (ownProfile) {
      // Load current user's profile
      await fetchOwnProfile(currentDeviceId);
    } else {
      // Load another player's profile
      await fetchPlayerProfile(params.playerId || params.deviceId);
    }
  };

  const fetchOwnProfile = async (deviceId: string | null) => {
    if (!deviceId) {
      // Mock profile for demo purposes
      setProfile(createMockProfile('You', deviceId || 'current-device'));
      setLoading(false);
      return;
    }

    try {
      // TODO: Replace with actual API call when backend is ready
      // const response = await fetch(`${API_BASE_URL}/mvp-players/${deviceId}/profile`);
      // const result = await response.json();
      
      // For now, create mock profile
      setProfile(createMockProfile('You', deviceId));
    } catch (error) {
      console.error('Error fetching own profile:', error);
      setProfile(createMockProfile('You', deviceId));
    } finally {
      setLoading(false);
    }
  };

  const fetchPlayerProfile = async (playerId: string | undefined) => {
    if (!playerId) {
      Alert.alert('Error', 'Player not found');
      navigation.goBack();
      return;
    }

    try {
      // TODO: Replace with actual API call when backend is ready
      setProfile(createMockProfile('Player', playerId));
    } catch (error) {
      console.error('Error fetching player profile:', error);
      Alert.alert('Error', 'Failed to load player profile');
    } finally {
      setLoading(false);
    }
  };

  const createMockProfile = (name: string, id: string): PlayerProfile => ({
    id,
    name: name === 'You' ? 'Your Profile' : 'Burt Thompson',
    deviceId: id,
    skillLevel: 'Intermediate',
    joinedDate: '2025-01-15T10:00:00.000Z',
    stats: {
      totalGames: 42,
      winRate: 67,
      favoritePartners: ['Alice', 'Kenny', 'Thong'],
      averageGamesPerSession: 2.8,
      totalSessions: 15,
      currentStreak: 5
    },
    preferences: {
      preferredPlayingTimes: ['Morning', 'Evening'],
      favoriteLocations: ['Shouti', 'Community Center'],
      playingStyle: 'Balanced',
      availableDays: ['Monday', 'Wednesday', 'Friday', 'Saturday']
    },
    recentActivity: [
      {
        id: '1',
        type: 'game_won',
        sessionName: 'Sunday Morning Session',
        timestamp: '2025-08-24T02:00:00.000Z',
        details: 'Won vs Alice & Bob'
      },
      {
        id: '2',
        type: 'session_joined',
        sessionName: 'Thursday Evening',
        timestamp: '2025-08-23T18:00:00.000Z',
        details: 'Joined session'
      },
      {
        id: '3',
        type: 'game_lost',
        sessionName: 'Weekend Warriors',
        timestamp: '2025-08-22T15:30:00.000Z',
        details: 'Lost to Kenny & Thong'
      }
    ]
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await initializeProfile();
    setRefreshing(false);
  };

  const handleEditProfile = () => {
    // TODO: Navigate to profile edit screen
    Alert.alert('Coming Soon', 'Profile editing will be available soon!');
  };

  const getSkillLevelColor = (level: string) => {
    switch (level) {
      case 'Beginner': return '#4CAF50';
      case 'Intermediate': return '#2196F3';
      case 'Advanced': return '#FF9800';
      case 'Expert': return '#F44336';
      default: return '#757575';
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'game_won': return '🏆';
      case 'game_lost': return '🎯';
      case 'session_created': return '➕';
      case 'session_joined': return '👥';
      default: return '📋';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const getAvatarInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="person-circle-outline" size={64} color="#999" />
        <Text style={styles.errorText}>Profile not found</Text>
        <TouchableOpacity style={styles.retryButton} onPress={initializeProfile}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.avatarContainer}>
            {profile.avatar ? (
              <Image source={{ uri: profile.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {getAvatarInitials(profile.name)}
                </Text>
              </View>
            )}
          </View>
          
          <View style={styles.headerInfo}>
            <Text style={styles.playerName}>{profile.name}</Text>
            <View style={[
              styles.skillBadge, 
              { backgroundColor: getSkillLevelColor(profile.skillLevel) }
            ]}>
              <Text style={styles.skillBadgeText}>{profile.skillLevel}</Text>
            </View>
            <Text style={styles.joinedDate}>
              Joined {new Date(profile.joinedDate).toLocaleDateString()}
            </Text>
          </View>

          {isOwnProfile && (
            <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
              <Ionicons name="pencil" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Statistics Cards */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Statistics</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{profile.stats.totalGames}</Text>
            <Text style={styles.statLabel}>Total Games</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{profile.stats.winRate}%</Text>
            <Text style={styles.statLabel}>Win Rate</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{profile.stats.totalSessions}</Text>
            <Text style={styles.statLabel}>Total Sessions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>🔥 {profile.stats.currentStreak}</Text>
            <Text style={styles.statLabel}>Current Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{profile.stats.averageGamesPerSession}</Text>
            <Text style={styles.statLabel}>Avg Games/Session</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{profile.stats.favoritePartners.length}</Text>
            <Text style={styles.statLabel}>Favorite Partners</Text>
          </View>
        </View>
      </View>

      {/* Recent Activity */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        {profile.recentActivity.map((activity) => (
          <View key={activity.id} style={styles.activityItem}>
            <Text style={styles.activityIcon}>
              {getActivityIcon(activity.type)}
            </Text>
            <View style={styles.activityContent}>
              <Text style={styles.activityDetails}>{activity.details}</Text>
              <Text style={styles.activitySession}>{activity.sessionName}</Text>
              <Text style={styles.activityTime}>
                {formatTimeAgo(activity.timestamp)}
              </Text>
            </View>
          </View>
        ))}
        
        <TouchableOpacity style={styles.viewAllButton}>
          <Text style={styles.viewAllText}>View All Activity</Text>
          <Ionicons name="chevron-forward" size={16} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        
        <View style={styles.preferenceGroup}>
          <Text style={styles.preferenceLabel}>Playing Times</Text>
          <View style={styles.chipContainer}>
            {profile.preferences.preferredPlayingTimes.map((time) => (
              <View key={time} style={[styles.chip, styles.timeChip]}>
                <Text style={styles.chipText}>{time}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.preferenceGroup}>
          <Text style={styles.preferenceLabel}>Favorite Locations</Text>
          <View style={styles.chipContainer}>
            {profile.preferences.favoriteLocations.map((location) => (
              <View key={location} style={[styles.chip, styles.locationChip]}>
                <Text style={styles.chipText}>{location}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.preferenceGroup}>
          <Text style={styles.preferenceLabel}>Playing Style</Text>
          <View style={[styles.chip, styles.styleChip]}>
            <Text style={styles.chipText}>{profile.preferences.playingStyle}</Text>
          </View>
        </View>

        <View style={styles.preferenceGroup}>
          <Text style={styles.preferenceLabel}>Available Days</Text>
          <View style={styles.chipContainer}>
            {profile.preferences.availableDays.map((day) => (
              <View key={day} style={[styles.chip, styles.dayChip]}>
                <Text style={styles.chipText}>{day.slice(0, 3)}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginVertical: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#007AFF',
    paddingBottom: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60, // Account for status bar
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  skillBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  skillBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  joinedDate: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  activityIcon: {
    fontSize: 24,
    marginRight: 12,
    width: 30,
    textAlign: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityDetails: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  activitySession: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  activityTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  viewAllText: {
    fontSize: 16,
    color: '#007AFF',
    marginRight: 4,
  },
  preferenceGroup: {
    marginBottom: 16,
  },
  preferenceLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  timeChip: {
    backgroundColor: '#e3f2fd',
  },
  locationChip: {
    backgroundColor: '#e8f5e8',
  },
  styleChip: {
    backgroundColor: '#fff3e0',
  },
  dayChip: {
    backgroundColor: '#f3e5f5',
  },
  chipText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
});