import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { CalendarSyncOptions } from '../types/matchScheduling';

interface CalendarIntegrationUIProps {
  matchId: string;
  onSyncComplete?: (success: boolean, message: string) => void;
}

const CalendarIntegrationUI = ({ matchId, onSyncComplete }: CalendarIntegrationUIProps) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    google?: boolean;
    apple?: boolean;
    outlook?: boolean;
  }>({});

  const calendarProviders = [
    {
      id: 'google' as const,
      name: 'Google Calendar',
      icon: '📅',
      color: '#4285F4',
      description: 'Sync with Google Calendar'
    },
    {
      id: 'apple' as const,
      name: 'Apple Calendar',
      icon: '📱',
      color: '#007AFF',
      description: 'Sync with Apple Calendar'
    },
    {
      id: 'outlook' as const,
      name: 'Outlook',
      icon: '💼',
      color: '#0078D4',
      description: 'Sync with Outlook Calendar'
    },
  ];

  const handleSyncWithCalendar = async (provider: 'GOOGLE' | 'APPLE' | 'OUTLOOK') => {
    setIsSyncing(true);

    try {
      // This would normally call the API service
      // For now, we'll simulate the sync process
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call

      // Simulate success/failure randomly for demo
      const success = Math.random() > 0.3;

      if (success) {
        setSyncStatus(prev => ({ ...prev, [provider.toLowerCase()]: true }));
        const message = `Successfully synced with ${provider} Calendar`;
        Alert.alert('Success', message);
        onSyncComplete?.(true, message);
      } else {
        const message = `Failed to sync with ${provider} Calendar. Please check your permissions.`;
        Alert.alert('Sync Failed', message);
        onSyncComplete?.(false, message);
      }
    } catch (error) {
      const message = `Error syncing with ${provider} Calendar`;
      Alert.alert('Error', message);
      onSyncComplete?.(false, message);
    } finally {
      setIsSyncing(false);
    }
  };

  const showSyncOptions = (provider: typeof calendarProviders[0]) => {
    Alert.alert(
      `Sync with ${provider.name}`,
      `This will add the match to your ${provider.name}. You can set reminders and get notifications.`,
      [
        {
          text: 'Sync with Reminders',
          onPress: () => handleSyncWithCalendar(provider.id.toUpperCase() as 'GOOGLE' | 'APPLE' | 'OUTLOOK'),
        },
        {
          text: 'Sync without Reminders',
          onPress: () => {
            // Handle sync without reminders
            Alert.alert('Feature Coming Soon', 'Sync without reminders will be available in the next update.');
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const renderProviderButton = (provider: typeof calendarProviders[0]) => {
    const isSynced = syncStatus[provider.id];
    const isCurrentlySyncing = isSyncing;

    return (
      <TouchableOpacity
        key={provider.id}
        style={[
          styles.providerButton,
          { borderColor: provider.color },
          isSynced && styles.providerButtonSynced,
        ]}
        onPress={() => !isSynced && showSyncOptions(provider)}
        disabled={isCurrentlySyncing || isSynced}
      >
        <View style={styles.providerContent}>
          <Text style={styles.providerIcon}>{provider.icon}</Text>
          <View style={styles.providerTextContainer}>
            <Text style={[styles.providerName, { color: provider.color }]}>
              {provider.name}
            </Text>
            <Text style={styles.providerDescription}>
              {isSynced ? '✓ Synced' : provider.description}
            </Text>
          </View>
          {isCurrentlySyncing ? (
            <ActivityIndicator size="small" color={provider.color} />
          ) : isSynced ? (
            <Text style={[styles.syncStatus, { color: provider.color }]}>✓</Text>
          ) : (
            <Text style={styles.syncArrow}>→</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>📅</Text>
        <Text style={styles.headerTitle}>Calendar Integration</Text>
      </View>

      <Text style={styles.description}>
        Sync this match with your calendar to get reminders and keep track of your badminton schedule.
      </Text>

      <View style={styles.providersContainer}>
        {calendarProviders.map(provider => renderProviderButton(provider))}
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>📋 What happens when you sync:</Text>
        <Text style={styles.infoText}>• Match details are added to your calendar</Text>
        <Text style={styles.infoText}>• Automatic reminders 15 minutes before</Text>
        <Text style={styles.infoText}>• Easy access from your calendar app</Text>
        <Text style={styles.infoText}>• Updates sync automatically</Text>
      </View>

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          🔒 Your calendar data is secure and only used for match scheduling.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  providersContainer: {
    marginBottom: 16,
  },
  providerButton: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  providerButtonSynced: {
    backgroundColor: '#f8fff8',
    borderStyle: 'solid',
  },
  providerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  providerTextContainer: {
    flex: 1,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  providerDescription: {
    fontSize: 12,
    color: '#666',
  },
  syncStatus: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  syncArrow: {
    fontSize: 16,
    color: '#ccc',
    fontWeight: 'bold',
  },
  infoContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    paddingLeft: 8,
  },
  disclaimer: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 12,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});

export default CalendarIntegrationUI;