import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { socialApi } from '../services/socialApi';

interface SocialLoginButtonsProps {
  onLoginSuccess?: (connection: any) => void;
  onLoginError?: (error: any) => void;
  style?: any;
  size?: 'small' | 'medium' | 'large';
  showLabels?: boolean;
}

export default function SocialLoginButtons({
  onLoginSuccess,
  onLoginError,
  style,
  size = 'medium',
  showLabels = true,
}: SocialLoginButtonsProps) {
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const providers = [
    {
      id: 'google',
      name: 'Google',
      icon: 'logo-google',
      color: '#4285F4',
      bgColor: '#ffffff',
      borderColor: '#dadce0',
    },
    {
      id: 'facebook',
      name: 'Facebook',
      icon: 'logo-facebook',
      color: '#ffffff',
      bgColor: '#1877F2',
      borderColor: '#1877F2',
    },
    {
      id: 'twitter',
      name: 'Twitter',
      icon: 'logo-twitter',
      color: '#ffffff',
      bgColor: '#1DA1F2',
      borderColor: '#1DA1F2',
    },
  ];

  const handleSocialLogin = async (providerId: string) => {
    try {
      setConnectingProvider(providerId);

      // In a real implementation, this would integrate with OAuth providers
      // For now, we'll simulate the connection process
      Alert.alert(
        'Social Login',
        `Connect with ${providerId}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Connect',
            onPress: async () => {
              try {
                // Simulate OAuth flow - in real app, this would redirect to OAuth provider
                const mockProviderData = {
                  accessToken: 'mock_token_' + Date.now(),
                  refreshToken: 'mock_refresh_' + Date.now(),
                  expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
                  profile: {
                    id: 'mock_' + providerId + '_id',
                    name: 'Mock User',
                    email: `user@${providerId}.com`,
                  },
                };

                const response = await socialApi.connectSocialAccount({
                  provider: providerId as any,
                  providerId: mockProviderData.profile.id,
                  providerData: mockProviderData,
                });

                if (!response.success) {
                  throw new Error(response.error?.message || 'Failed to connect account');
                }

                Alert.alert('Success', `Connected to ${providerId}!`);
                onLoginSuccess?.(response.data);
              } catch (error: any) {
                console.error('Social login error:', error);
                Alert.alert('Connection Failed', error.message || 'Unable to connect account');
                onLoginError?.(error);
              }
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Social login setup error:', error);
      Alert.alert('Error', 'Unable to start social login');
      onLoginError?.(error);
    } finally {
      setConnectingProvider(null);
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return { paddingHorizontal: 16, paddingVertical: 8, minWidth: 120 };
      case 'large':
        return { paddingHorizontal: 24, paddingVertical: 12, minWidth: 160 };
      default:
        return { paddingHorizontal: 20, paddingVertical: 10, minWidth: 140 };
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'small':
        return 18;
      case 'large':
        return 24;
      default:
        return 20;
    }
  };

  const getTextSize = () => {
    switch (size) {
      case 'small':
        return 14;
      case 'large':
        return 18;
      default:
        return 16;
    }
  };

  return (
    <View style={[styles.container, style]}>
      {providers.map((provider) => (
        <TouchableOpacity
          key={provider.id}
          onPress={() => handleSocialLogin(provider.id)}
          disabled={connectingProvider !== null}
          style={[
            styles.button,
            getSizeStyles(),
            {
              backgroundColor: provider.bgColor,
              borderColor: provider.borderColor,
            },
          ]}
        >
          {connectingProvider === provider.id ? (
            <ActivityIndicator size="small" color={provider.color} />
          ) : (
            <>
              <Ionicons
                name={provider.icon as any}
                size={getIconSize()}
                color={provider.color}
                style={styles.icon}
              />
              {showLabels && (
                <Text
                  style={[
                    styles.text,
                    { color: provider.color, fontSize: getTextSize() },
                  ]}
                >
                  {provider.name}
                </Text>
              )}
            </>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 4,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontWeight: '600',
  },
});