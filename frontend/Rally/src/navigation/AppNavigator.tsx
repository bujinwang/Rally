import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider } from 'react-redux';

import { store } from '../store';
import MainTabNavigator from './MainTabNavigator';

// Auth screens (accessible from Profile tab, not as a gate)
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

const Stack = createNativeStackNavigator();

const linking = {
  prefixes: ['badmintongroup://', 'https://badmintongroup.app'],
  config: {
    screens: {
      Main: {
        screens: {
          CreateSession: {
            screens: {
              CreateSession: 'create',
              JoinSession: {
                path: '/join/:shareCode',
                parse: {
                  shareCode: (shareCode: string) => shareCode,
                },
              },
            },
          },
        },
      },
    },
  },
};

const AppNavigator = () => {
  return (
    <Provider store={store}>
      <NavigationContainer linking={linking as any}>
        <RootNavigator />
      </NavigationContainer>
    </Provider>
  );
};

const RootNavigator = () => {
  // Initialize push notifications on mount for all users (drop-in + registered)
  React.useEffect(() => {
    const initNotifications = async () => {
      try {
        const { notificationService } = require('../services/NotificationService');
        await notificationService.initialize();
        const deviceId = await require('@react-native-async-storage/async-storage')
          .default.getItem('@badminton_device_id');
        if (deviceId) {
          await notificationService.registerPushToken(deviceId);
        }
      } catch (e) {
        console.warn('Push notification init skipped:', e);
      }
    };
    initNotifications();
  }, []);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* Main app always visible — no auth gate */}
      <Stack.Screen name="Main" component={MainTabNavigator} />
      
      {/* Auth screens accessible from Profile/More tab */}
      <Stack.Screen 
        name="Login" 
        component={LoginScreen}
        options={{ headerShown: true, title: 'Sign In', headerBackTitle: 'Back' }}
      />
      <Stack.Screen 
        name="Register" 
        component={RegisterScreen}
        options={{ headerShown: true, title: 'Create Account', headerBackTitle: 'Back' }}
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;
