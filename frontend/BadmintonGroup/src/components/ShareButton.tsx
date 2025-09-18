import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  Share,
  View,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { socialApi, ShareData } from '../services/socialApi';
import { socialSDKService } from '../services/socialSDKs';

interface ShareButtonProps {
  type: 'session' | 'match' | 'achievement';
  entityId: string;
  title?: string;
  style?: any;
  size?: 'small' | 'medium' | 'large';
  variant?: 'primary' | 'secondary' | 'outline';
  onShareSuccess?: (result: any) => void;
  onShareError?: (error: any) => void;
}

export default function ShareButton({
  type,
  entityId,
  title,
  style,
  size = 'medium',
  variant = 'primary',
  onShareSuccess,
  onShareError,
}: ShareButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleShare = async () => {
    try {
      setIsLoading(true);

      // First, create the share record via API
      const shareData: ShareData = {
        type,
        entityId,
        platform: 'copy_link', // Default to copy link, user can choose platform later
      };

      const response = await socialApi.shareEntity(shareData);

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create share');
      }

      const { shareUrl, preview } = response.data || {};

      // Use the SDK service to share to the selected platform
      const sdkShareData = {
        type,
        entityId,
        message,
        url: shareUrl || '',
        title: preview?.title || title,
        preview,
      };

      // For now, use native share - in production, show platform selection
      const result = await socialSDKService.shareNative(sdkShareData);

      onShareSuccess?.({ ...response.data, platformResult: result });
    } catch (error: any) {
      console.error('Share error:', error);
      Alert.alert('Share Failed', error.message || 'Unable to share at this time');
      onShareError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return { paddingHorizontal: 12, paddingVertical: 6 };
      case 'large':
        return { paddingHorizontal: 24, paddingVertical: 12 };
      default:
        return { paddingHorizontal: 16, paddingVertical: 8 };
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: '#f0f0f0',
          borderColor: '#ddd',
          borderWidth: 1,
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          borderColor: '#007AFF',
          borderWidth: 1,
        };
      default:
        return {
          backgroundColor: '#007AFF',
        };
    }
  };

  const getTextColor = () => {
    return variant === 'outline' ? '#007AFF' : 'white';
  };

  const getIconSize = () => {
    switch (size) {
      case 'small':
        return 16;
      case 'large':
        return 24;
      default:
        return 20;
    }
  };

  return (
    <TouchableOpacity
      onPress={handleShare}
      disabled={isLoading}
      style={[
        styles.button,
        getSizeStyles(),
        getVariantStyles(),
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={getTextColor()} />
      ) : (
        <View style={styles.content}>
          <Ionicons
            name="share"
            size={getIconSize()}
            color={getTextColor()}
            style={styles.icon}
          />
          <Text style={[styles.text, { color: getTextColor() }]}>
            Share
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 6,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
});