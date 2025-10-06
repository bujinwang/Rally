import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

interface PlayerStatistics {
  name: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  matchesPlayed: number;
  matchWins: number;
  matchLosses: number;
  matchWinRate: number;
  totalSetsWon: number;
  totalSetsLost: number;
  totalPlayTime: number;
  averageGameDuration: number;
  partnershipStats?: Record<string, any>;
}

interface StatisticsCardProps {
  player: PlayerStatistics;
  rank?: number;
  showDetailedStats?: boolean;
}

export const StatisticsCard: React.FC<StatisticsCardProps> = ({
  player,
  rank,
  showDetailedStats = false
}) => {
  const getRankDisplay = () => {
    if (!rank) return null;
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const formatPlayTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getPerformanceLevel = (winRate: number): { color: string; label: string } => {
    if (winRate >= 0.7) return { color: '#4CAF50', label: 'Excellent' };
    if (winRate >= 0.5) return { color: '#2196F3', label: 'Good' };
    if (winRate >= 0.3) return { color: '#FF9800', label: 'Fair' };
    return { color: '#FF5252', label: 'Needs Work' };
  };

  const performance = getPerformanceLevel(player.winRate);
  const setsDiff = player.totalSetsWon - player.totalSetsLost;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {rank && (
          <Text style={styles.rankBadge}>{getRankDisplay()}</Text>
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.playerName}>{player.name}</Text>
          <View style={styles.performanceTag}>
            <View style={[styles.performanceDot, { backgroundColor: performance.color }]} />
            <Text style={[styles.performanceText, { color: performance.color }]}>
              {performance.label}
            </Text>
          </View>
        </View>
      </View>

      {/* Main Stats Grid */}
      <View style={styles.mainStats}>
        {/* Games */}
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{player.gamesPlayed}</Text>
          <Text style={styles.statLabel}>Games</Text>
          <Text style={styles.statSubtext}>
            {player.wins}W - {player.losses}L
          </Text>
        </View>

        {/* Game Win Rate */}
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: performance.color }]}>
            {(player.winRate * 100).toFixed(0)}%
          </Text>
          <Text style={styles.statLabel}>Game Win %</Text>
          <Text style={styles.statSubtext}>Win Rate</Text>
        </View>

        {/* Matches */}
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{player.matchesPlayed}</Text>
          <Text style={styles.statLabel}>Matches</Text>
          <Text style={styles.statSubtext}>
            {player.matchWins}W - {player.matchLosses}L
          </Text>
        </View>

        {/* Match Win Rate */}
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: performance.color }]}>
            {(player.matchWinRate * 100).toFixed(0)}%
          </Text>
          <Text style={styles.statLabel}>Match Win %</Text>
          <Text style={styles.statSubtext}>Best of 3</Text>
        </View>
      </View>

      {/* Detailed Stats */}
      {showDetailedStats && (
        <View style={styles.detailedStats}>
          {/* Sets Performance */}
          <View style={styles.detailedSection}>
            <Text style={styles.sectionTitle}>Sets Performance</Text>
            <View style={styles.detailedRow}>
              <Text style={styles.detailedLabel}>Sets Won:</Text>
              <Text style={styles.detailedValue}>{player.totalSetsWon}</Text>
            </View>
            <View style={styles.detailedRow}>
              <Text style={styles.detailedLabel}>Sets Lost:</Text>
              <Text style={styles.detailedValue}>{player.totalSetsLost}</Text>
            </View>
            <View style={styles.detailedRow}>
              <Text style={styles.detailedLabel}>Differential:</Text>
              <Text style={[
                styles.detailedValue,
                { color: setsDiff >= 0 ? '#4CAF50' : '#FF5252' }
              ]}>
                {setsDiff >= 0 ? '+' : ''}{setsDiff}
              </Text>
            </View>
          </View>

          {/* Time Stats */}
          <View style={styles.detailedSection}>
            <Text style={styles.sectionTitle}>Time Statistics</Text>
            <View style={styles.detailedRow}>
              <Text style={styles.detailedLabel}>Total Play Time:</Text>
              <Text style={styles.detailedValue}>
                {formatPlayTime(player.totalPlayTime)}
              </Text>
            </View>
            <View style={styles.detailedRow}>
              <Text style={styles.detailedLabel}>Avg Game Duration:</Text>
              <Text style={styles.detailedValue}>
                {player.averageGameDuration.toFixed(0)} min
              </Text>
            </View>
          </View>

          {/* Consistency Metrics */}
          <View style={styles.detailedSection}>
            <Text style={styles.sectionTitle}>Consistency</Text>
            <View style={styles.detailedRow}>
              <Text style={styles.detailedLabel}>Games per Match:</Text>
              <Text style={styles.detailedValue}>
                {(player.gamesPlayed / Math.max(player.matchesPlayed, 1)).toFixed(1)}
              </Text>
            </View>
            <View style={styles.detailedRow}>
              <Text style={styles.detailedLabel}>Sets per Game:</Text>
              <Text style={styles.detailedValue}>
                {((player.totalSetsWon + player.totalSetsLost) / Math.max(player.gamesPlayed, 1)).toFixed(1)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Quick Stats Bar */}
      {!showDetailedStats && (
        <View style={styles.quickStats}>
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatLabel}>Sets</Text>
            <Text style={styles.quickStatValue}>
              {player.totalSetsWon}-{player.totalSetsLost}
            </Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatLabel}>Play Time</Text>
            <Text style={styles.quickStatValue}>
              {formatPlayTime(player.totalPlayTime)}
            </Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatLabel}>Avg Duration</Text>
            <Text style={styles.quickStatValue}>
              {player.averageGameDuration.toFixed(0)}m
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  rankBadge: {
    fontSize: 32,
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  performanceTag: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  performanceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  performanceText: {
    fontSize: 13,
    fontWeight: '600',
  },
  mainStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 12,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 2,
  },
  statSubtext: {
    fontSize: 11,
    color: '#999',
  },
  detailedStats: {
    marginTop: 8,
  },
  detailedSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 8,
  },
  detailedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#F8F9FA',
    borderRadius: 6,
    marginBottom: 4,
  },
  detailedLabel: {
    fontSize: 13,
    color: '#666',
  },
  detailedValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  quickStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  quickStatItem: {
    alignItems: 'center',
  },
  quickStatLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  quickStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  quickStatDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
  },
});
