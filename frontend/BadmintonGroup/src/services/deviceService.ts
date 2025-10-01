import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

const DEVICE_ID_STORAGE_KEY = '@badminton_device_id';

export class DeviceService {
  private static cachedDeviceId: string | null = null;

  /**
   * Get or generate a persistent device identifier
   * This is used for MVP player identification without authentication
   */
  static async getDeviceId(): Promise<string> {
    // Return cached value if available
    if (this.cachedDeviceId) {
      return this.cachedDeviceId;
    }

    try {
      // Try to get existing device ID from storage
      const storedDeviceId = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
      
      if (storedDeviceId) {
        this.cachedDeviceId = storedDeviceId;
        return storedDeviceId;
      }

      // Generate new device ID if none exists
      const newDeviceId = await this.generateDeviceId();
      
      // Store for future use
      await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, newDeviceId);
      this.cachedDeviceId = newDeviceId;
      
      console.log('📱 Generated new device ID:', newDeviceId);
      return newDeviceId;
    } catch (error) {
      console.error('Error getting device ID:', error);
      // Fallback to session-only ID
      return this.generateFallbackId();
    }
  }

  /**
   * Generate a unique device identifier based on device characteristics
   */
  private static async generateDeviceId(): Promise<string> {
    const components: string[] = [];

    try {
      // Platform-specific identifiers
      if (Platform.OS === 'ios') {
        // iOS: Use vendorId if available (persists across app reinstalls)
        const vendorId = await Application.getIosIdForVendorAsync();
        if (vendorId) {
          components.push(`ios-${vendorId}`);
        }
      } else if (Platform.OS === 'android') {
        // Android: Use androidId (unique per device)
        const androidId = Application.androidId;
        if (androidId) {
          components.push(`android-${androidId}`);
        }
      }

      // Add installation ID (changes on app reinstall)
      const installationId = Constants.installationId;
      if (installationId) {
        components.push(installationId);
      }

      // Add device name if available
      const deviceName = await Application.getApplicationName();
      if (deviceName) {
        components.push(deviceName);
      }

      // If we have components, hash them together
      if (components.length > 0) {
        return this.hashComponents(components);
      }

      // Fallback: generate random ID
      return this.generateFallbackId();
    } catch (error) {
      console.error('Error generating device ID:', error);
      return this.generateFallbackId();
    }
  }

  /**
   * Hash components to create a shorter, consistent device ID
   */
  private static hashComponents(components: string[]): string {
    const combined = components.join('-');
    // Simple hash function (DJB2)
    let hash = 5381;
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) + hash) + combined.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Convert to base36 and add platform prefix
    const hashStr = Math.abs(hash).toString(36);
    return `${Platform.OS}-${hashStr}-${Date.now().toString(36)}`;
  }

  /**
   * Generate a fallback random ID (not persistent across app restarts without storage)
   */
  private static generateFallbackId(): string {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 15);
    return `${Platform.OS}-fallback-${timestamp}-${randomStr}`;
  }

  /**
   * Get device information for debugging/analytics
   */
  static async getDeviceInfo() {
    try {
      return {
        platform: Platform.OS,
        platformVersion: Platform.Version,
        appVersion: Application.nativeApplicationVersion,
        buildNumber: Application.nativeBuildVersion,
        deviceName: await Application.getApplicationName(),
        installationId: Constants.installationId,
        deviceId: await this.getDeviceId(),
      };
    } catch (error) {
      console.error('Error getting device info:', error);
      return {
        platform: Platform.OS,
        deviceId: await this.getDeviceId(),
      };
    }
  }

  /**
   * Reset device ID (useful for testing or privacy)
   */
  static async resetDeviceId(): Promise<string> {
    try {
      await AsyncStorage.removeItem(DEVICE_ID_STORAGE_KEY);
      this.cachedDeviceId = null;
      return await this.getDeviceId();
    } catch (error) {
      console.error('Error resetting device ID:', error);
      throw error;
    }
  }

  /**
   * Check if device ID is stored
   */
  static async hasStoredDeviceId(): Promise<boolean> {
    try {
      const stored = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
      return stored !== null;
    } catch (error) {
      return false;
    }
  }
}

export default DeviceService;
