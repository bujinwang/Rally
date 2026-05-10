import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DeviceService from '../services/deviceService';

interface OrganizerClaimModalProps {
  visible: boolean;
  onClose: () => void;
  shareCode: string;
  onSuccess: () => void;
}

const API_BASE_URL = 'http://localhost:3001/api/v1';

export const OrganizerClaimModal: React.FC<OrganizerClaimModalProps> = ({
  visible,
  onClose,
  shareCode,
  onSuccess,
}) => {
  const [secret, setSecret] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);

  const handleClaim = async () => {
    if (!secret.trim()) {
      Alert.alert('Error', 'Please enter the organizer secret');
      return;
    }

    setLoading(true);
    try {
      const deviceId = await DeviceService.getDeviceId();
      
      const response = await fetch(`${API_BASE_URL}/mvp-sessions/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shareCode,
          secret: secret.trim(),
          deviceId,
          playerName: playerName.trim() || undefined,
        }),
      });

      const result = await response.json();

      if (result.success) {
        Alert.alert(
          'Success',
          'Organizer access granted! You can now manage this session.',
          [
            {
              text: 'OK',
              onPress: () => {
                setSecret('');
                setPlayerName('');
                setShowNameInput(false);
                onClose();
                onSuccess();
              },
            },
          ]
        );
      } else {
        const errorCode = result.error?.code;
        const errorMessage = result.error?.message;

        if (errorCode === 'PLAYER_NAME_REQUIRED') {
          setShowNameInput(true);
          Alert.alert(
            'Player Name Required',
            'You need to join the session first. Please enter your name to continue.'
          );
        } else if (errorCode === 'INVALID_SECRET') {
          Alert.alert('Error', 'Invalid organizer secret. Please check and try again.');
        } else {
          Alert.alert('Error', errorMessage || 'Failed to claim organizer access');
        }
      }
    } catch (error) {
      console.error('Claim error:', error);
      Alert.alert('Error', 'Failed to claim organizer access. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSecret('');
    setPlayerName('');
    setShowNameInput(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Claim Organizer Access</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.description}>
              Enter the organizer secret to regain control of this session.
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Organizer Secret *</Text>
              <TextInput
                style={styles.input}
                value={secret}
                onChangeText={setSecret}
                placeholder="Enter 6-character secret"
                autoCapitalize="characters"
                maxLength={6}
                editable={!loading}
              />
            </View>

            {showNameInput && (
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Your Name *</Text>
                <TextInput
                  style={styles.input}
                  value={playerName}
                  onChangeText={setPlayerName}
                  placeholder="Enter your name to join"
                  autoCapitalize="words"
                  editable={!loading}
                />
                <Text style={styles.helperText}>
                  You need to join the session before claiming organizer access.
                </Text>
              </View>
            )}

            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={20} color="#007AFF" />
              <Text style={styles.infoText}>
                The organizer secret was provided when this session was created. If you lost it,
                you won't be able to regain organizer access.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.claimButton, loading && styles.buttonDisabled]}
              onPress={handleClaim}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.claimButtonText}>Claim Organizer Access</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFF',
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#F0F8FF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#007AFF',
    marginLeft: 8,
    lineHeight: 18,
  },
  claimButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  claimButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
});
