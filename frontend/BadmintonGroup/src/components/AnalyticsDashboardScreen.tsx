import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSessionAnalyticsDashboard, exportAnalyticsData } from '../services/analyticsApi';
import { AnalyticsDashboardData } from '../types/analytics';

interface AnalyticsDashboardScreenProps {
  navigation: any;
}

const AnalyticsDashboardScreen: React.FC<AnalyticsDashboardScreenProps> = ({ navigation }) => {
  const [dashboardData, setDashboardData] = useState<AnalyticsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate: new Date(),
  });

  useEffect(() => {
    loadDashboardData();
  }, [dateRange]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await getSessionAnalyticsDashboard(dateRange.startDate, dateRange.endDate);

      if (response.success && response.data) {
        setDashboardData(response.data);
      } else {
        setError(response.error || 'Failed to load analytics data');
      }
    } catch (err) {
      setError('Failed to load analytics data');
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportData = async () => {
    try {
      const csvData = await exportAnalyticsData(dateRange.startDate, dateRange.endDate, 'csv');

      // For React Native, we'll use the Share API to share the CSV data
      await Share.share({
        message: 'Session Analytics Data',
        url: csvData, // This would be a file URL in a real implementation
      });
    } catch (err) {
      Alert.alert('Export Failed', 'Failed to export analytics data');
    }
  };

  const renderSummaryCards = () => {
    if (!dashboardData?.summary) return null;

    const { summary } = dashboardData;

    return (
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{summary.totalSessions}</Text>
          <Text style={styles.summaryLabel}>Total Sessions</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{summary.totalPlayers}</Text>
          <Text style={styles.summaryLabel}>Total Players</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{summary.avgAttendance.toFixed(1)}</Text>
          <Text style={styles.summaryLabel}>Avg Attendance</Text>
        </View>
      </View>
    );
  };

  const renderTrendsChart = () => {
    if (!dashboardData?.trends?.data) return null;

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Session Attendance Trends</Text>
        <View style={styles.simpleChart}>
          {dashboardData.trends.data.slice(-7).map((trend: any, index: number) => (
            <View key={index} style={styles.chartBar}>
              <View
                style={[
                  styles.barFill,
                  { height: Math.max((trend.avgAttendance / 10) * 100, 20) }
                ]}
              />
              <Text style={styles.barLabel}>{new Date(trend.date).getDate()}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderParticipationChart = () => {
    if (!dashboardData?.participation?.frequencyDistribution) return null;

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Player Participation Frequency</Text>
        <View style={styles.participationContainer}>
          {dashboardData.participation.frequencyDistribution.map((item: any, index: number) => (
            <View key={index} style={styles.participationItem}>
              <Text style={styles.participationLabel}>{item.range}</Text>
              <View style={styles.participationBar}>
                <View
                  style={[
                    styles.participationFill,
                    { width: `${item.percentage}%` }
                  ]}
                />
              </View>
              <Text style={styles.participationValue}>{item.count}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderGeographyList = () => {
    if (!dashboardData?.geography?.topLocations) return null;

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Top Locations</Text>
        {dashboardData.geography.topLocations.slice(0, 5).map((location: any, index: number) => (
          <View key={index} style={styles.locationItem}>
            <Text style={styles.locationName}>{location.location}</Text>
            <Text style={styles.locationStats}>
              {location.sessions} sessions, {location.players} players
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderSessionTypesChart = () => {
    if (!dashboardData?.sessionTypes) return null;

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Session Types</Text>
        {dashboardData.sessionTypes.map((type: any, index: number) => (
          <View key={index} style={styles.sessionTypeItem}>
            <Text style={styles.sessionTypeName}>{type.type || 'Casual'}</Text>
            <Text style={styles.sessionTypeStats}>
              {type.sessions} sessions ({type.avgPlayers.toFixed(1)} avg players)
            </Text>
          </View>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading Analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadDashboardData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>Session Analytics</Text>
          <TouchableOpacity style={styles.exportButton} onPress={handleExportData}>
            <Text style={styles.exportButtonText}>Export Data</Text>
          </TouchableOpacity>
        </View>

        {renderSummaryCards()}
        {renderTrendsChart()}
        {renderParticipationChart()}
        {renderGeographyList()}
        {renderSessionTypesChart()}

        <View style={styles.footer}>
          <Text style={styles.lastUpdated}>
            Last updated: {dashboardData?.generatedAt ? new Date(dashboardData.generatedAt).toLocaleString() : 'Unknown'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  exportButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  exportButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  chartContainer: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  simpleChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 150,
    justifyContent: 'space-between',
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  barFill: {
    backgroundColor: '#007AFF',
    width: 20,
    borderRadius: 4,
    minHeight: 20,
  },
  barLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
  },
  participationContainer: {
    paddingVertical: 8,
  },
  participationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  participationLabel: {
    width: 80,
    fontSize: 12,
    color: '#666',
  },
  participationBar: {
    flex: 1,
    height: 20,
    backgroundColor: '#e0e0e0',
    borderRadius: 10,
    marginHorizontal: 8,
  },
  participationFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 10,
  },
  participationValue: {
    width: 40,
    fontSize: 12,
    color: '#333',
    textAlign: 'right',
  },
  locationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  locationName: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  locationStats: {
    fontSize: 12,
    color: '#666',
  },
  sessionTypeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sessionTypeName: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  sessionTypeStats: {
    fontSize: 12,
    color: '#666',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  lastUpdated: {
    fontSize: 12,
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#ff4444',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default AnalyticsDashboardScreen;