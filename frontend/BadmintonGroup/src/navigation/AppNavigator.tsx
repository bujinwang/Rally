import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider } from 'react-redux';
import { Linking } from 'react-native';

import { store } from '../store';
import MainTabNavigator from './MainTabNavigator';

const Stack = createNativeStackNavigator();

const linking = {
  prefixes: ['badmintongroup://', 'https://badmintongroup.app'],
  config: {
    screens: {
      Main: {
        screens: {
          Home: {
            screens: {
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
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabNavigator} />
    </Stack.Navigator>
  );
};

export default AppNavigator;