import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { LanguageProvider, useTranslation } from './src/i18n/LanguageContext';
import AppNavigator from './src/navigation/AppNavigator';
import { notificationService } from './src/services/NotificationService';
import DeviceService from './src/services/deviceService';

function ThemedApp() {
  const { isDark } = useTheme();
  const { locale } = useTranslation();

  useEffect(() => {
    const initNotifications = async () => {
      await notificationService.initialize();
      const deviceId = await DeviceService.getDeviceId();
      await notificationService.registerPushToken(deviceId);
    };
    initNotifications();
  }, []);

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
