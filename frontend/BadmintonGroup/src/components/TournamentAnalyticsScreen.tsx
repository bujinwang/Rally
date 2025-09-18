import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { tournamentApi } from '../services/tournamentApi'; // Assume API service
import { Card, Icon } from 'react-native-elements';
import { LineChart, BarChart } from 'react-native-chart-kit'; // Assume chart library installed
import { Dimensions } from 'react-native';

const screenWidth = Dimensions.get('window').width;

interface AnalyticsData {
  totalRegistered: number;
  participationRate: number;
  completionRate: number;
  matchesCompleted: number;
  totalMatches: number;
  bracketEfficiency: number;
  averageUpsets: number;
  rankingChanges: Array<{
    playerId: string;
    finalRank: number;
    wins: number;
    totalMatches: number;
    winRate: number;
    pointsGained: number;
  }>;
}

const TournamentAnalyticsScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { tournamentId, tournamentName } = route.params as { tournamentId: string; tournamentName: string };

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, [tournamentId]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await tournamentApi.getTournamentAnalytics(tournamentId);
      setAnalytics(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load analytics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Tournament Analytics...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={fetchAnalytics} style={styles.retryButton}>
          <Text>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!analytics) {
    return (
      <View style={styles.errorContainer}>
        <Text>No analytics data available</Text>
      </View>
    );
  }

  // Prepare chart data
  const rankingData = {
    labels: analytics.rankingChanges.slice(0, 5).map((_, i) => `P${i + 1}`),
    datasets: [
      {
        data: analytics.rankingChanges.slice(0, 5).map(r => r.winRate * 100),
      },
    ],
  };

  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 2,
    color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: {
      r: '6',
      strokeWidth: '2',
      stroke: '#007AFF',
    },
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" type="ionicon" />
        </TouchableOpacity>
        <Text style={styles.title}>{tournamentName} Analytics</Text>
      </View>

      <Card containerStyle={styles.card}>
        <Text style={styles.cardTitle}>Participation Metrics</Text>
        <Text>Registered: {analytics.totalRegistered}</Text>
        <Text>Participation Rate: {(analytics.participationRate * 100).toFixed(1)}%</Text>
        <Text>Matches Completed: {analytics.matchesCompleted} / {analytics.totalMatches}</Text>
      </Card>

      <Card containerStyle={styles.card}>
        <Text style={styles.cardTitle}>Bracket Performance</Text>
        <Text>Completion Rate: {(analytics.completionRate * 100).toFixed(1)}%</Text>
        <Text>Bracket Efficiency: {(analytics.bracketEfficiency * 100).toFixed(1)}%</Text>
        <Text>Average Upsets: {analytics.averageUpsets.toFixed(2)}</Text>
      </Card>

      <Card containerStyle={styles.card}>
        <Text style={styles.cardTitle}>Top Player Performance</Text>
        <BarChart
          data={rankingData}
          width={screenWidth - 40}
          height={220}
          yAxisLabel=""
          chartConfig={chartConfig}
          showValuesOnTopOfBars
          withInnerLines={false}
          style={styles.chart}
        />
      </Card>

      <Card containerStyle={styles.card}>
        <Text style={styles.cardTitle}>Ranking Changes</Text>
        {analytics.rankingChanges.slice(0, 5).map((change, index) => (
          <View key={change.playerId} style={styles.rankingItem}>
            <Text>{index + 1}. Win Rate: {(change.winRate * 100).toFixed(1)}% (Rank: {change.finalRank})</Text>
          </View>
        ))}
      </Card>

      <TouchableOpacity style={styles.refreshButton} onPress={fetchAnalytics}>
        <Text style={styles.refreshText}>Refresh Analytics</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  card: {
    margin: 8,
    padding: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  rankingItem: {
    paddingVertical: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
  },
  refreshButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  refreshText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default TournamentAnalyticsScreen;