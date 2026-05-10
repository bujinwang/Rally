import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';

export default function MoreScreen() {
  const navigation = useNavigation();
  const isAuthenticated = useSelector((state: any) => state.auth.isAuthenticated);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.subtitle}>Additional features and settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>👤 Account</Text>
        
        {isAuthenticated ? (
          <View style={styles.accountInfo}>
            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
            <Text style={styles.accountText}>Signed in</Text>
          </View>
        ) : (
          <View>
            <Text style={styles.authPrompt}>
              Sign in to unlock notifications, match history, achievements, and more.
            </Text>
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => (navigation as any).navigate('Login')}
            >
              <Ionicons name="log-in" size={20} color="#fff" />
              <Text style={styles.loginButtonText}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.registerButton}
              onPress={() => (navigation as any).navigate('Register')}
            >
              <Ionicons name="person-add" size={20} color="#007AFF" />
              <Text style={styles.registerButtonText}>Create Account</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🚀 Features</Text>
        <View style={styles.featureItem}>
          <Text style={styles.featureTitle}>📊 Statistics</Text>
          <Text style={styles.featureDescription}>View your game statistics and trends</Text>
        </View>
        <View style={styles.featureItem}>
          <Text style={styles.featureTitle}>🏆 Achievements</Text>
          <Text style={styles.featureDescription}>Track your badminton achievements</Text>
        </View>
        <View style={styles.featureItem}>
          <Text style={styles.featureTitle}>🔔 Notifications</Text>
          <Text style={styles.featureDescription}>Get notified when it's your turn</Text>
        </View>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>💡 Drop-in Friendly</Text>
        <Text style={styles.infoText}>
          No account needed to play! Just enter your name and join any session. 
          Sign up when you're ready for more features.
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
  authPrompt: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    gap: 8,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  registerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    gap: 8,
  },
  registerButtonText: {
    color: '#1565C0',
    fontSize: 16,
    fontWeight: '600',
  },
  accountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accountText: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
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
  infoSection: {
    backgroundColor: '#E3F2FD',
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 40,
    borderRadius: 10,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1565C0',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#1565C0',
    lineHeight: 20,
  },
});
