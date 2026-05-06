import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

interface SocialLoginButtonsProps {
  onLoginSuccess?: (data: { user: any; tokens: any; isNewUser: boolean }) => void;
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
      id: 'wechat' as const,
      name: 'WeChat',
      icon: 'chatbubble-ellipses',
      color: '#ffffff',
      bgColor: '#07C160',
      borderColor: '#07C160',
    },
  ];

  /**
   * Start the OAuth flow for a provider
   * Gets the authorization URL from backend, opens it, and handles the callback
   */
  const handleSocialLogin = async (providerId: string) => {
    try {
      setConnectingProvider(providerId);

      // Get the OAuth authorization URL from backend
      const urlResponse = await fetch(`${API_BASE_URL}/oauth/${providerId}/url`);
      const urlResult = await urlResponse.json();

      if (!urlResult.success) {
        throw new Error(urlResult.error?.message || 'Failed to get authorization URL');
      }

      const authUrl = urlResult.data.url;

      // For mobile: use the mobile flow where the native SDK provides the token
      // The actual native OAuth SDK integration depends on the platform:
      // - Google: @react-native-google-signin/google-signin or expo-auth-session
      // - WeChat: react-native-wechat-lib
      // This implementation provides the standard web-based OAuth flow

      if (Platform.OS === 'web') {
        // Web: redirect to OAuth provider
        window.location.href = authUrl;
        return;
      }

      // For mobile, attempt the native SDK flow or show setup instructions
      Alert.alert(
        `${providerId === 'google' ? 'Google' : 'WeChat'} Login`,
        `To sign in with ${providerId}, the app will redirect you to the ${providerId} login page.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: async () => {
              try {
                // For native mobile, use Linking to open the auth URL
                const { Linking } = require('react-native');
                await Linking.openURL(authUrl);
              } catch (error: any) {
                console.error('Error opening auth URL:', error);
                Alert.alert(
                  'OAuth Unavailable',
                  `${providerId} login requires native SDK integration. Please use email login or contact support.`
                );
                onLoginError?.(error);
              }
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Social login error:', error);
      Alert.alert('Login Failed', error.message || 'Unable to start social login');
      onLoginError?.(error);
    } finally {
      setConnectingProvider(null);
    }
  };

  /**
   * Handle OAuth mobile token submission
   * Called after native SDK returns tokens — sends them to backend for JWT exchange
   */
  const handleMobileOAuth = async (
    provider: 'google' | 'wechat',
    data: { providerId: string; name?: string; email?: string; avatarUrl?: string; accessToken?: string }
  ) => {
    try {
      setConnectingProvider(provider);

      const response = await fetch(`${API_BASE_URL}/oauth/${provider}/mobile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'OAuth login failed');
      }

      // Store tokens
      const { user, tokens, isNewUser } = result.data;
      await AsyncStorage.setItem('accessToken', tokens.accessToken);
      await AsyncStorage.setItem('refreshToken', tokens.refreshToken);
      await AsyncStorage.setItem('userId', user.id);
      await AsyncStorage.setItem('userName', user.name);

      Alert.alert(
        isNewUser ? 'Welcome!' : 'Welcome Back!',
        `Successfully signed in as ${user.name}`,
        [{ text: 'OK' }]
      );

      onLoginSuccess?.({ user, tokens, isNewUser });
    } catch (error: any) {
      console.error('Mobile OAuth error:', error);
      Alert.alert('Login Failed', error.message || 'Unable to complete social login');
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
      case 'small': return 18;
      case 'large': return 24;
      default: return 20;
    }
  };

  const getTextSize = () => {
    switch (size) {
      case 'small': return 14;
      case 'large': return 18;
      default: return 16;
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
          activeOpacity={0.7}
        >
          {connectingProvider === provider.id ? (
            <ActivityIndicator
              size="small"
              color={provider.id === 'wechat' ? '#fff' : provider.color}
            />
          ) : (
            <>
              <Ionicons
                name={provider.icon as any}
                size={getIconSize()}
                color={provider.id === 'wechat' ? '#fff' : provider.color}
                style={styles.icon}
              />
              {showLabels && (
                <Text
                  style={[
                    styles.text,
                    {
                      color: provider.id === 'wechat' ? '#fff' : provider.color,
                      fontSize: getTextSize(),
                    },
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
