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
  organizerName: string;
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
    organizerName: ''
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
        setFormData(prev => ({ ...prev, organizerName: lastUsedName }));
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

    if (!formData.organizerName.trim()) {
      validationErrors.push('Your name is required');
    } else if (formData.organizerName.trim().length < 2 || formData.organizerName.trim().length > 30) {
      validationErrors.push('Your name must be between 2 and 30 characters');
    }

    if (!formData.location.trim()) {
      validationErrors.push('Location is required');
    }

    if (formData.name.trim() && (formData.name.trim().length < 3 || formData.name.trim().length > 50)) {
      validationErrors.push('Session name must be between 3 and 50 characters');
    }

    if (formData.scheduledAt <= new Date()) {
      validationErrors.push('Session must be scheduled for a future time');
    }

    if (formData.maxPlayers < 2 || formData.maxPlayers > 20) {
      validationErrors.push('Maximum players must be between 2 and 20');
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

      const requestData: CreateSessionRequest = {
        name: sessionName,
        dateTime: formData.scheduledAt.toISOString(),
        location: formData.location.trim(),
        maxPlayers: formData.maxPlayers,
        organizerName: formData.organizerName.trim()
      };

      const result = await sessionApi.createSession(requestData);

      if (result.success) {
        console.log('Session created:', result.data.session);
        // Extract shareCode from shareLink if available, otherwise use session.shareCode
        const shareCode = result.data.shareLink
          ? result.data.shareLink.split('/').pop() || result.data.session.shareCode
          : result.data.session.shareCode;
        setCreatedSession({
          ...result.data.session,
          shareCode
        });
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
            value={formData.organizerName}
            onChangeText={(value) => handleInputChange('organizerName', value)}
            placeholder="Enter your name (2-30 characters)"
            maxLength={30}
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

          <Text style={styles.label}>Location *</Text>
          <TextInput
            style={styles.input}
            value={formData.location}
            onChangeText={(value) => handleInputChange('location', value)}
            placeholder="e.g., Olympic Park Badminton Court"
            maxLength={255}
          />

          <Text style={styles.label}>Session Name (optional)</Text>
          <TextInput
            style={styles.input}
            value={formData.name}
            onChangeText={(value) => handleInputChange('name', value)}
            placeholder="Auto-generated if left empty (3-50 characters if provided)"
            maxLength={50}
          />

          <Text style={styles.label}>Max Players *</Text>
          <TextInput
            style={styles.input}
            value={formData.maxPlayers.toString()}
            onChangeText={(value) => handleInputChange('maxPlayers', parseInt(value) || 20)}
            placeholder="2-20"
            keyboardType="number-pad"
            maxLength={2}
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