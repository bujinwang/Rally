import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSession } from '../contexts/SessionContext';
import matchSchedulingApiService from '../services/matchSchedulingApi';
import { CreateScheduledMatchData, SchedulingConflict } from '../types/matchScheduling';
import ConflictDetectionUI from '../components/ConflictDetectionUI';

interface Player {
  id: string;
  name: string;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
}

const CreateMatchScreen = () => {
  const navigation = useNavigation();
  const { session, currentUser, isOrganizer } = useSession();

  const [formData, setFormData] = useState<CreateScheduledMatchData>({
    sessionId: session?.id || '',
    title: '',
    description: '',
    scheduledAt: '',
    duration: 60,
    courtName: '',
    location: '',
    player1Id: currentUser?.id || '',
    player2Id: '',
    player3Id: '',
    player4Id: '',
    matchType: 'SINGLES',
  });

  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [conflicts, setConflicts] = useState<SchedulingConflict[]>([]);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);

  useEffect(() => {
    if (session?.id) {
      loadAvailablePlayers();
      setFormData(prev => ({ ...prev, sessionId: session.id }));
    }
  }, [session?.id]);

  const loadAvailablePlayers = () => {
    if (!session?.players) return;

    const activePlayers = session.players.filter(p => p.status === 'ACTIVE');
    setAvailablePlayers(activePlayers);

    // Auto-select current user as player 1 if they're active
    if (currentUser && activePlayers.find(p => p.id === currentUser.id)) {
      setFormData(prev => ({ ...prev, player1Id: currentUser.id }));
    }
  };

  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
      const isoString = date.toISOString();
      setFormData(prev => ({ ...prev, scheduledAt: isoString }));
      // Auto-check conflicts when date changes
      checkConflicts({ ...formData, scheduledAt: isoString });
    }
  };

  const checkConflicts = async (data: CreateScheduledMatchData) => {
    if (!data.scheduledAt || !data.sessionId) return;

    setIsCheckingConflicts(true);
    try {
      const conflictResult = await matchSchedulingApiService.checkConflicts(data);
      setConflicts(conflictResult);
    } catch (error) {
      console.error('Error checking conflicts:', error);
    } finally {
      setIsCheckingConflicts(false);
    }
  };

  const handlePlayerSelection = (playerId: string, position: 1 | 2 | 3 | 4) => {
    const field = `player${position}Id` as keyof CreateScheduledMatchData;
    const currentValue = formData[field] as string;

    if (currentValue === playerId) {
      // Deselect if already selected
      setFormData(prev => ({ ...prev, [field]: '' }));
    } else {
      // Select player
      setFormData(prev => ({ ...prev, [field]: playerId }));
    }

    // Auto-check conflicts when players change
    const updatedData = { ...formData, [field]: currentValue === playerId ? '' : playerId };
    if (updatedData.scheduledAt) {
      checkConflicts(updatedData);
    }
  };

  const validateForm = (): string | null => {
    if (!formData.title.trim()) return 'Match title is required';
    if (!formData.scheduledAt) return 'Please select a date and time';
    if (!formData.player1Id) return 'At least one player must be selected';
    if (formData.matchType === 'DOUBLES' && (!formData.player2Id || !formData.player3Id || !formData.player4Id)) {
      return 'Doubles matches require 4 players';
    }
    if (formData.matchType === 'SINGLES' && !formData.player2Id) {
      return 'Singles matches require 2 players';
    }
    return null;
  };

  const handleCreateMatch = async () => {
    const validationError = validateForm();
    if (validationError) {
      Alert.alert('Validation Error', validationError);
      return;
    }

    if (conflicts.length > 0) {
      Alert.alert(
        'Scheduling Conflicts',
        'There are conflicts with your scheduled time. Do you want to proceed anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Proceed', onPress: createMatch },
        ]
      );
      return;
    }

    createMatch();
  };

  const createMatch = async () => {
    setIsLoading(true);
    try {
      const result = await matchSchedulingApiService.createScheduledMatch(formData);

      if (result.success && result.data) {
        Alert.alert(
          'Success',
          'Match scheduled successfully!',
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else if (result.conflicts && result.conflicts.length > 0) {
        Alert.alert(
          'Conflicts Detected',
          result.conflicts.map(c => c.message).join('\n'),
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to create match');
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to create match');
    } finally {
      setIsLoading(false);
    }
  };

  const getPlayerById = (id: string) => {
    return availablePlayers.find(p => p.id === id);
  };

  const isPlayerSelected = (playerId: string) => {
    return Object.values(formData).some(value =>
      typeof value === 'string' && value === playerId
    );
  };

  if (!session || !isOrganizer) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>
            {!session ? 'No active session found' : 'Only organizers can schedule matches'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Schedule Match</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Basic Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Match Details</Text>

          <TextInput
            style={styles.input}
            placeholder="Match Title (e.g., Championship Final)"
            value={formData.title}
            onChangeText={(text) => setFormData(prev => ({ ...prev, title: text }))}
          />

          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Description (optional)"
            value={formData.description}
            onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
            multiline
            numberOfLines={3}
          />

          <TextInput
            style={styles.input}
            placeholder="Court Name (optional)"
            value={formData.courtName}
            onChangeText={(text) => setFormData(prev => ({ ...prev, courtName: text }))}
          />

          <TextInput
            style={styles.input}
            placeholder="Location (optional)"
            value={formData.location}
            onChangeText={(text) => setFormData(prev => ({ ...prev, location: text }))}
          />
        </View>

        {/* Date and Time */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Date & Time</Text>

          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateButtonText}>
              {formData.scheduledAt
                ? new Date(formData.scheduledAt).toLocaleString()
                : 'Select Date & Time'
              }
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="datetime"
              display="default"
              onChange={handleDateChange}
              minimumDate={new Date()}
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Duration (minutes)"
            value={formData.duration?.toString() || '60'}
            onChangeText={(text) => {
              const duration = parseInt(text) || 60;
              setFormData(prev => ({ ...prev, duration }));
            }}
            keyboardType="numeric"
          />
        </View>

        {/* Match Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Match Type</Text>

          <View style={styles.matchTypeContainer}>
            <TouchableOpacity
              style={[
                styles.matchTypeButton,
                formData.matchType === 'SINGLES' && styles.matchTypeButtonActive
              ]}
              onPress={() => setFormData(prev => ({ ...prev, matchType: 'SINGLES' }))}
            >
              <Text style={[
                styles.matchTypeText,
                formData.matchType === 'SINGLES' && styles.matchTypeTextActive
              ]}>
                Singles (2 Players)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.matchTypeButton,
                formData.matchType === 'DOUBLES' && styles.matchTypeButtonActive
              ]}
              onPress={() => setFormData(prev => ({ ...prev, matchType: 'DOUBLES' }))}
            >
              <Text style={[
                styles.matchTypeText,
                formData.matchType === 'DOUBLES' && styles.matchTypeTextActive
              ]}>
                Doubles (4 Players)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Player Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Select Players ({formData.matchType === 'SINGLES' ? '2 required' : '4 required'})
          </Text>

          <View style={styles.playersGrid}>
            {availablePlayers.map((player) => (
              <TouchableOpacity
                key={player.id}
                style={[
                  styles.playerCard,
                  isPlayerSelected(player.id) && styles.playerCardSelected
                ]}
                onPress={() => {
                  // Find next available position
                  const positions: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];
                  const nextPosition = positions.find(pos => !formData[`player${pos}Id` as keyof CreateScheduledMatchData]);
                  if (nextPosition) {
                    handlePlayerSelection(player.id, nextPosition);
                  }
                }}
              >
                <Text style={[
                  styles.playerName,
                  isPlayerSelected(player.id) && styles.playerNameSelected
                ]}>
                  {player.name}
                </Text>
                {isPlayerSelected(player.id) && (
                  <Text style={styles.selectedIndicator}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Selected Players Display */}
          <View style={styles.selectedPlayers}>
            {([1, 2, 3, 4] as const).map(pos => {
              const playerId = formData[`player${pos}Id` as keyof CreateScheduledMatchData] as string;
              const player = playerId ? getPlayerById(playerId) : null;

              return (
                <View key={pos} style={styles.playerPosition}>
                  <Text style={styles.positionLabel}>Player {pos}:</Text>
                  <Text style={styles.positionValue}>
                    {player ? player.name : 'Not selected'}
                  </Text>
                  {player && (
                    <TouchableOpacity
                      style={styles.removePlayer}
                      onPress={() => handlePlayerSelection(playerId, pos)}
                    >
                      <Text style={styles.removeText}>×</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Conflicts Display */}
        {conflicts.length > 0 && (
          <ConflictDetectionUI
            conflicts={conflicts}
            onConflictPress={(conflict) => {
              Alert.alert(
                `${conflict.type.replace('_', ' ')}`,
                conflict.message,
                [{ text: 'OK' }]
              );
            }}
          />
        )}

        {/* Create Button */}
        <TouchableOpacity
          style={[styles.createButton, isLoading && styles.disabledButton]}
          onPress={handleCreateMatch}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.createButtonText}>Schedule Match</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#f9f9f9',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  dateButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#333',
  },
  matchTypeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  matchTypeButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  matchTypeButtonActive: {
    backgroundColor: '#007AFF',
  },
  matchTypeText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  matchTypeTextActive: {
    color: '#ffffff',
  },
  playersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  playerCard: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    width: '48%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playerCardSelected: {
    backgroundColor: '#007AFF',
  },
  playerName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  playerNameSelected: {
    color: '#ffffff',
  },
  selectedIndicator: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  selectedPlayers: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 16,
  },
  playerPosition: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  positionLabel: {
    fontSize: 14,
    color: '#666',
    width: 80,
  },
  positionValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  removePlayer: {
    padding: 4,
  },
  removeText: {
    color: '#dc3545',
    fontSize: 18,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: '#28a745',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

export default CreateMatchScreen;