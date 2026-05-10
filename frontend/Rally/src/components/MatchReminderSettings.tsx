import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { MatchReminderSettings as ReminderSettings } from '../types/matchScheduling';

interface MatchReminderSettingsProps {
  matchId?: string;
  initialSettings?: ReminderSettings;
  onSettingsChange?: (settings: ReminderSettings) => void;
  onSave?: (settings: ReminderSettings) => Promise<void>;
}

const MatchReminderSettings = ({
  matchId,
  initialSettings,
  onSettingsChange,
  onSave
}: MatchReminderSettingsProps) => {
  const [settings, setSettings] = useState<ReminderSettings>({
    enabled: true,
    pushNotifications: true,
    emailNotifications: false,
    smsNotifications: false,
    defaultReminderMinutes: 15,
    customReminders: [15, 60],
  });

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
    }
  }, [initialSettings]);

  const updateSettings = (updates: Partial<ReminderSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    onSettingsChange?.(newSettings);
  };

  const handleSave = async () => {
    if (!onSave) return;

    setIsSaving(true);
    try {
      await onSave(settings);
      Alert.alert('Success', 'Reminder settings saved successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to save reminder settings');
    } finally {
      setIsSaving(false);
    }
  };

  const addCustomReminder = () => {
    const newMinute = 30; // Default new reminder time
    if (!settings.customReminders.includes(newMinute)) {
      updateSettings({
        customReminders: [...settings.customReminders, newMinute].sort((a, b) => a - b)
      });
    }
  };

  const removeCustomReminder = (minutes: number) => {
    updateSettings({
      customReminders: settings.customReminders.filter(m => m !== minutes)
    });
  };

  const updateCustomReminder = (oldMinutes: number, newMinutes: number) => {
    if (newMinutes > 0 && !settings.customReminders.includes(newMinutes)) {
      updateSettings({
        customReminders: settings.customReminders
          .map(m => m === oldMinutes ? newMinutes : m)
          .sort((a, b) => a - b)
      });
    }
  };

  const reminderOptions = [
    { minutes: 5, label: '5 minutes before' },
    { minutes: 15, label: '15 minutes before' },
    { minutes: 30, label: '30 minutes before' },
    { minutes: 60, label: '1 hour before' },
    { minutes: 120, label: '2 hours before' },
    { minutes: 1440, label: '1 day before' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🔔</Text>
        <Text style={styles.headerTitle}>Match Reminders</Text>
      </View>

      <Text style={styles.description}>
        Configure how and when you want to be reminded about your badminton matches.
      </Text>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Master Toggle */}
        <View style={styles.settingGroup}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Enable Reminders</Text>
              <Text style={styles.settingDescription}>
                Turn on/off all match reminders
              </Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={(value) => updateSettings({ enabled: value })}
              trackColor={{ false: '#ccc', true: '#007AFF' }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {settings.enabled && (
          <>
            {/* Notification Types */}
            <View style={styles.settingGroup}>
              <Text style={styles.groupTitle}>Notification Types</Text>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>📱 Push Notifications</Text>
                  <Text style={styles.settingDescription}>
                    Receive push notifications on your device
                  </Text>
                </View>
                <Switch
                  value={settings.pushNotifications}
                  onValueChange={(value) => updateSettings({ pushNotifications: value })}
                  trackColor={{ false: '#ccc', true: '#007AFF' }}
                  thumbColor="#ffffff"
                />
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>📧 Email Notifications</Text>
                  <Text style={styles.settingDescription}>
                    Receive reminder emails
                  </Text>
                </View>
                <Switch
                  value={settings.emailNotifications}
                  onValueChange={(value) => updateSettings({ emailNotifications: value })}
                  trackColor={{ false: '#ccc', true: '#28a745' }}
                  thumbColor="#ffffff"
                />
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>💬 SMS Notifications</Text>
                  <Text style={styles.settingDescription}>
                    Receive text message reminders
                  </Text>
                </View>
                <Switch
                  value={settings.smsNotifications}
                  onValueChange={(value) => updateSettings({ smsNotifications: value })}
                  trackColor={{ false: '#ccc', true: '#ffc107' }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>

            {/* Default Reminder Time */}
            <View style={styles.settingGroup}>
              <Text style={styles.groupTitle}>Default Reminder Time</Text>
              <Text style={styles.groupDescription}>
                How many minutes before the match should you be reminded by default?
              </Text>

              <View style={styles.timeSelector}>
                {reminderOptions.map((option) => (
                  <TouchableOpacity
                    key={option.minutes}
                    style={[
                      styles.timeOption,
                      settings.defaultReminderMinutes === option.minutes && styles.timeOptionSelected
                    ]}
                    onPress={() => updateSettings({ defaultReminderMinutes: option.minutes })}
                  >
                    <Text style={[
                      styles.timeOptionText,
                      settings.defaultReminderMinutes === option.minutes && styles.timeOptionTextSelected
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Custom Reminders */}
            <View style={styles.settingGroup}>
              <View style={styles.customRemindersHeader}>
                <Text style={styles.groupTitle}>Custom Reminders</Text>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={addCustomReminder}
                >
                  <Text style={styles.addButtonText}>+ Add</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.groupDescription}>
                Set up multiple reminder times for important matches.
              </Text>

              {settings.customReminders.map((minutes) => (
                <View key={minutes} style={styles.customReminderRow}>
                  <Text style={styles.customReminderText}>
                    {minutes < 60
                      ? `${minutes} minutes before`
                      : minutes < 1440
                        ? `${Math.floor(minutes / 60)} hour${Math.floor(minutes / 60) > 1 ? 's' : ''} before`
                        : `${Math.floor(minutes / 1440)} day${Math.floor(minutes / 1440) > 1 ? 's' : ''} before`
                    }
                  </Text>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeCustomReminder(minutes)}
                  >
                    <Text style={styles.removeButtonText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {settings.customReminders.length === 0 && (
                <Text style={styles.noCustomReminders}>
                  No custom reminders set. Tap "Add" to create one.
                </Text>
              )}
            </View>

            {/* Save Button */}
            {onSave && (
              <TouchableOpacity
                style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={isSaving}
              >
                <Text style={styles.saveButtonText}>
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>💡 Reminder Tips:</Text>
          <Text style={styles.infoText}>• Push notifications work best for immediate alerts</Text>
          <Text style={styles.infoText}>• Email reminders include match details and maps</Text>
          <Text style={styles.infoText}>• SMS reminders are sent even without internet</Text>
          <Text style={styles.infoText}>• Custom reminders help with preparation time</Text>
        </View>
      </ScrollView>
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
  settingGroup: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  groupDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  timeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeOption: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  timeOptionSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  timeOptionText: {
    fontSize: 12,
    color: '#333',
  },
  timeOptionTextSelected: {
    color: '#ffffff',
  },
  customRemindersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addButton: {
    backgroundColor: '#28a745',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  customReminderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  customReminderText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  removeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#dc3545',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  noCustomReminders: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 16,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoSection: {
    backgroundColor: '#e7f3ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0056b3',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#0056b3',
    marginBottom: 4,
    paddingLeft: 8,
  },
});

export default MatchReminderSettings;