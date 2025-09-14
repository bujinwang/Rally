import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Achievement,
  PlayerAchievement,
  PlayerBadge,
  AchievementCategory,
  AchievementRarity
} from '../types/achievement';
import { achievementApi } from '../services/achievementApi';

interface AchievementItemProps {
  achievement: Achievement;
  playerAchievement?: PlayerAchievement;
  onPress?: () => void;
}

const AchievementItem: React.FC<AchievementItemProps> = ({
  achievement,
  playerAchievement,
  onPress
}) => {
  const isCompleted = playerAchievement?.isCompleted || false;
  const progress = playerAchievement?.progress || 0;
  const maxProgress = achievement.maxProgress;

  const getRarityColor = (rarity: AchievementRarity) => {
    switch (rarity) {
      case AchievementRarity.COMMON: return '#8B8B8B';
      case AchievementRarity.UNCOMMON: return '#4CAF50';
      case AchievementRarity.RARE: return '#2196F3';
      case AchievementRarity.EPIC: return '#9C27B0';
      case AchievementRarity.LEGENDARY: return '#FF9800';
      default: return '#8B8B8B';
    }
  };

  const getCategoryIcon = (category: AchievementCategory) => {
    switch (category) {
      case AchievementCategory.MATCH_PLAYING: return 'tennisball-outline';
      case AchievementCategory.TOURNAMENT: return 'trophy-outline';
      case AchievementCategory.SOCIAL: return 'people-outline';
      case AchievementCategory.PROGRESSION: return 'trending-up-outline';
      case AchievementCategory.SPECIAL: return 'star-outline';
      default: return 'medal-outline';
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.achievementItem,
        isCompleted && styles.achievementCompleted
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.achievementHeader}>
        <View style={styles.iconContainer}>
          <Ionicons
            name={getCategoryIcon(achievement.category)}
            size={24}
            color={isCompleted ? getRarityColor(achievement.rarity) : '#666'}
          />
        </View>
        <View style={styles.achievementInfo}>
          <Text style={[
            styles.achievementName,
            isCompleted && styles.achievementNameCompleted
          ]}>
            {achievement.name}
          </Text>
          <Text style={styles.achievementDescription}>
            {achievement.description}
          </Text>
        </View>
        {isCompleted && (
          <View style={styles.completedBadge}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
          </View>
        )}
      </View>

      {!isCompleted && maxProgress > 1 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${(progress / maxProgress) * 100}%` }
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {progress} / {maxProgress}
          </Text>
        </View>
      )}

      {isCompleted && achievement.points > 0 && (
        <View style={styles.pointsContainer}>
          <Ionicons name="star" size={14} color="#FFD700" />
          <Text style={styles.pointsText}>{achievement.points} points</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const AchievementScreen: React.FC = () => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [playerAchievements, setPlayerAchievements] = useState<PlayerAchievement[]>([]);
  const [playerBadges, setPlayerBadges] = useState<PlayerBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<AchievementCategory | 'ALL'>('ALL');

  // Mock player ID - in real app, get from auth context
  const playerId = 'player-123';

  useEffect(() => {
    loadAchievements();
  }, []);

  const loadAchievements = async () => {
    try {
      setLoading(true);

      // Load all achievements
      const allAchievements = await achievementApi.getActiveAchievements();

      // Load player achievements and badges
      const playerData = await achievementApi.getPlayerAchievements(playerId);

      setAchievements(allAchievements);
      setPlayerAchievements(playerData.achievements);
      setPlayerBadges(playerData.badges);
    } catch (error) {
      console.error('Failed to load achievements:', error);
      Alert.alert('Error', 'Failed to load achievements');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredAchievements = () => {
    if (selectedCategory === 'ALL') return achievements;

    return achievements.filter(achievement => achievement.category === selectedCategory);
  };

  const getPlayerAchievement = (achievementId: string) => {
    return playerAchievements.find(pa => pa.achievementId === achievementId);
  };

  const categories = [
    { key: 'ALL', label: 'All', icon: 'apps-outline' },
    { key: AchievementCategory.MATCH_PLAYING, label: 'Matches', icon: 'tennisball-outline' },
    { key: AchievementCategory.TOURNAMENT, label: 'Tournaments', icon: 'trophy-outline' },
    { key: AchievementCategory.SOCIAL, label: 'Social', icon: 'people-outline' },
    { key: AchievementCategory.PROGRESSION, label: 'Progress', icon: 'trending-up-outline' },
    { key: AchievementCategory.SPECIAL, label: 'Special', icon: 'star-outline' },
  ];

  const renderCategoryFilter = () => (
    <View style={styles.categoryContainer}>
      {categories.map(category => (
        <TouchableOpacity
          key={category.key}
          style={[
            styles.categoryButton,
            selectedCategory === category.key && styles.categoryButtonActive
          ]}
          onPress={() => setSelectedCategory(category.key as any)}
        >
          <Ionicons
            name={category.icon as any}
            size={16}
            color={selectedCategory === category.key ? '#fff' : '#666'}
          />
          <Text style={[
            styles.categoryText,
            selectedCategory === category.key && styles.categoryTextActive
          ]}>
            {category.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderStats = () => {
    const completedCount = playerAchievements.filter(pa => pa.isCompleted).length;
    const totalPoints = playerAchievements
      .filter(pa => pa.isCompleted)
      .reduce((sum, pa) => sum + pa.achievement.points, 0);

    return (
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{completedCount}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{playerBadges.length}</Text>
          <Text style={styles.statLabel}>Badges</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalPoints}</Text>
          <Text style={styles.statLabel}>Points</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading achievements...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Achievements</Text>
        <Text style={styles.subtitle}>Track your badminton progress</Text>
      </View>

      {renderStats()}
      {renderCategoryFilter()}

      <FlatList
        data={getFilteredAchievements()}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AchievementItem
            achievement={item}
            playerAchievement={getPlayerAchievement(item.id)}
          />
        )}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  categoryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#fff',
    marginTop: 10,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  categoryButtonActive: {
    backgroundColor: '#007AFF',
  },
  categoryText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  categoryTextActive: {
    color: '#fff',
  },
  listContainer: {
    padding: 20,
  },
  achievementItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  achievementCompleted: {
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  achievementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  achievementInfo: {
    flex: 1,
  },
  achievementName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  achievementNameCompleted: {
    color: '#4CAF50',
  },
  achievementDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  completedBadge: {
    marginLeft: 8,
  },
  progressContainer: {
    marginTop: 12,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
  },
  pointsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  pointsText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
});

export default AchievementScreen;