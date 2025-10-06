import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { userApi, UserSettings } from '../services/userApi';
import { Ionicons } from '@expo/vector-icons';

interface RouteParams {
  userId: string;
}

export default function SettingsScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { userId } = route.params as RouteParams;

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [userId]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await userApi.getUserSettings(userId);
      setSettings(data);
    } catch (error) {
      console.error('Error loading settings:', error);
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = (category: 'privacySettings' | 'notificationSettings', key: string, value: any) => {
    if (!settings) return;

    setSettings({
      ...settings,
      [category]: {
        ...settings[category],
        [key]: value
      }
    });
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      await userApi.updateSettings(userId, settings);
      Alert.alert('Success', 'Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#999" />
        <Text style={styles.errorText}>Failed to load settings</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadSettings}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Privacy Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy Settings</Text>
        
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Profile Visibility</Text>
            <Text style={styles.settingDescription}>
              {settings.privacySettings.profileVisibility === 'public' 
                ? 'Anyone can view your profile' 
                : settings.privacySettings.profileVisibility === 'friends'
                ? 'Only friends can view your profile'
                : 'Only you can view your profile'}
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.pickerButton}
            onPress={() => {
              const options = ['public', 'friends', 'private'];
              const current = settings.privacySettings.profileVisibility;
              const currentIndex = options.indexOf(current);
              const nextIndex = (currentIndex + 1) % options.length;
              updateSetting('privacySettings', 'profileVisibility', options[nextIndex]);
            }}
          >
            <Text style={styles.pickerButtonText}>
              {settings.privacySettings.profileVisibility}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#007AFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Show Email</Text>
            <Text style={styles.settingDescription}>Display email on profile</Text>
          </View>
          <Switch
            value={settings.privacySettings.showEmail}
            onValueChange={(value) => updateSetting('privacySettings', 'showEmail', value)}
            trackColor={{ false: '#ccc', true: '#007AFF' }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Show Phone</Text>
            <Text style={styles.settingDescription}>Display phone on profile</Text>
          </View>
          <Switch
            value={settings.privacySettings.showPhone}
            onValueChange={(value) => updateSetting('privacySettings', 'showPhone', value)}
            trackColor={{ false: '#ccc', true: '#007AFF' }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Show Statistics</Text>
            <Text style={styles.settingDescription}>Display game stats on profile</Text>
          </View>
          <Switch
            value={settings.privacySettings.showStats}
            onValueChange={(value) => updateSetting('privacySettings', 'showStats', value)}
            trackColor={{ false: '#ccc', true: '#007AFF' }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Show Location</Text>
            <Text style={styles.settingDescription}>Display location on profile</Text>
          </View>
          <Switch
            value={settings.privacySettings.showLocation}
            onValueChange={(value) => updateSetting('privacySettings', 'showLocation', value)}
            trackColor={{ false: '#ccc', true: '#007AFF' }}
          />
        </View>
      </View>

      {/* Notification Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notification Settings</Text>
        
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Friend Requests</Text>
            <Text style={styles.settingDescription}>Notify when someone sends a friend request</Text>
          </View>
          <Switch
            value={settings.notificationSettings.friendRequests}
            onValueChange={(value) => updateSetting('notificationSettings', 'friendRequests', value)}
            trackColor={{ false: '#ccc', true: '#007AFF' }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Messages</Text>
            <Text style={styles.settingDescription}>Notify when you receive a message</Text>
          </View>
          <Switch
            value={settings.notificationSettings.messages}
            onValueChange={(value) => updateSetting('notificationSettings', 'messages', value)}
            trackColor={{ false: '#ccc', true: '#007AFF' }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Session Invites</Text>
            <Text style={styles.settingDescription}>Notify when invited to a session</Text>
          </View>
          <Switch
            value={settings.notificationSettings.sessionInvites}
            onValueChange={(value) => updateSetting('notificationSettings', 'sessionInvites', value)}
            trackColor={{ false: '#ccc', true: '#007AFF' }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Match Results</Text>
            <Text style={styles.settingDescription}>Notify when match results are recorded</Text>
          </View>
          <Switch
            value={settings.notificationSettings.matchResults}
            onValueChange={(value) => updateSetting('notificationSettings', 'matchResults', value)}
            trackColor={{ false: '#ccc', true: '#007AFF' }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Achievements</Text>
            <Text style={styles.settingDescription}>Notify when you unlock achievements</Text>
          </View>
          <Switch
            value={settings.notificationSettings.achievements}
            onValueChange={(value) => updateSetting('notificationSettings', 'achievements', value)}
            trackColor={{ false: '#ccc', true: '#007AFF' }}
          />
        </View>
      </View>

      {/* Save Button */}
      <TouchableOpacity 
        style={[styles.saveButton, saving && styles.saveButtonDisabled]} 
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={24} color="#fff" />
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
    backgroundColor: '#f5f5f5'
  },
  content: {
    paddingBottom: 30
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5'
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666'
  },
  errorText: {
    marginTop: 10,
    fontSize: 18,
    color: '#666'
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 15,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0'
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginHorizontal: 20,
    marginVertical: 10
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  settingInfo: {
    flex: 1,
    marginRight: 15
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 3
  },
  settingDescription: {
    fontSize: 13,
    color: '#666'
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    gap: 5
  },
  pickerButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
    textTransform: 'capitalize'
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 30,
    paddingVertical: 15,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    gap: 8
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc'
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  }
});
