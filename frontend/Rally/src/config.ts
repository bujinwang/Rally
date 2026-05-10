import { Platform } from 'react-native';

const getApiBaseUrl = (): string => {
  if (Platform.OS === 'android') {
    // Android emulator uses 10.0.2.2 to reach host machine
    return 'http://10.0.2.2:3001';
  }
  if (Platform.OS === 'ios') {
    // iOS simulator can use localhost
    return 'http://localhost:3001';
  }
  // Web fallback
  return 'http://localhost:3001';
};

export const API_BASE_URL = getApiBaseUrl();
