import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  TouchableOpacity,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../config/api';

interface RecapPlayer {
  name: string;
  wins: number;
  gamesPlayed: number;
  winRate: number;
}

interface GameHighlight {
  gameNumber: number;
  team1: string;
  team2: string;
  score: string;
  duration?: number;
  margin?: number;
}

interface RecapData {
  sessionName: string;
  sessionDate: string;
  location: string;
  status: string;
  sport: string;
  summary: {
    totalGames: number;
    totalMatches: number;
    totalPlayers: number;
    activePlayers: number;
    avgGameDuration: number;
  };
  mvp: RecapPlayer | null;
  topPerformers: RecapPlayer[];
  mostImproved: { name: string; bestStreak: number; gamesPlayed: number } | null;
  longestGame: GameHighlight | null;
  closestGame: GameHighlight | null;
}

type RouteParams = {
  shareCode: string;
};

export default function SessionRecapScreen() {
  const route = useRoute<RouteProp<{ params: RouteParams }, 'params'>>();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [recap, setRecap] = useState<RecapData | null>(null);

  const { shareCode } = route.params;

  useEffect(() => {
    fetchRecap();
  }, [shareCode]);

  const fetchRecap = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/mvp-sessions/${shareCode}/recap`);

      if (!response.ok) {
        throw new Error('Failed to load session recap');
      }

      const data = await response.json();
      if (data.success) {
        setRecap(data.data);
      } else {
        Alert.alert('Error', data.error?.message || 'Failed to load recap');
      }
    } catch (error: any) {
      console.error('Fetch recap error:', error);
      Alert.alert('Error', 'Failed to load session recap. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!recap) return;

    const mvpText = recap.mvp
      ? `🏆 MVP: ${recap.mvp.name} (${recap.mvp.wins} wins, ${(recap.mvp.winRate * 100).toFixed(0)}% win rate)`
      : '';

    const topText = recap.topPerformers.length > 0
      ? recap.topPerformers.map((p, i) => `  ${['🥇', '🥈', '🥉'][i] || '•'} ${p.name}: ${(p.winRate * 100).toFixed(0)}%`).join('\n')
      : '';

    const message = [
      `🏸 ${recap.sessionName} — Session Recap`,
      '',
      `📊 ${recap.summary.totalGames} games | ${recap.summary.totalPlayers} players | ${recap.summary.avgGameDuration}min avg`,
      '',
      mvpText,
      topText ? `\n⭐ Top Performers:\n${topText}` : '',
      '',
      recap.longestGame ? `⏱ Longest: ${recap.longestGame.team1} vs ${recap.longestGame.team2} (${recap.longestGame.duration}min)` : '',
      recap.closestGame ? `🎯 Closest: ${recap.closestGame.team1} vs ${recap.closestGame.team2} (${recap.closestGame.score})` : '',
      '',
      '🏸 Join us for the next session!',
    ].join('\n');

    try {
      await Share.share({ message });
    } catch (error) {
      // User cancelled
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading session recap...</Text>
      </View>
    );
  }

  if (!recap) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#ccc" />
        <Text style={styles.emptyText}>No recap data available</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchRecap}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{recap.sessionName}</Text>
        <Text style={styles.subtitle}>
          {new Date(recap.sessionDate).toLocaleDateString()} • {recap.location || 'TBD'}
        </Text>
        <View style={styles.statusBadge}>
          <Ionicons
            name={recap.status === 'COMPLETED' ? 'checkmark-circle' : 'time'}
            size={16}
            color={recap.status === 'COMPLETED' ? '#34C759' : '#FF9500'}
          />
          <Text style={[styles.statusText, { color: recap.status === 'COMPLETED' ? '#34C759' : '#FF9500' }]}>
            {recap.status}
          </Text>
        </View>
      </View>

      {/* Summary Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="tennisball" size={24} color="#007AFF" />
          <Text style={styles.statValue}>{recap.summary.totalGames}</Text>
          <Text style={styles.statLabel}>Games</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="people" size={24} color="#007AFF" />
          <Text style={styles.statValue}>{recap.summary.totalPlayers}</Text>
          <Text style={styles.statLabel}>Players</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="time" size={24} color="#007AFF" />
          <Text style={styles.statValue}>{recap.summary.avgGameDuration}m</Text>
          <Text style={styles.statLabel}>Avg Game</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="trophy" size={24} color="#007AFF" />
          <Text style={styles.statValue}>{recap.summary.activePlayers}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
      </View>

      {/* MVP */}
      {recap.mvp && (
        <View style={styles.mvpCard}>
          <View style={styles.mvpBadge}>
            <Ionicons name="star" size={28} color="#FFD700" />
            <Text style={styles.mvpTitle}>MVP</Text>
          </View>
          <Text style={styles.mvpName}>{recap.mvp.name}</Text>
          <View style={styles.mvpStats}>
            <View style={styles.mvpStat}>
              <Text style={styles.mvpStatValue}>{recap.mvp.wins}</Text>
              <Text style={styles.mvpStatLabel}>Wins</Text>
            </View>
            <View style={styles.mvpStat}>
              <Text style={styles.mvpStatValue}>{recap.mvp.gamesPlayed}</Text>
              <Text style={styles.mvpStatLabel}>Games</Text>
            </View>
            <View style={styles.mvpStat}>
              <Text style={styles.mvpStatValue}>{(recap.mvp.winRate * 100).toFixed(0)}%</Text>
              <Text style={styles.mvpStatLabel}>Win Rate</Text>
            </View>
          </View>
        </View>
      )}

      {/* Top Performers */}
      {recap.topPerformers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⭐ Top Performers</Text>
          {recap.topPerformers.map((player, index) => (
            <View key={player.name} style={styles.performerRow}>
              <Text style={styles.performerRank}>
                {['🥇', '🥈', '🥉'][index] || '•'}
              </Text>
              <View style={styles.performerInfo}>
                <Text style={styles.performerName}>{player.name}</Text>
                <Text style={styles.performerDetail}>
                  {player.wins}W • {player.gamesPlayed}G • {(player.winRate * 100).toFixed(0)}% win rate
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Most Improved */}
      {recap.mostImproved && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔥 Most Improved</Text>
          <View style={styles.highlightCard}>
            <Text style={styles.highlightName}>{recap.mostImproved.name}</Text>
            <Text style={styles.highlightDetail}>
              Best streak: {recap.mostImproved.bestStreak} wins • {recap.mostImproved.gamesPlayed} games played
            </Text>
          </View>
        </View>
      )}

      {/* Game Highlights */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎮 Game Highlights</Text>

        {recap.longestGame && (
          <View style={styles.highlightCard}>
            <View style={styles.highlightHeader}>
              <Ionicons name="time" size={18} color="#FF9500" />
              <Text style={styles.highlightLabel}>Longest Game</Text>
            </View>
            <Text style={styles.highlightMatchup}>
              {recap.longestGame.team1} vs {recap.longestGame.team2}
            </Text>
            <Text style={styles.highlightDetail}>
              Score: {recap.longestGame.score} • Duration: {recap.longestGame.duration}min
            </Text>
          </View>
        )}

        {recap.closestGame && (
          <View style={styles.highlightCard}>
            <View style={styles.highlightHeader}>
              <Ionicons name="pulse" size={18} color="#FF3B30" />
              <Text style={styles.highlightLabel}>Closest Game</Text>
            </View>
            <Text style={styles.highlightMatchup}>
              {recap.closestGame.team1} vs {recap.closestGame.team2}
            </Text>
            <Text style={styles.highlightDetail}>
              Score: {recap.closestGame.score} • Margin: {recap.closestGame.margin} point(s)
            </Text>
          </View>
        )}

        {!recap.longestGame && !recap.closestGame && (
          <Text style={styles.noDataText}>No game highlights yet</Text>
        )}
      </View>

      {/* Share Button */}
      <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
        <Ionicons name="share-outline" size={20} color="#fff" />
        <Text style={styles.shareButtonText}>Share Recap</Text>
      </TouchableOpacity>

      <View style={styles.footer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#8E8E93',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  mvpCard: {
    backgroundColor: '#fff',
    margin: 12,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  mvpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  mvpTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFD700',
    letterSpacing: 2,
  },
  mvpName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  mvpStats: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 24,
  },
  mvpStat: {
    alignItems: 'center',
  },
  mvpStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#007AFF',
  },
  mvpStatLabel: {
    fontSize: 11,
    color: '#8E8E93',
  },
  section: {
    backgroundColor: '#fff',
    margin: 12,
    marginTop: 0,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  performerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  performerRank: {
    fontSize: 20,
    marginRight: 12,
  },
  performerInfo: {
    flex: 1,
  },
  performerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  performerDetail: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  highlightCard: {
    backgroundColor: '#F8F8F8',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  highlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  highlightLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  highlightName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  highlightMatchup: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  highlightDetail: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  noDataText: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    paddingVertical: 8,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    margin: 12,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  footer: {
    height: 40,
  },
});
