import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from 'react-native-elements';
import AppNavigator from './src/navigation/AppNavigator';
import { badmintonTheme } from './src/theme/theme';

export default function App() {
  return (
    <ThemeProvider theme={badmintonTheme}>
      <StatusBar style="auto" />
      <AppNavigator />
    </ThemeProvider>
  );
}
