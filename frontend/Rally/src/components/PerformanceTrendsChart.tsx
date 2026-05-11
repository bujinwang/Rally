import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import statisticsApi from '../services/statisticsApi';
import { PerformanceTrend } from '../types/statistics';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 40;
const CHART_HEIGHT = 180;

interface PerformanceTrendsChartProps {
  playerId: string;
  playerName: string;
}

type TimeRange = '7d' | '30d' | '90d';

export const PerformanceTrendsChart: React.FC<PerformanceTrendsChartProps> = ({
  playerId,
  playerName,
}) => {
  const [trends, setTrends] = useState<PerformanceTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState<TimeRange>('30d');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTrends();
  }, [playerId, selectedRange]);

  const fetchTrends = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await statisticsApi.getTrends(playerId, parseInt(selectedRange));
      setTrends(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load trends');
    } finally {
      setLoading(false);
    }
  };

  const renderChart = () => {
    if (!trends || !trends.data || trends.data.length === 0) {
      return (
        <View style={styles.emptyChart}>
          <Ionicons name="analytics-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>No trend data available</Text>
          <Text style={styles.emptySubtext}>
            Play more matches to see your performance trends
          </Text>
        </View>
      );
    }

    const dataPoints = trends.data;
    const maxWinRate = Math.max(...dataPoints.map(d => d.winRate), 100);
    const minWinRate = Math.min(...dataPoints.map(d => d.winRate), 0);
    const range = maxWinRate - minWinRate || 1;

    // Build SVG-like chart using Views
    const barWidth = Math.max(4, (CHART_WIDTH - 40) / dataPoints.length - 4);

    return (
      <View style={styles.chartContainer}>
        {/* Y-axis labels */}
        <View style={styles.yAxis}>
          <Text style={styles.yAxisLabel}>{maxWinRate.toFixed(0)}%</Text>
          <Text style={styles.yAxisLabel}>{((maxWinRate + minWinRate) / 2).toFixed(0)}%</Text>
          <Text style={styles.yAxisLabel}>{minWinRate.toFixed(0)}%</Text>
        </View>

        {/* Chart area */}
        <View style={styles.chartArea}>
          {/* Grid lines */}
          <View style={[styles.gridLine, { top: 0 }]} />
          <View style={[styles.gridLine, { top: CHART_HEIGHT / 2 }]} />
          <View style={[styles.gridLine, { bottom: 0 }]} />

          {/* Bars */}
          <View style={styles.barsContainer}>
            {dataPoints.map((point, index) => {
              const normalizedHeight = ((point.winRate - minWinRate) / range) * CHART_HEIGHT;
              const barHeight = Math.max(2, normalizedHeight);
              const isWin = point.winRate >= 50;

              return (
                <View key={index} style={styles.barWrapper}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: barHeight,
                        width: barWidth,
                        backgroundColor: isWin ? '#4CAF50' : '#FF5252',
                      },
                    ]}
                  />
                  <Text style={styles.barLabel} numberOfLines={1}>
                    {new Date(point.date).getDate()}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  const getTrendIcon = () => {
    if (!trends) return 'remove';
    switch (trends.trend) {
      case 'improving': return 'trending-up';
      case 'declining': return 'trending-down';
      default: return 'remove';
    }
  };

  const getTrendColor = () => {
    if (!trends) return '#9E9E9E';
    switch (trends.trend) {
      case 'improving': return '#4CAF50';
      case 'declining': return '#FF5252';
      default: return '#9E9E9E';
    }
  };

  const getTrendLabel = () => {
    if (!trends) return 'No data';
    switch (trends.trend) {
      case 'improving': return 'Improving';
      case 'declining': return 'Declining';
      default: return 'Stable';
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Performance Trends</Text>
          <Text style={styles.subtitle}>{playerName}</Text>
        </View>
        <View style={[styles.trendBadge, { backgroundColor: getTrendColor() + '20' }]}>
          <Ionicons name={getTrendIcon()} size={16} color={getTrendColor()} />
          <Text style={[styles.trendText, { color: getTrendColor() }]}>
            {getTrendLabel()}
          </Text>
        </View>
      </View>

      {/* Time range selector */}
      <View style={styles.rangeSelector}>
        {(['7d', '30d', '90d'] as TimeRange[]).map(range => (
          <TouchableOpacity
            key={range}
            style={[
              styles.rangeButton,
              selectedRange === range && styles.rangeButtonActive,
            ]}
            onPress={() => setSelectedRange(range)}
          >
            <Text
              style={[
                styles.rangeButtonText,
                selectedRange === range && styles.rangeButtonTextActive,
              ]}
            >
              {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary stats */}
      {trends && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{trends.totalMatches}</Text>
            <Text style={styles.summaryLabel}>Matches</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {(trends.averageWinRate * 100).toFixed(0)}%
            </Text>
            <Text style={styles.summaryLabel}>Avg Win Rate</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {trends.data.length > 0
                ? Math.max(...trends.data.map(d => d.performanceRating)).toFixed(0)
                : '—'}
            </Text>
            <Text style={styles.summaryLabel}>Peak Rating</Text>
          </View>
        </View>
      )}

      {/* Chart */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Loading trends...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={32} color="#FF5252" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchTrends}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        renderChart()
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '600',
  },
  rangeSelector: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 3,
    marginBottom: 16,
  },
  rangeButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  rangeButtonActive: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  rangeButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  rangeButtonTextActive: {
    color: '#2196F3',
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  chartContainer: {
    flexDirection: 'row',
    height: CHART_HEIGHT + 30,
  },
  yAxis: {
    width: 35,
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  yAxisLabel: {
    fontSize: 10,
    color: '#999',
    textAlign: 'right',
  },
  chartArea: {
    flex: 1,
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: CHART_HEIGHT,
    paddingHorizontal: 4,
  },
  barWrapper: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: CHART_HEIGHT + 20,
  },
  bar: {
    borderRadius: 2,
    minHeight: 2,
  },
  barLabel: {
    fontSize: 8,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  emptyChart: {
    height: CHART_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 4,
  },
  loadingContainer: {
    height: CHART_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#999',
    marginTop: 8,
  },
  errorContainer: {
    height: CHART_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    color: '#FF5252',
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  retryText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
});
