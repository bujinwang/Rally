import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

export default function MoreScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.subtitle}>Additional features coming soon!</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🚀 Coming Soon</Text>
        <View style={styles.featureItem}>
          <Text style={styles.featureTitle}>⚙️ Settings</Text>
          <Text style={styles.featureDescription}>App preferences and configuration</Text>
        </View>
        
        <View style={styles.featureItem}>
          <Text style={styles.featureTitle}>👤 Profile</Text>
          <Text style={styles.featureDescription}>Manage your player profile</Text>
        </View>
        
        <View style={styles.featureItem}>
          <Text style={styles.featureTitle}>📊 Statistics</Text>
          <Text style={styles.featureDescription}>View your game statistics</Text>
        </View>
        
        <View style={styles.featureItem}>
          <Text style={styles.featureTitle}>🏆 Achievements</Text>
          <Text style={styles.featureDescription}>Track your badminton achievements</Text>
        </View>
      </View>

      <View style={styles.mvpSection}>
        <Text style={styles.mvpTitle}>🏸 MVP Features</Text>
        <Text style={styles.mvpText}>
          This is the MVP version of the Badminton Group app. 
          Current features include session creation, sharing, and management without requiring user accounts.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  section: {
    backgroundColor: 'white',
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  featureItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#666',
  },
  mvpSection: {
    backgroundColor: '#E3F2FD',
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 10,
  },
  mvpTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1565C0',
    marginBottom: 10,
  },
  mvpText: {
    fontSize: 14,
    color: '#1565C0',
    lineHeight: 20,
  },
});