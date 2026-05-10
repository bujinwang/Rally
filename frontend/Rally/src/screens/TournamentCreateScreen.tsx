import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import tournamentApi, { TournamentCreationData } from '../services/tournamentApi';

type TournamentsStackParamList = {
  TournamentList: undefined;
  TournamentDetail: { tournamentId: string };
  TournamentCreate: undefined;
};

type TournamentCreateNavigationProp = NativeStackNavigationProp<
  TournamentsStackParamList,
  'TournamentCreate'
>;

const TournamentCreateScreen: React.FC = () => {
  const navigation = useNavigation<TournamentCreateNavigationProp>();

  const [formData, setFormData] = useState<TournamentCreationData>({
    name: '',
    description: '',
    tournamentType: 'SINGLE_ELIMINATION',
    maxPlayers: 16,
    minPlayers: 4,
    startDate: new Date(),
    endDate: undefined,
    registrationDeadline: new Date(),
    venueName: '',
    venueAddress: '',
    latitude: undefined,
    longitude: undefined,
    matchFormat: 'SINGLES',
    scoringSystem: '21_POINT',
    bestOfGames: 3,
    entryFee: 0,
    prizePool: 0,
    currency: 'USD',
    organizerName: 'Tournament Organizer',
    organizerEmail: '',
    organizerPhone: '',
    visibility: 'PUBLIC',
    accessCode: '',
    skillLevelMin: '',
    skillLevelMax: '',
    ageRestriction: undefined,
  });

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [creating, setCreating] = useState(false);

  const updateFormData = (field: keyof TournamentCreationData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCreateTournament = async () => {
    // Basic validation
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Tournament name is required');
      return;
    }

    if (formData.maxPlayers < formData.minPlayers) {
      Alert.alert('Error', 'Maximum players must be greater than minimum players');
      return;
    }

    if (formData.registrationDeadline > formData.startDate) {
      Alert.alert('Error', 'Registration deadline must be before tournament start date');
      return;
    }

    try {
      setCreating(true);

      // Keep dates as Date objects for API
      const tournamentData = {
        ...formData,
      };

      const result = await tournamentApi.createTournament(tournamentData);

      Alert.alert(
        'Success!',
        'Tournament created successfully!',
        [
          {
            text: 'View Tournament',
            onPress: () => {
              navigation.navigate('TournamentDetail', { tournamentId: result.id });
            },
          },
          {
            text: 'Create Another',
            style: 'cancel',
          },
        ]
      );

      // Reset form
      setFormData({
        name: '',
        description: '',
        tournamentType: 'SINGLE_ELIMINATION',
        maxPlayers: 16,
        minPlayers: 4,
        startDate: new Date(),
        endDate: undefined,
        registrationDeadline: new Date(),
        venueName: '',
        venueAddress: '',
        latitude: undefined,
        longitude: undefined,
        matchFormat: 'SINGLES',
        scoringSystem: '21_POINT',
        bestOfGames: 3,
        entryFee: 0,
        prizePool: 0,
        currency: 'USD',
        organizerName: 'Tournament Organizer',
        organizerEmail: '',
        organizerPhone: '',
        visibility: 'PUBLIC',
        accessCode: '',
        skillLevelMin: '',
        skillLevelMax: '',
        ageRestriction: undefined,
      });

    } catch (error: any) {
      console.error('Error creating tournament:', error);
      Alert.alert('Error', error.message || 'Failed to create tournament');
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const renderTextInput = (
    label: string,
    field: keyof TournamentCreationData,
    placeholder: string,
    keyboardType: 'default' | 'numeric' | 'email-address' | 'phone-pad' = 'default',
    multiline: boolean = false
  ) => (
    <View style={styles.inputGroup}>
      <Text style={[styles.label, { color: '#333' }]}>{label}</Text>
      <TextInput
        style={[styles.textInput, multiline && styles.multilineInput, { color: '#333' }]}
        placeholder={placeholder}
        placeholderTextColor="#999"
        value={String(formData[field] || '')}
        onChangeText={(value) => {
          if (keyboardType === 'numeric') {
            updateFormData(field, parseInt(value) || 0);
          } else {
            updateFormData(field, value);
          }
        }}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );

  const renderPicker = (
    label: string,
    field: keyof TournamentCreationData,
    options: { label: string; value: any }[]
  ) => (
    <View style={styles.inputGroup}>
      <Text style={[styles.label, { color: '#333' }]}>{label}</Text>
      <View style={styles.pickerContainer}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.pickerOption,
              formData[field] === option.value && { backgroundColor: '#007AFF' }
            ]}
            onPress={() => updateFormData(field, option.value)}
          >
            <Text style={[
              styles.pickerOptionText,
              { color: formData[field] === option.value ? 'white' : '#333' }
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderDatePicker = (
    label: string,
    field: keyof TournamentCreationData,
    showPicker: boolean,
    setShowPicker: (show: boolean) => void
  ) => (
    <View style={styles.inputGroup}>
      <Text style={[styles.label, { color: '#333' }]}>{label}</Text>
      <TouchableOpacity
        style={[styles.dateButton, { backgroundColor: '#f8f9fa' }]}
        onPress={() => setShowPicker(true)}
      >
        <Text style={[styles.dateButtonText, { color: '#333' }]}>
          {formData[field] ? formatDate(formData[field] as Date) : 'Select Date'}
        </Text>
        <Ionicons name="calendar-outline" size={20} color="#666" />
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={formData[field] as Date || new Date()}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowPicker(false);
            if (selectedDate) {
              updateFormData(field, selectedDate);
            }
          }}
        />
      )}
    </View>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: '#f8f9fa' }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: '#333' }]}>
          Create Tournament
        </Text>
        <Text style={[styles.subtitle, { color: '#666' }]}>
          Set up a new badminton tournament
        </Text>
      </View>

      {/* Basic Information */}
      <View style={[styles.section, { backgroundColor: 'white' }]}>
        <Text style={[styles.sectionTitle, { color: '#333' }]}>
          Basic Information
        </Text>

        {renderTextInput('Tournament Name', 'name', 'Enter tournament name')}
        {renderTextInput('Description', 'description', 'Tournament description (optional)', 'default', true)}

        <View style={styles.row}>
          {renderTextInput('Max Players', 'maxPlayers', '16', 'numeric')}
          {renderTextInput('Min Players', 'minPlayers', '4', 'numeric')}
        </View>
      </View>

      {/* Tournament Format */}
      <View style={[styles.section, { backgroundColor: 'white' }]}>
        <Text style={[styles.sectionTitle, { color: '#333' }]}>
          Tournament Format
        </Text>

        {renderPicker('Tournament Type', 'tournamentType', [
          { label: 'Single Elimination', value: 'SINGLE_ELIMINATION' },
          { label: 'Double Elimination', value: 'DOUBLE_ELIMINATION' },
          { label: 'Round Robin', value: 'ROUND_ROBIN' },
          { label: 'Swiss', value: 'SWISS' },
        ])}

        {renderPicker('Match Format', 'matchFormat', [
          { label: 'Singles', value: 'SINGLES' },
          { label: 'Doubles', value: 'DOUBLES' },
          { label: 'Mixed', value: 'MIXED' },
        ])}

        {renderPicker('Scoring System', 'scoringSystem', [
          { label: '21 Points', value: '21_POINT' },
          { label: '15 Points', value: '15_POINT' },
          { label: '11 Points', value: '11_POINT' },
        ])}

        {renderTextInput('Best of Games', 'bestOfGames', '3', 'numeric')}
      </View>

      {/* Dates and Scheduling */}
      <View style={[styles.section, { backgroundColor: 'white' }]}>
        <Text style={[styles.sectionTitle, { color: '#333' }]}>
          Dates & Scheduling
        </Text>

        {renderDatePicker('Start Date', 'startDate', showStartDatePicker, setShowStartDatePicker)}
        {renderDatePicker('End Date (Optional)', 'endDate', showEndDatePicker, setShowEndDatePicker)}
        {renderDatePicker('Registration Deadline', 'registrationDeadline', showDeadlinePicker, setShowDeadlinePicker)}
      </View>

      {/* Venue */}
      <View style={[styles.section, { backgroundColor: 'white' }]}>
        <Text style={[styles.sectionTitle, { color: '#333' }]}>
          Venue
        </Text>

        {renderTextInput('Venue Name', 'venueName', 'Venue name (optional)')}
        {renderTextInput('Venue Address', 'venueAddress', 'Full address (optional)')}
      </View>

      {/* Entry and Prizes */}
      <View style={[styles.section, { backgroundColor: 'white' }]}>
        <Text style={[styles.sectionTitle, { color: '#333' }]}>
          Entry & Prizes
        </Text>

        <View style={styles.row}>
          {renderTextInput('Entry Fee ($)', 'entryFee', '0', 'numeric')}
          {renderTextInput('Prize Pool ($)', 'prizePool', '0', 'numeric')}
        </View>

        {renderPicker('Visibility', 'visibility', [
          { label: 'Public', value: 'PUBLIC' },
          { label: 'Private', value: 'PRIVATE' },
          { label: 'Invitation Only', value: 'INVITATION_ONLY' },
        ])}

        {formData.visibility !== 'PUBLIC' && (
          renderTextInput('Access Code', 'accessCode', 'Access code for private tournaments')
        )}
      </View>

      {/* Organizer */}
      <View style={[styles.section, { backgroundColor: 'white' }]}>
        <Text style={[styles.sectionTitle, { color: '#333' }]}>
          Organizer Information
        </Text>

        {renderTextInput('Organizer Name', 'organizerName', 'Your name')}
        {renderTextInput('Email', 'organizerEmail', 'Email address (optional)', 'email-address')}
        {renderTextInput('Phone', 'organizerPhone', 'Phone number (optional)', 'phone-pad')}
      </View>

      {/* Create Button */}
      <View style={styles.createSection}>
        <TouchableOpacity
          style={[
            styles.createButton,
            creating && { opacity: 0.6 },
            { backgroundColor: '#28a745' }
          ]}
          onPress={handleCreateTournament}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Ionicons name="trophy" size={20} color="white" />
              <Text style={styles.createButtonText}>Create Tournament</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Bottom padding */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  section: {
    margin: 20,
    marginBottom: 0,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
  },
  multilineInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  pickerOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  dateButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dateButtonText: {
    fontSize: 16,
  },
  createSection: {
    padding: 20,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  createButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default TournamentCreateScreen;