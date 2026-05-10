// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Switch,
  TextInput,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SessionConfigApiService } from '../services/sessionConfigApi';
import { SessionConfiguration, DEFAULT_SESSION_CONFIG } from '../types/sessionConfig';
import sessionApi from '../services/sessionApi';
import { API_BASE_URL } from '../config/api';



interface RouteParams {
  sessionId: string;
  shareCode: string;
}

const SCORING_OPTIONS = ['21_POINT', '15_POINT', '11_POINT'] as const;
const BEST_OF_OPTIONS = [1, 3, 5, 7] as const;
const REST_OPTIONS = [0, 1, 2, 3, 5, 10] as const;
const PRESETS = ['casual', 'competitive', 'tournament', 'beginners'] as const;

const PRESET_LABELS: Record<string, string> = {
  casual: '🏸 Casual',
  competitive: '🏆 Competitive',
  tournament: '🥇 Tournament',
  beginners: '🌱 Beginners',
};

interface SessionBasicInfo {
  name: string;
  location: string;
  courtCount: number;
  maxPlayers: number;
  description: string;
}

export default function SessionSettingsScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { sessionId, shareCode } = route.params as RouteParams;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<SessionConfiguration>(DEFAULT_SESSION_CONFIG);
  const [basicInfo, setBasicInfo] = useState<SessionBasicInfo>({
    name: '',
    location: '',
    courtCount: 1,
    maxPlayers: 20,
    description: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      // Load session basic info via share code
      const sessionRes = await sessionApi.getSessionByShareCode(shareCode);
      if (sessionRes.success) {
        const s = sessionRes.data.session;
        setBasicInfo({
          name: s.name || '',
          location: s.location || '',
          courtCount: s.courtCount || 1,
          maxPlayers: s.maxPlayers || 20,
          description: s.description || '',
        });
      }

      // Load advanced config via session ID
      try {
        const cfg = await SessionConfigApiService.getConfiguration(sessionId);
        setConfig(cfg);
      } catch {
        // Config may not exist yet — use defaults
        setConfig(DEFAULT_SESSION_CONFIG);
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load settings: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const saveBasicInfo = async (): Promise<boolean> => {
    try {
      const deviceId = await sessionApi.getDeviceId();
      const response = await fetch(`${API_BASE_URL}/mvp-sessions/${shareCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerDeviceId: deviceId,
          ...basicInfo,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        Alert.alert('Error', result.message || 'Failed to save session info');
        return false;
      }
      return true;
    } catch (error: any) {
      Alert.alert('Error', 'Failed to save session info: ' + error.message);
      return false;
    }
  };

  const saveConfig = async (): Promise<boolean> => {
    try {
      await SessionConfigApiService.updateConfiguration(sessionId, config);
      return true;
    } catch (error: any) {
      Alert.alert('Error', 'Failed to save game settings: ' + error.message);
      return false;
    }
  };

  const handleSave = async () => {
    if (!basicInfo.name.trim()) {
      Alert.alert('Validation', 'Session name is required');
      return;
    }

    setSaving(true);
    const basicOk = await saveBasicInfo();
    const configOk = await saveConfig();
    setSaving(false);

    if (basicOk && configOk) {
      Alert.alert('Saved', 'Session settings updated successfully');
      navigation.goBack();
    }
  };

  const handleApplyPreset = async (presetName: string) => {
    try {
      setSaving(true);
      const updated = await SessionConfigApiService.applyConfigurationPreset(sessionId, presetName);
      setConfig(updated);
      Alert.alert('Applied', `"${PRESET_LABELS[presetName]}" preset applied`);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to apply preset: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Reset Settings',
      'Reset all game settings to defaults? Session info (name, location, etc.) will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              const defaults = await SessionConfigApiService.resetConfiguration(sessionId);
              setConfig(defaults);
              Alert.alert('Reset', 'Game settings reset to defaults');
            } catch (error: any) {
              Alert.alert('Error', 'Failed to reset: ' + error.message);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Basic Info Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 Session Info</Text>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.fieldInput}
            value={basicInfo.name}
            onChangeText={(text) => setBasicInfo((prev) => ({ ...prev, name: text }))}
            placeholder="Session name"
            maxLength={200}
          />
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Location</Text>
          <TextInput
            style={styles.fieldInput}
            value={basicInfo.location}
            onChangeText={(text) => setBasicInfo((prev) => ({ ...prev, location: text }))}
            placeholder="Location"
            maxLength={200}
          />
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Court Count</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() =>
                setBasicInfo((prev) => ({ ...prev, courtCount: Math.max(1, prev.courtCount - 1) }))
              }
            >
              <Text style={styles.stepperBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{basicInfo.courtCount}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() =>
                setBasicInfo((prev) => ({ ...prev, courtCount: Math.min(10, prev.courtCount + 1) }))
              }
            >
              <Text style={styles.stepperBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Max Players</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() =>
                setBasicInfo((prev) => ({ ...prev, maxPlayers: Math.max(2, prev.maxPlayers - 2) }))
              }
            >
              <Text style={styles.stepperBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{basicInfo.maxPlayers}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() =>
                setBasicInfo((prev) => ({ ...prev, maxPlayers: Math.min(100, prev.maxPlayers + 2) }))
              }
            >
              <Text style={styles.stepperBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={[styles.fieldInput, styles.multilineInput]}
            value={basicInfo.description}
            onChangeText={(text) => setBasicInfo((prev) => ({ ...prev, description: text }))}
            placeholder="Session notes..."
            multiline
            numberOfLines={3}
            maxLength={500}
          />
        </View>
      </View>

      {/* Presets Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚡ Quick Presets</Text>
        <Text style={styles.sectionHint}>Apply a preset to quickly configure game rules</Text>
        <View style={styles.presetsRow}>
          {PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset}
              style={styles.presetButton}
              onPress={() => handleApplyPreset(preset)}
              disabled={saving}
            >
              <Text style={styles.presetButtonText}>{PRESET_LABELS[preset]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Scoring Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎯 Scoring Rules</Text>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Scoring System</Text>
          <View style={styles.optionRow}>
            {SCORING_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.optionBtn, config.scoringSystem === opt && styles.optionBtnActive]}
                onPress={() => setConfig((prev) => ({ ...prev, scoringSystem: opt }))}
              >
                <Text
                  style={[
                    styles.optionText,
                    config.scoringSystem === opt && styles.optionTextActive,
                  ]}
                >
                  {opt.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Best Of</Text>
          <View style={styles.optionRow}>
            {BEST_OF_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.optionBtn, config.bestOfGames === opt && styles.optionBtnActive]}
                onPress={() => setConfig((prev) => ({ ...prev, bestOfGames: opt }))}
              >
                <Text
                  style={[
                    styles.optionText,
                    config.bestOfGames === opt && styles.optionTextActive,
                  ]}
                >
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Rest Period</Text>
          <View style={styles.optionRow}>
            {REST_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.optionBtn, config.restPeriod === opt && styles.optionBtnActive]}
                onPress={() => setConfig((prev) => ({ ...prev, restPeriod: opt }))}
              >
                <Text
                  style={[
                    styles.optionText,
                    config.restPeriod === opt && styles.optionTextActive,
                  ]}
                >
                  {opt === 0 ? 'None' : `${opt}m`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Equipment Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🏓 Equipment</Text>

        <View style={styles.switchRow}>
          <Text style={styles.fieldLabel}>Racket Required</Text>
          <Switch
            value={config.racketRequired}
            onValueChange={(v) => setConfig((prev) => ({ ...prev, racketRequired: v }))}
            trackColor={{ false: '#ccc', true: '#007AFF' }}
          />
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Shuttlecock</Text>
          <View style={styles.optionRow}>
            {(['feather', 'plastic', 'mixed'] as const).map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.optionBtn, config.shuttlecockType === opt && styles.optionBtnActive]}
                onPress={() => setConfig((prev) => ({ ...prev, shuttlecockType: opt }))}
              >
                <Text
                  style={[
                    styles.optionText,
                    config.shuttlecockType === opt && styles.optionTextActive,
                  ]}
                >
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.fieldLabel}>Equipment Rental</Text>
          <Switch
            value={config.equipmentRental}
            onValueChange={(v) => setConfig((prev) => ({ ...prev, equipmentRental: v }))}
            trackColor={{ false: '#ccc', true: '#007AFF' }}
          />
        </View>
      </View>

      {/* Access Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔒 Access</Text>

        <View style={styles.switchRow}>
          <Text style={styles.fieldLabel}>Require Approval</Text>
          <Switch
            value={config.requireApproval}
            onValueChange={(v) => setConfig((prev) => ({ ...prev, requireApproval: v }))}
            trackColor={{ false: '#ccc', true: '#007AFF' }}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.fieldLabel}>Invite Only</Text>
          <Switch
            value={config.inviteOnly}
            onValueChange={(v) => setConfig((prev) => ({ ...prev, inviteOnly: v }))}
            trackColor={{ false: '#ccc', true: '#007AFF' }}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.fieldLabel}>Coaching Allowed</Text>
          <Switch
            value={config.coachingAllowed}
            onValueChange={(v) => setConfig((prev) => ({ ...prev, coachingAllowed: v }))}
            trackColor={{ false: '#ccc', true: '#007AFF' }}
          />
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={styles.saveButtonText}>Save All Settings</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.templateSaveButton}
          onPress={() => {
            Alert.prompt
              ? Alert.prompt('Template Name', 'Save current settings as a reusable template', async (templateName) => {
                  if (!templateName) return;
                  try {
                    const deviceId = await sessionApi.getDeviceId();
                    await fetch(`${API_BASE_URL}/session-templates`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: templateName,
                        ownerDeviceId: deviceId,
                        maxPlayers: basicInfo.maxPlayers,
                        courtCount: basicInfo.courtCount,
                        location: basicInfo.location,
                        scoringSystem: config.scoringSystem,
                        bestOfGames: config.bestOfGames,
                        restPeriod: config.restPeriod,
                      }),
                    });
                    Alert.alert('Saved', `Template "${templateName}" saved`);
                  } catch (e: any) { Alert.alert('Error', e.message); }
                })
              : (() => {
                  // Fallback for platforms without Alert.prompt
                  Alert.alert('Save Template', 'Template save will be available in a future update.');
                })();
          }}
        >
          <Ionicons name="bookmark" size={18} color="#1565C0" />
          <Text style={styles.templateSaveText}>Save as Template</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Ionicons name="refresh" size={18} color="#FF3B30" />
          <Text style={styles.resetButtonText}>Reset Game Settings</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13,
    color: '#999',
    marginBottom: 12,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  fieldLabel: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  fieldInput: {
    flex: 1.5,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  multilineInput: {
    height: 70,
    textAlignVertical: 'top',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  stepperValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    minWidth: 30,
    textAlign: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  optionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  optionBtnActive: {
    backgroundColor: '#007AFF',
  },
  optionText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  optionTextActive: {
    color: '#fff',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetButton: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  presetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1565C0',
  },
  actionsContainer: {
    marginTop: 24,
    paddingHorizontal: 20,
    gap: 12,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#007AFF',
    borderRadius: 10,
    gap: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  templateSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    gap: 6,
  },
  templateSaveText: { color: '#1565C0', fontSize: 14, fontWeight: '500' },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FF3B30',
    gap: 6,
  },
  resetButtonText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '500',
  },
});
