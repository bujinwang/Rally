import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import sessionApi, { CreateSessionRequest } from '../services/sessionApi';
import SessionShareModal from '../components/SessionShareModal';
import socketService from '../services/socketService';

interface SessionFormData {
  name: string;
  scheduledAt: Date;
  location: string;
  maxPlayers: number;
  skillLevel: string;
  cost: string; // Keep as string for input, convert to number
  description: string;
  ownerName: string;
}

export default function CreateSessionScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [createdSession, setCreatedSession] = useState<any>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  
  // Default to 2 hours from now
  const defaultDate = new Date();
  defaultDate.setHours(defaultDate.getHours() + 2, 0, 0, 0);
  
  const [formData, setFormData] = useState<SessionFormData>({
    name: '',
    scheduledAt: defaultDate,
    location: '',
    maxPlayers: 20,
    skillLevel: 'Mixed',
    cost: '',
    description: '',
    ownerName: ''
  });

  useEffect(() => {
    loadStoredUserName();
    // Connect to Socket.IO for real-time features
    socketService.connect();
  }, []);

  const loadStoredUserName = async () => {
    try {
      const storedName = await sessionApi.getDeviceId();
      // Try to get the last used name from storage (we'll add this feature)
      const lastUsedName = ''; // Placeholder for now
      if (lastUsedName) {
        setFormData(prev => ({ ...prev, ownerName: lastUsedName }));
      }
    } catch (error) {
      console.error('Error loading stored data:', error);
    }
  };

  const handleInputChange = (field: keyof SessionFormData, value: string | Date | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear errors when user starts typing
    if (errors.length > 0) {
      setErrors([]);
    }
  };


  const validateForm = (): string[] => {
    const validationErrors: string[] = [];
    
    if (!formData.ownerName.trim()) {
      validationErrors.push('Your name is required');
    }
    
    if (formData.scheduledAt <= new Date()) {
      validationErrors.push('Session must be scheduled for a future time');
    }
    
    if (formData.maxPlayers < 2 || formData.maxPlayers > 50) {
      validationErrors.push('Maximum players must be between 2 and 50');
    }
    
    if (formData.cost && parseFloat(formData.cost) < 0) {
      validationErrors.push('Cost cannot be negative');
    }
    
    return validationErrors;
  };

  const createSession = async () => {
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      Alert.alert('Validation Error', validationErrors[0]);
      return;
    }

    setLoading(true);
    try {
      // Auto-generate session name if not provided
      let sessionName = formData.name.trim();
      if (!sessionName) {
        const location = formData.location.trim() || 'Badminton Session';
        const date = formData.scheduledAt.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        });
        const time = formData.scheduledAt.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });
        sessionName = `${location} - ${date} ${time}`;
      }

      const requestData: Omit<CreateSessionRequest, 'ownerDeviceId'> = {
        name: sessionName,
        scheduledAt: formData.scheduledAt.toISOString(),
        location: formData.location.trim() || undefined,
        maxPlayers: formData.maxPlayers,
        skillLevel: formData.skillLevel || undefined,
        cost: formData.cost ? parseFloat(formData.cost) : undefined,
        description: formData.description.trim() || undefined,
        ownerName: formData.ownerName.trim()
      };

      const result = await sessionApi.createSession(requestData);

      if (result.success) {
        console.log('Session created:', result.data.session);
        setCreatedSession(result.data.session);
        setShowShareModal(true);
      } else {
        Alert.alert('Error', 'Failed to create session');
      }
    } catch (error: any) {
      console.error('Create session error:', error);
      Alert.alert('Error', error.message || 'Failed to create session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      handleInputChange('scheduledAt', selectedDate);
    }
  };

  const handleShareModalClose = () => {
    setShowShareModal(false);
    // Navigate to session detail screen
    if (createdSession) {
      (navigation as any).navigate('SessionDetail', {
        shareCode: createdSession.shareCode,
        sessionData: createdSession,
        isNewSession: true
      });
    }
  };

  const formatDateTime = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Create New Session</Text>

        {errors.length > 0 && (
          <View style={styles.errorContainer}>
            {errors.map((error, index) => (
              <Text key={index} style={styles.errorText}>• {error}</Text>
            ))}
          </View>
        )}

        <View style={styles.form}>
          <Text style={styles.label}>Your Name *</Text>
          <TextInput
            style={styles.input}
            value={formData.ownerName}
            onChangeText={(value) => handleInputChange('ownerName', value)}
            placeholder="Enter your name"
            maxLength={100}
          />

          <Text style={styles.label}>Date & Time *</Text>
          <TouchableOpacity 
            style={styles.dateInput} 
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateText}>{formatDateTime(formData.scheduledAt)}</Text>
            <Ionicons name="calendar" size={20} color="#007AFF" />
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={formData.scheduledAt}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleDateChange}
              minimumDate={new Date()}
            />
          )}

          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            value={formData.location}
            onChangeText={(value) => handleInputChange('location', value)}
            placeholder="e.g., Olympic Park Badminton Court"
            maxLength={200}
          />

          <Text style={styles.label}>Session Name (optional)</Text>
          <TextInput
            style={styles.input}
            value={formData.name}
            onChangeText={(value) => handleInputChange('name', value)}
            placeholder="Auto-generated if left empty"
            maxLength={100}
          />

          <View style={styles.row}>
            <View style={styles.halfWidth}>
              <Text style={styles.label}>Max Players</Text>
              <TextInput
                style={styles.input}
                value={formData.maxPlayers.toString()}
                onChangeText={(value) => handleInputChange('maxPlayers', parseInt(value) || 20)}
                placeholder="20"
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>

            <View style={styles.halfWidth}>
              <Text style={styles.label}>Cost (optional)</Text>
              <TextInput
                style={styles.input}
                value={formData.cost}
                onChangeText={(value) => handleInputChange('cost', value)}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <Text style={styles.label}>Skill Level</Text>
          <View style={styles.skillLevelContainer}>
            {['Beginner', 'Intermediate', 'Advanced', 'Mixed'].map((level) => (
              <TouchableOpacity
                key={level}
                style={[
                  styles.skillLevelButton,
                  formData.skillLevel === level && styles.skillLevelButtonActive
                ]}
                onPress={() => handleInputChange('skillLevel', level)}
              >
                <Text style={[
                  styles.skillLevelText,
                  formData.skillLevel === level && styles.skillLevelTextActive
                ]}>
                  {level}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.description}
            onChangeText={(value) => handleInputChange('description', value)}
            placeholder="Add any additional details..."
            multiline
            numberOfLines={3}
            maxLength={500}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={createSession}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="add" size={20} color="white" />
                <Text style={styles.buttonText}>Create Session</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {createdSession && (
        <SessionShareModal
          visible={showShareModal}
          onClose={handleShareModalClose}
          shareCode={createdSession.shareCode}
          sessionName={createdSession.name}
          sessionDate={formatDateTime(new Date(createdSession.scheduledAt))}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    color: '#333',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 14,
    marginBottom: 4,
  },
  form: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  dateText: {
    fontSize: 16,
    color: '#333',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfWidth: {
    width: '48%',
  },
  skillLevelContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  skillLevelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  skillLevelButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  skillLevelText: {
    fontSize: 14,
    color: '#666',
  },
  skillLevelTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  button: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});