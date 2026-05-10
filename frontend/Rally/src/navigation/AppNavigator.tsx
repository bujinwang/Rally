// @ts-nocheck
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider, useSelector } from 'react-redux';
import { Linking } from 'react-native';

import { store } from '../store';
import MainTabNavigator from './MainTabNavigator';
import AuthNavigator from './AuthNavigator';

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
      <NavigationContainer linking={linking}>
        <RootNavigator />
      </NavigationContainer>
    </Provider>
  );
};

const RootNavigator = () => {
  const isAuthenticated = useSelector((state: any) => state.auth.isAuthenticated);

  // Initialize push notifications on login
  React.useEffect(() => {
    if (isAuthenticated) {
      const initNotifications = async () => {
        try {
          const { notificationService } = require('../services/NotificationService');
          const token = await notificationService.initialize();
          if (token) {
            const userId = await require('@react-native-async-storage/async-storage')
              .default.getItem('userId');
            const deviceId = await require('@react-native-async-storage/async-storage')
              .default.getItem('@badminton_device_id');
            await notificationService.registerPushToken(userId || '', deviceId || '');
          }
        } catch (e) {
          console.warn('Push notification init skipped:', e);
        }
      };
      initNotifications();
    }
  }, [isAuthenticated]);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Stack.Screen name="Main" component={MainTabNavigator} />
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
    </Stack.Navigator>
  );
};

export default AppNavigator;