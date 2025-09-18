import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { socialApi, PrivacySettings } from '../services/socialApi';

interface PrivacySettingsScreenProps {
  onSettingsUpdated?: (settings: PrivacySettings) => void;
}

export default function PrivacySettingsScreen({
  onSettingsUpdated,
}: PrivacySettingsScreenProps) {
  const [settings, setSettings] = useState<PrivacySettings>({
    session_share: 'public',
    stats_share: 'friends',
    achievements_share: 'public',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await socialApi.getPrivacySettings();
      if (response.success && response.data) {
        setSettings(response.data);
      }
    } catch (error) {
      console.error('Failed to load privacy settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const response = await socialApi.updatePrivacySettings(settings);

      if (response.success) {
        Alert.alert('Success', 'Privacy settings updated successfully');
        onSettingsUpdated?.(settings);
      } else {
        throw new Error(response.error?.message || 'Failed to update settings');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save privacy settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof PrivacySettings, value: string) => {
    setSettings(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const privacyOptions = [
    { value: 'public', label: 'Public', description: 'Anyone can see' },
    { value: 'friends', label: 'Friends Only', description: 'Only friends can see' },
    { value: 'private', label: 'Private', description: 'Only you can see' },
  ];

  const settingItems = [
    {
      key: 'session_share' as keyof PrivacySettings,
      title: 'Session Sharing',
      description: 'Who can see when you share badminton sessions',
      icon: 'calendar',
    },
    {
      key: 'stats_share' as keyof PrivacySettings,
      title: 'Statistics Sharing',
      description: 'Who can see your match statistics and performance',
      icon: 'stats-chart',
    },
    {
      key: 'achievements_share' as keyof PrivacySettings,
      title: 'Achievement Sharing',
      description: 'Who can see your badges and achievements',
      icon: 'trophy',
    },
  ];

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading privacy settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Privacy Settings</Text>
        <Text style={styles.subtitle}>
          Control who can see your shared content and activities
        </Text>
      </View>

      {settingItems.map((item) => (
        <View key={item.key} style={styles.settingSection}>
          <View style={styles.settingHeader}>
            <View style={styles.settingIcon}>
              <Ionicons name={item.icon as any} size={24} color="#007AFF" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>{item.title}</Text>
              <Text style={styles.settingDescription}>{item.description}</Text>
            </View>
          </View>

          <View style={styles.optionsContainer}>
            {privacyOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionButton,
                  settings[item.key] === option.value && styles.optionButtonSelected,
                ]}
                onPress={() => updateSetting(item.key, option.value)}
              >
                <View style={styles.optionContent}>
                  <Text
                    style={[
                      styles.optionLabel,
                      settings[item.key] === option.value && styles.optionLabelSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.optionDescription,
                      settings[item.key] === option.value && styles.optionDescriptionSelected,
                    ]}
                  >
                    {option.description}
                  </Text>
                </View>
                {settings[item.key] === option.value && (
                  <Ionicons name="checkmark-circle" size={20} color="#007AFF" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <View style={styles.infoSection}>
        <Ionicons name="information-circle" size={20} color="#666" />
        <Text style={styles.infoText}>
          Your privacy settings apply to all future shares. Existing shares may still be visible to others.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={saveSettings}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <>
            <Ionicons name="save" size={20} color="white" style={styles.saveIcon} />
            <Text style={styles.saveButtonText}>Save Settings</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  settingSection: {
    backgroundColor: 'white',
    marginHorizontal: 10,
    marginBottom: 10,
    borderRadius: 12,
    padding: 15,
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  settingIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f0f7ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  optionsContainer: {
    gap: 10,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: 'white',
  },
  optionButtonSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#f0f7ff',
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  optionLabelSelected: {
    color: '#007AFF',
  },
  optionDescription: {
    fontSize: 14,
    color: '#666',
  },
  optionDescriptionSelected: {
    color: '#007AFF',
  },
  infoSection: {
    flexDirection: 'row',
    backgroundColor: '#fff3cd',
    marginHorizontal: 10,
    marginBottom: 20,
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  infoText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    marginHorizontal: 20,
    marginBottom: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveIcon: {
    marginRight: 8,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});