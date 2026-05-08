import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { LanguageProvider, useTranslation } from './src/i18n/LanguageContext';
import AppNavigator from './src/navigation/AppNavigator';

function ThemedApp() {
  const { isDark } = useTheme();
  const { locale } = useTranslation();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'auto'} />
      <AppNavigator key={locale} />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ThemedApp />
      </LanguageProvider>
    </ThemeProvider>
  );
}
