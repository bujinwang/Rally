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
import {
  notificationPreferencesApi,
  NotificationPreferences,
} from '../services/notificationPreferencesApi';
import {
  NOTIFICATION_PREFERENCE_ENTRIES,
  PUSH_ENABLED_ENTRY,
  PUSH_ENABLED_KEY,
  NotificationPreferenceKey,
} from '../services/notificationPreferenceMapping';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../i18n/LanguageContext';

interface RouteParams {
  userId: string;
}

export default function SettingsScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { userId } = route.params as RouteParams;

  const { t, locale, setLocale, availableLocales } = useTranslation();
  // Privacy lives in `user_settings` (read by routes/users.ts:80-84).
  const [settings, setSettings] = useState<UserSettings | null>(null);
  // Notification consent lives in `notification_preferences` — the store the
  // push gate reads (Story 6.9 AC 3). These are a *different* store and endpoint.
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  // Per-store load failures, tracked independently so one store's outage never
  // blanks the other section.
  const [settingsError, setSettingsError] = useState(false);
  const [prefsError, setPrefsError] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [userId]);

  const loadSettings = async () => {
    setLoading(true);
    setSettingsError(false);
    setPrefsError(false);

    // The two sections read *independent* stores — `user_settings` for privacy
    // vs `notification_preferences` for notifications — over independent
    // endpoints, so a failure in one must not hide the other. `allSettled`
    // (rather than `all`) keeps a notification-prefs outage from blanking the
    // privacy settings, and vice-versa; each section reports its own failure
    // inline below.
    const [privacyResult, notificationResult] = await Promise.allSettled([
      userApi.getUserSettings(userId),
      notificationPreferencesApi.getPreferences(),
    ]);

    if (privacyResult.status === 'fulfilled') {
      setSettings(privacyResult.value);
    } else {
      console.error('Error loading privacy settings:', privacyResult.reason);
      setSettingsError(true);
    }

    if (notificationResult.status === 'fulfilled') {
      setPrefs(notificationResult.value);
    } else {
      console.error('Error loading notification preferences:', notificationResult.reason);
      setPrefsError(true);
    }

    setLoading(false);
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

  /** Update one notification preference (local state only until saved). */
  const updatePref = (key: NotificationPreferenceKey, value: boolean) => {
    setPrefs((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  /**
   * Save the privacy section to `user_settings`.
   * Notification consent is saved separately (below) because it lives in a
   * different store/endpoint — a single button could not honestly save both.
   */
  const handleSavePrivacy = async () => {
    if (!settings) return;

    try {
      setSavingPrivacy(true);
      await userApi.updateSettings(userId, { privacySettings: settings.privacySettings });
      Alert.alert('Success', t.settings.savedSuccessfully);
    } catch (error) {
      console.error('Error saving privacy settings:', error);
      Alert.alert('Error', t.settings.saveFailed);
    } finally {
      setSavingPrivacy(false);
    }
  };

  /** Save the notification section to the authoritative preferences store. */
  const handleSaveNotifications = async () => {
    if (!prefs) return;

    try {
      setSavingNotifications(true);
      const saved = await notificationPreferencesApi.updatePreferences(prefs);
      setPrefs(saved);
      Alert.alert('Success', t.settings.savedSuccessfully);
    } catch (error) {
      console.error('Error saving notification preferences:', error);
      Alert.alert('Error', t.settings.saveFailed);
    } finally {
      setSavingNotifications(false);
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

  // Only when *both* stores failed is there nothing at all to show. A single
  // store's failure still renders the other section, with an inline error in
  // place of the failed one.
  if (settingsError && prefsError) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#999" />
        <Text style={styles.errorText}>{t.settings.loadFailed}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadSettings}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Privacy Settings — reads/writes `user_settings` (an independent store). */}
      {settings ? (
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
      ) : (
        <SectionLoadError message={t.settings.loadFailed} onRetry={loadSettings} />
      )}

      {/* Language */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🌐 Language / 语言</Text>
        {availableLocales.map(({ code, name }) => (
          <TouchableOpacity
            key={code}
            style={[styles.settingRow, locale === code && styles.settingRowActive]}
            onPress={() => setLocale(code)}
          >
            <Text style={[styles.settingLabel, locale === code && styles.settingLabelActive]}>
              {name}
            </Text>
            {locale === code && <Ionicons name="checkmark-circle" size={20} color="#007AFF" />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Notification Settings — reads/writes notification_preferences, the
          store the push gate honours (Story 6.9 AC 3). */}
      {prefs ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.settings.notificationSettings}</Text>

          {/* Master push toggle */}
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>{t.settings[PUSH_ENABLED_ENTRY.labelKey]}</Text>
              <Text style={styles.settingDescription}>
                {t.settings[PUSH_ENABLED_ENTRY.descriptionKey]}
              </Text>
            </View>
            <Switch
              value={prefs[PUSH_ENABLED_KEY]}
              onValueChange={(value) => updatePref(PUSH_ENABLED_KEY, value)}
              trackColor={{ false: '#ccc', true: '#007AFF' }}
            />
          </View>

          {NOTIFICATION_PREFERENCE_ENTRIES.map((entry) => (
            <View key={entry.id} style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t.settings[entry.labelKey]}</Text>
                <Text style={styles.settingDescription}>{t.settings[entry.descriptionKey]}</Text>
              </View>
              <Switch
                value={prefs[entry.preferenceKey]}
                onValueChange={(value) => updatePref(entry.preferenceKey, value)}
                trackColor={{ false: '#ccc', true: '#007AFF' }}
              />
            </View>
          ))}
        </View>
      ) : (
        <SectionLoadError message={t.settings.loadFailed} onRetry={loadSettings} />
      )}

      {/* Save Buttons — privacy and notifications are separate stores, so they
          save separately and each reports only what it actually saved. A button
          is only rendered when its store loaded, so it can never claim to save
          a section that failed to load. */}
      {prefs && (
        <TouchableOpacity
          style={[styles.saveButton, savingNotifications && styles.saveButtonDisabled]}
          onPress={handleSaveNotifications}
          disabled={savingNotifications}
        >
          {savingNotifications ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="notifications-outline" size={24} color="#fff" />
              <Text style={styles.saveButtonText}>{t.settings.saveNotifications}</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {settings && (
        <TouchableOpacity
          style={[styles.saveButton, savingPrivacy && styles.saveButtonDisabled]}
          onPress={handleSavePrivacy}
          disabled={savingPrivacy}
        >
          {savingPrivacy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="lock-closed-outline" size={24} color="#fff" />
              <Text style={styles.saveButtonText}>{t.settings.savePrivacy}</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

/**
 * Inline placeholder shown in place of a settings section whose store failed to
 * load. It keeps the two independent sections decoupled: a notification-prefs
 * outage shows here without hiding the privacy settings, and vice-versa.
 */
function SectionLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.section}>
      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingDescription}>{message}</Text>
        </View>
        <TouchableOpacity style={styles.pickerButton} onPress={onRetry}>
          <Text style={styles.pickerButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </View>
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
  settingLabelActive: {
    color: '#007AFF',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 4,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  settingRowActive: {
    backgroundColor: '#E3F2FD',
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
