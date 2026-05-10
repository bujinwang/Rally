// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Dimensions, Alert,
} from 'react-native';
import { LineChart, BarChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import statisticsApi from '../services/statisticsApi';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 40;

interface Props {
  playerId: string;
  playerName: string;
  sessionId?: string;
}

type Tab = 'trends' | 'streaks' | 'percentiles' | 'leaderboard' | 'heatmap';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'trends', label: 'Trends', icon: 'trending-up' },
  { key: 'streaks', label: 'Streaks', icon: 'flame' },
  { key: 'percentiles', label: 'Rank', icon: 'trophy' },
  { key: 'leaderboard', label: 'Top', icon: 'podium' },
  { key: 'heatmap', label: 'Activity', icon: 'time' },
];

export default function TrendsDashboardScreen({ playerId, playerName, sessionId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('trends');
  const [loading, setLoading] = useState(true);

  // Trends data
  const [trends, setTrends] = useState<{ dates: string[]; winRates: number[]; matchesPlayed: number[] } | null>(null);
  // Streaks data
  const [streaks, setStreaks] = useState<any>(null);
  // Percentiles data
  const [percentiles, setPercentiles] = useState<any>(null);
  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  // Heatmap
  const [heatmap, setHeatmap] = useState<any>(null);

  useEffect(() => {
    loadAllData();
  }, [playerId, sessionId]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      if (playerId) {
        const [tData, sData, pData] = await Promise.all([
          statisticsApi.getTrends(playerId, 30).catch(() => null),
          statisticsApi.getPlayerStreaks(playerId).catch(() => null),
          statisticsApi.getPlayerPercentiles(playerId).catch(() => null),
        ]);
        if (tData?.success) setTrends(tData.data);
        if (sData?.success) setStreaks(sData.data);
        if (pData?.success) setPercentiles(pData.data);
      }

      const lbData = await statisticsApi.getLeaderboard({ limit: 10 }).catch(() => null);
      if (lbData?.success) setLeaderboard(lbData.data);

      if (sessionId) {
        const hData = await statisticsApi.getSessionHeatmap(sessionId).catch(() => null);
        if (hData?.success) setHeatmap(hData.data);
      }
    } catch (e) {
      console.warn('Failed to load stats data:', e);
    } finally {
      setLoading(false);
    }
  };

  const chartConfig = {
    backgroundColor: '#fff',
    backgroundGradientFrom: '#fff',
    backgroundGradientTo: '#f8f9fa',
    decimalCount: 0,
    color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
    labelColor: () => '#666',
    style: { borderRadius: 12 },
    propsForDots: { r: '4', strokeWidth: '2', stroke: '#007AFF' },
  };

  const renderTrendsTab = () => {
    if (!trends || !trends.dates?.length) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="analytics" size={48} color="#ccc" />
          <Text style={styles.emptyText}>No trend data yet. Play some games!</Text>
        </View>
      );
    }

    const labelDates = trends.dates.length > 7
      ? trends.dates.filter((_: string, i: number) => i % Math.ceil(trends.dates.length / 7) === 0)
      : trends.dates;

    return (
      <View>
        <Text style={styles.chartTitle}>Win Rate Over Time</Text>
        <LineChart
          data={{
            labels: labelDates.map((d: string) => d.slice(5)),
            datasets: [{ data: trends.winRates.length ? trends.winRates : [0] }],
          }}
          width={CHART_WIDTH}
          height={220}
          chartConfig={chartConfig}
          bezier
          style={styles.chart}
        />

        <Text style={styles.chartTitle}>Games Per Day</Text>
        <BarChart
          data={{
            labels: labelDates.map((d: string) => d.slice(5)),
            datasets: [{ data: trends.matchesPlayed.length ? trends.matchesPlayed : [0] }],
          }}
          width={CHART_WIDTH}
          height={200}
          yAxisLabel=""
          yAxisSuffix=""
          chartConfig={{
            ...chartConfig,
            color: (opacity = 1) => `rgba(52, 199, 89, ${opacity})`,
          }}
          style={styles.chart}
        />
      </View>
    );
  };

  const renderStreaksTab = () => {
    if (!streaks) {
      return <View style={styles.emptyState}><Text style={styles.emptyText}>No streak data</Text></View>;
    }

    return (
      <View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Current Streak</Text>
          <Text style={[styles.statValue, { color: streaks.currentStreak?.type === 'W' ? '#4CAF50' : '#F44336' }]}>
            {streaks.currentStreak?.type === 'W' ? '🔥' : '💔'} {streaks.currentStreak?.count || 0} {streaks.currentStreak?.type || 'W'}
          </Text>
        </View>

        <View style={styles.statRow}>
          <View style={[styles.statCard, styles.statCardHalf]}>
            <Text style={styles.statLabel}>Best Win Streak</Text>
            <Text style={[styles.statValue, { color: '#4CAF50' }]}>🔥 {streaks.bestWinStreak || 0}</Text>
          </View>
          <View style={[styles.statCard, styles.statCardHalf]}>
            <Text style={styles.statLabel}>Best Loss Streak</Text>
            <Text style={[styles.statValue, { color: '#F44336' }]}>💔 {streaks.bestLossStreak || 0}</Text>
          </View>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Recent Form (Last 10)</Text>
          <View style={styles.formRow}>
            {(streaks.recentForm || []).map((result: string, i: number) => (
              <View key={i} style={[styles.formBadge, result === 'W' ? styles.formWin : styles.formLoss]}>
                <Text style={[styles.formText, result === 'W' ? styles.formWinText : styles.formLossText]}>
                  {result}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  };

  const renderPercentilesTab = () => {
    if (!percentiles) {
      return <View style={styles.emptyState}><Text style={styles.emptyText}>No ranking data</Text></View>;
    }

    return (
      <View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Win Rate</Text>
          <Text style={styles.statValue}>{percentiles.winRate}%</Text>
          <View style={styles.percentileBar}>
            <View style={[styles.percentileFill, { width: `${percentiles.winRatePercentile}%`, backgroundColor: '#007AFF' }]} />
          </View>
          <Text style={styles.percentileText}>
            Better than {percentiles.winRatePercentile}% of {percentiles.totalPlayersCompared} players
          </Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Games Played</Text>
          <Text style={styles.statValue}>{percentiles.gamesPlayed}</Text>
          <View style={styles.percentileBar}>
            <View style={[styles.percentileFill, { width: `${percentiles.gamesPlayedPercentile}%`, backgroundColor: '#34C759' }]} />
          </View>
          <Text style={styles.percentileText}>
            More active than {percentiles.gamesPlayedPercentile}% of players
          </Text>
        </View>
      </View>
    );
  };

  const renderLeaderboardTab = () => {
    if (!leaderboard.length) {
      return <View style={styles.emptyState}><Text style={styles.emptyText}>No leaderboard data</Text></View>;
    }

    return (
      <View>
        {leaderboard.map((entry: any, i: number) => (
          <View key={entry.playerId || i} style={styles.lbRow}>
            <Text style={[styles.lbRank, i < 3 && { color: ['#FFD700', '#C0C0C0', '#CD7F32'][i] }]}>
              {i + 1}
            </Text>
            <View style={styles.lbInfo}>
              <Text style={styles.lbName}>{entry.playerName || 'Unknown'}</Text>
              <Text style={styles.lbMeta}>{entry.matchesPlayed}g · {Math.round(entry.winRate)}% WR</Text>
            </View>
            <Text style={styles.lbRating}>{entry.performanceRating || 0}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderHeatmapTab = () => {
    if (!heatmap) {
      return <View style={styles.emptyState}><Text style={styles.emptyText}>No activity data</Text></View>;
    }

    const maxGames = Math.max(...heatmap.hourlyActivity?.map((h: any) => h.games) || [1]);

    return (
      <View>
        <Text style={styles.chartTitle}>Hourly Activity</Text>
        <BarChart
          data={{
            labels: heatmap.hourlyActivity?.filter((_: any, i: number) => i % 3 === 0).map((h: any) => `${h.hour}h`) || [],
            datasets: [{ data: heatmap.hourlyActivity?.filter((_: any, i: number) => i % 3 === 0).map((h: any) => h.games) || [0] }],
          }}
          width={CHART_WIDTH}
          height={200}
          yAxisLabel=""
          yAxisSuffix=""
          chartConfig={{
            ...chartConfig,
            color: (opacity = 1) => `rgba(255, 149, 0, ${opacity})`,
          }}
          style={styles.chart}
        />

        {heatmap.courts?.length > 0 && (
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Court Usage</Text>
            {heatmap.courts.map((court: any) => (
              <View key={court.name} style={styles.courtRow}>
                <Text style={styles.courtName}>{court.name}</Text>
                <View style={styles.courtBarBg}>
                  <View style={[styles.courtBarFill, { flex: court.gamesPlayed }]} />
                </View>
                <Text style={styles.courtCount}>{court.gamesPlayed}g · {court.totalDuration}m</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading stats...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📊 {playerName || 'Player'} Stats</Text>
      </View>

      {/* Tab Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon as any}
              size={16}
              color={activeTab === tab.key ? '#007AFF' : '#999'}
            />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'trends' && renderTrendsTab()}
        {activeTab === 'streaks' && renderStreaksTab()}
        {activeTab === 'percentiles' && renderPercentilesTab()}
        {activeTab === 'leaderboard' && renderLeaderboardTab()}
        {activeTab === 'heatmap' && renderHeatmapTab()}
      </View>

      <TouchableOpacity style={styles.refreshBtn} onPress={loadAllData}>
        <Ionicons name="refresh" size={18} color="#007AFF" />
        <Text style={styles.refreshText}>Refresh</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  loadingText: { marginTop: 12, fontSize: 16, color: '#666' },
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  tabBar: { backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  tab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, gap: 4, backgroundColor: '#f5f5f5' },
  tabActive: { backgroundColor: '#E3F2FD' },
  tabText: { fontSize: 13, color: '#999', fontWeight: '500' },
  tabTextActive: { color: '#007AFF', fontWeight: '600' },
  content: { padding: 16 },
  chartTitle: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 16 },
  chart: { borderRadius: 12, marginBottom: 8 },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 15, color: '#999', marginTop: 12 },
  statCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  statCardHalf: { flex: 1 },
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statLabel: { fontSize: 13, color: '#999', fontWeight: '500', marginBottom: 4 },
  statValue: { fontSize: 28, fontWeight: 'bold', color: '#333' },
  percentileBar: { height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, marginTop: 8, overflow: 'hidden' },
  percentileFill: { height: '100%', borderRadius: 4 },
  percentileText: { fontSize: 12, color: '#999', marginTop: 6 },
  formRow: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  formBadge: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  formWin: { backgroundColor: '#E8F5E9' },
  formLoss: { backgroundColor: '#FFEBEE' },
  formWinText: { color: '#2E7D32', fontWeight: 'bold', fontSize: 14 },
  formLossText: { color: '#C62828', fontWeight: 'bold', fontSize: 14 },
  formText: { fontWeight: 'bold', fontSize: 14 },
  lbRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6 },
  lbRank: { fontSize: 20, fontWeight: 'bold', color: '#999', width: 36, textAlign: 'center' },
  lbInfo: { flex: 1, marginLeft: 8 },
  lbName: { fontSize: 15, fontWeight: '600', color: '#333' },
  lbMeta: { fontSize: 12, color: '#999' },
  lbRating: { fontSize: 16, fontWeight: '700', color: '#007AFF' },
  courtRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  courtName: { fontSize: 13, color: '#333', width: 70 },
  courtBarBg: { flex: 1, height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, flexDirection: 'row', overflow: 'hidden' },
  courtBarFill: { backgroundColor: '#FF9500', height: '100%', borderRadius: 4 },
  courtCount: { fontSize: 12, color: '#999', width: 80, textAlign: 'right' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 6 },
  refreshText: { color: '#007AFF', fontSize: 14, fontWeight: '500' },
});
