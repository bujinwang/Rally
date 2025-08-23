import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'http://localhost:3001/api/v1';

interface SessionData {
  name?: string; // Made optional
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  ownerName: string;
  ownerDeviceId: string;
}

export default function CreateSessionScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [sessionData, setSessionData] = useState<SessionData>({
    name: '',
    date: new Date().toISOString().split('T')[0], // Today's date as default
    startTime: '14:00', // Default start time 2:00 PM
    endTime: '16:00', // Default end time 4:00 PM
    location: '',
    ownerName: '',
    ownerDeviceId: ''
  });

  useEffect(() => {
    getOrCreateDeviceId();
  }, []);

  const getOrCreateDeviceId = async () => {
    try {
      let deviceId = await AsyncStorage.getItem('deviceId');
      if (!deviceId) {
        deviceId = 'device_' + Math.random().toString(36).substr(2, 9);
        await AsyncStorage.setItem('deviceId', deviceId);
      }
      setSessionData(prev => ({ ...prev, ownerDeviceId: deviceId! }));
    } catch (error) {
      console.error('Error managing device ID:', error);
      const fallbackId = 'device_' + Math.random().toString(36).substr(2, 9);
      setSessionData(prev => ({ ...prev, ownerDeviceId: fallbackId }));
    }
  };

  const handleInputChange = (field: keyof SessionData, value: string | Date) => {
    setSessionData(prev => ({
      ...prev,
      [field]: value
    }));
  };


  const createSession = async () => {
    if (!sessionData.ownerName.trim()) {
      Alert.alert('Error', 'Please fill in your name');
      return;
    }

    setLoading(true);
    try {
      // Auto-generate session name if not provided
      let sessionName = sessionData.name?.trim();
      if (!sessionName) {
        const location = sessionData.location.trim() || 'Badminton Session';
        const date = new Date(sessionData.date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        });
        const timeRange = `${sessionData.startTime}-${sessionData.endTime}`;
        sessionName = `${location} - ${date} ${timeRange}`;
      }

      // Combine date and start time for the scheduledAt field
      const scheduledAt = new Date(`${sessionData.date}T${sessionData.startTime}:00`);

      const requestData = {
        ...sessionData,
        name: sessionName,
        scheduledAt: scheduledAt.toISOString(),
      };

      const response = await fetch(`${API_BASE_URL}/mvp-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();

      if (result.success) {
        console.log('Session created:', result.data.session);
        // Navigate directly to session detail screen
        (navigation as any).navigate('SessionDetail', {
          shareCode: result.data.session.shareCode,
          sessionData: result.data.session,
          isNewSession: true
        });
      } else {
        Alert.alert('Error', result.error?.message || 'Failed to create session');
      }
    } catch (error) {
      console.error('Create session error:', error);
      Alert.alert('Error', 'Failed to create session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Create New Session</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Your Name *</Text>
        <TextInput
          style={styles.input}
          value={sessionData.ownerName}
          onChangeText={(value) => handleInputChange('ownerName', value)}
          placeholder="Enter your name"
        />

        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          value={sessionData.date}
          onChangeText={(value) => handleInputChange('date', value)}
          placeholder="2024-01-15"
        />

        <Text style={styles.label}>Start Time</Text>
        <TextInput
          style={styles.input}
          value={sessionData.startTime}
          onChangeText={(value) => handleInputChange('startTime', value)}
          placeholder="14:00"
        />

        <Text style={styles.label}>End Time</Text>
        <TextInput
          style={styles.input}
          value={sessionData.endTime}
          onChangeText={(value) => handleInputChange('endTime', value)}
          placeholder="16:00"
        />

        <Text style={styles.label}>Location</Text>
        <TextInput
          style={styles.input}
          value={sessionData.location}
          onChangeText={(value) => handleInputChange('location', value)}
          placeholder="e.g., Olympic Park Badminton Court"
        />

        <Text style={styles.label}>Session Name (optional)</Text>
        <TextInput
          style={styles.input}
          value={sessionData.name || ''}
          onChangeText={(value) => handleInputChange('name', value)}
          placeholder="Auto-generated if left empty"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={createSession}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Create Session</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    color: '#333',
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
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});