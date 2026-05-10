import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { userApi } from '../services/userApi';

interface AvatarPickerProps {
  userId: string;
  currentAvatar?: string;
  onUpdate: (newAvatarUrl: string) => void;
}

export const AvatarPicker: React.FC<AvatarPickerProps> = ({
  userId,
  currentAvatar,
  onUpdate
}) => {
  const [avatarUrl, setAvatarUrl] = useState(currentAvatar);
  const [uploading, setUploading] = useState(false);

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant camera roll permissions to upload an avatar.'
        );
        return false;
      }
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const takePicture = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant camera permissions to take a photo.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Error', 'Failed to take picture');
    }
  };

  const uploadImage = async (imageUri: string) => {
    try {
      setUploading(true);
      const newAvatarUrl = await userApi.uploadAvatar(userId, imageUri);
      setAvatarUrl(newAvatarUrl);
      onUpdate(newAvatarUrl);
      Alert.alert('Success', 'Avatar updated successfully');
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      Alert.alert('Error', error?.message || 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const deleteAvatar = () => {
    Alert.alert(
      'Delete Avatar',
      'Are you sure you want to delete your profile picture?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setUploading(true);
              await userApi.deleteAvatar(userId);
              setAvatarUrl('');
              onUpdate('');
              Alert.alert('Success', 'Avatar deleted successfully');
            } catch (error: any) {
              console.error('Error deleting avatar:', error);
              Alert.alert('Error', error?.message || 'Failed to delete avatar');
            } finally {
              setUploading(false);
            }
          }
        }
      ]
    );
  };

  const showOptions = () => {
    Alert.alert('Change Profile Picture', 'Choose an option', [
      {
        text: 'Take Photo',
        onPress: takePicture
      },
      {
        text: 'Choose from Library',
        onPress: pickImage
      },
      ...(avatarUrl
        ? [
            {
              text: 'Delete Photo',
              style: 'destructive' as const,
              onPress: deleteAvatar
            }
          ]
        : []),
      {
        text: 'Cancel',
        style: 'cancel' as const
      }
    ]);
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={showOptions}
      disabled={uploading}
    >
      <View style={styles.avatarContainer}>
        {uploading ? (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        ) : avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={48} color="#fff" />
          </View>
        )}
        
        {/* Edit Overlay */}
        <View style={styles.editOverlay}>
          <Ionicons name="camera" size={24} color="#fff" />
        </View>
      </View>
      
      <Text style={styles.helperText}>Tap to change picture</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center'
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 10
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#007AFF'
  },
  avatarPlaceholder: {
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center'
  },
  editOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff'
  },
  helperText: {
    fontSize: 14,
    color: '#666',
    marginTop: 5
  }
});
