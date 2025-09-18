import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Card } from '@rneui/themed';
import { LineChart, PieChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import { predictionApi } from '../services/predictionApi'; // Assume API service
import { TabView, SceneMap, TabBar } from '@react-native-community/tab-view';
import { styles } from '../styles/DashboardStyles';

const screenWidth = Dimensions.get('window').width;

const DemandForecastTab = ({ data }: { data: any }) => (
  <ScrollView>
    <Card containerStyle={styles.card}>
      <Text style={styles.cardTitle}>Session Demand Forecast</Text>
      <LineChart
        data={{
          labels: data.forecast?.map((f: any) => f.date) || [],
          datasets: [{ data: data.forecast?.map((f: any) => f.predictedSessions) || [], color: (opacity = 1) => `rgba(134, 65, 244, ${opacity})` }],
        }}
        width={screenWidth - 40}
        height={220}
        chartConfig={{
          backgroundColor: '#ffffff',
          backgroundGradientFrom: '#ffffff',
          backgroundGradientTo: '#ffffff',
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
          labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
          style: { borderRadius: 16 },
          propsForDots: { r: '6', strokeWidth: '2', stroke: '#ffffff' },
        }}
        bezier
        style={{ marginVertical: 8, borderRadius: 16 }}
      />
      <Text style={styles.metric}>Model Accuracy: {data.accuracy * 100}%</Text>
      <Text style={styles.explanation}>{data.explanation}</Text>
    </Card>
  </ScrollView>
);

const ChurnPredictionTab = ({ data }: { data: any }) => (
  <View>
    <Card containerStyle={styles.card}>
      <Text style={styles.cardTitle}>Player Churn Prediction</Text>
      <Text style={styles.metric}>Churn Probability: {(data.churnProbability * 100).toFixed(1)}%</Text>
      <Text style={styles.metric}>Confidence: {data.confidence * 100}%</Text>
      <Text style={styles.explanation}>{data.explanation}</Text>
      {data.recommendations?.length > 0 && (
        <View>
          <Text style={styles.subTitle}>Recommendations:</Text>
          {data.recommendations.map((rec: string, i: number) => (
            <Text key={i} style={styles.recommendation}>- {rec}</Text>
          ))}
        </View>
      )}
    </Card>
  </View>
);

const SeasonalTrendsTab = ({ data }: { data: any }) => (
  <ScrollView>
    <Card containerStyle={styles.card}>
      <Text style={styles.cardTitle}>Seasonal Trends Analysis</Text>
      <LineChart
        data={{
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
          datasets: [{ data: data.insights?.forecast || [], color: (opacity = 1) => `rgba(52, 199, 89, ${opacity})` }],
        }}
        width={screenWidth - 40}
        height={220}
        chartConfig={{
          backgroundColor: '#ffffff',
          backgroundGradientFrom: '#ffffff',
          backgroundGradientTo: '#ffffff',
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
          labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
          style: { borderRadius: 16 },
        }}
        bezier
        style={{ marginVertical: 8, borderRadius: 16 }}
      />
      <Text style={styles.metric}>Annual Growth Rate: {data.insights?.growthRate * 100}%</Text>
      <Text style={styles.subTitle}>Peak Months:</Text>
      {data.insights?.peakMonths?.map((month: number, i: number) => (
        <Text key={i} style={styles.listItem}>{new Date(0, month, 1).toLocaleString('default', { month: 'long' })}</Text>
      ))}
      <Text style={styles.explanation}>{data.explanation}</Text>
    </Card>
  </ScrollView>
);

const OptimizationTab = ({ data }: { data: any }) => (
  <ScrollView>
    <Card containerStyle={styles.card}>
      <Text style={styles.cardTitle}>Resource Optimization</Text>
      <Text style={styles.metric}>Optimized Schedule Cost: ${data.totalCost.toFixed(2)}</Text>
      <Text style={styles.subTitle}>Suggested Assignments:</Text>
      {data.optimalSchedule?.map((booking: any, i: number) => (
        <Text key={i} style={styles.listItem}>Booking {booking.id}: Court {booking.assignedCourt + 1} ({booking.startTime} - {booking.endTime})</Text>
      ))}
      <Text style={styles.explanation}>{data.explanation}</Text>
    </Card>
  </ScrollView>
);

export const PredictionDashboardScreen = () => {
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'demand', title: 'Demand Forecast' },
    { key: 'churn', title: 'Churn Prediction' },
    { key: 'seasonal', title: 'Seasonal Trends' },
    { key: 'optimization', title: 'Optimization' },
  ]);
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (type: string) => {
    try {
      setLoading(true);
      const response = await predictionApi.getPrediction(type); // Assume API method
      setData(prev => ({ ...prev, [type]: response.data }));
    } catch (err) {
      setError('Failed to load prediction data');
      Alert.alert('Error', 'Failed to load prediction data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(routes[index].key);
  }, [index]);

  const renderScene = SceneMap({
    demand: () => <DemandForecastTab data={data.demand} />,
    churn: () => <ChurnPredictionTab data={data.churn} />,
    seasonal: () => <SeasonalTrendsTab data={data.seasonal} />,
    optimization: () => <OptimizationTab data={data.optimization} />,
  });

  if (loading && !data[routes[index].key]) {
    return <ActivityIndicator size="large" style={{ flex: 1, justifyContent: 'center' }} />;
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>{error}</Text>
        <TouchableOpacity onPress={() => fetchData(routes[index].key)} style={styles.button}>
          <Text>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TabView
      navigationState={{ index, routes }}
      renderScene={renderScene}
      onIndexChange={setIndex}
      initialLayout={{ width: screenWidth }}
      renderTabBar={(props) => (
        <TabBar {...props} style={styles.tabBar} labelStyle={styles.tabLabel} />
      )}
    />
  );
};