// @ts-nocheck
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

const DEVICE_ID_STORAGE_KEY = '@badminton_device_id';
const USER_PREFS_KEY = '@badminton_user_prefs';

export interface DeviceIdentity {
  deviceId: string;
  lastUsedName: string;
  platform: string;
  isStable: boolean; // true if based on hardware identifiers
}

export class DeviceService {
  private static cachedDeviceId: string | null = null;

  /**
   * Get or generate a persistent, deterministic device identifier.
   *
   * Priority:
   *   1. Stored ID from AsyncStorage (fast path)
   *   2. Deterministic hash of hardware/installation identifiers
   *   3. Random UUID fallback (non-deterministic, last resort)
   */
  static async getDeviceId(): Promise<string> {
    if (this.cachedDeviceId) return this.cachedDeviceId;

    try {
      const stored = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (stored) {
        this.cachedDeviceId = stored;
        return stored;
      }

      const newId = await this.generateDeviceId();
      await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, newId);
      this.cachedDeviceId = newId;
      console.log('📱 Device ID:', newId);
      return newId;
    } catch (error) {
      console.error('Error getting device ID:', error);
      return this.generateFallbackId();
    }
  }

  /**
   * Get the full device identity (deviceId + saved user name).
   */
  static async getIdentity(): Promise<DeviceIdentity> {
    const deviceId = await this.getDeviceId();

    let lastUsedName = '';
    let isStable = true;
    try {
      const prefs = await AsyncStorage.getItem(USER_PREFS_KEY);
      if (prefs) {
        const parsed = JSON.parse(prefs);
        lastUsedName = parsed.lastUsedName || '';
      }
      // Check if the stored ID is a fallback (starts with platform-fallback)
      isStable = !deviceId.includes('-fallback-');
    } catch {
      // ignore
    }

    return {
      deviceId,
      lastUsedName,
      platform: Platform.OS,
      isStable,
    };
  }

  /**
   * Save the last-used name alongside the device ID.
   */
  static async saveUserName(name: string): Promise<void> {
    try {
      const trimmed = name.trim();
      if (!trimmed) return;
      const existing = await AsyncStorage.getItem(USER_PREFS_KEY);
      const prefs = existing ? JSON.parse(existing) : {};
      prefs.lastUsedName = trimmed;
      await AsyncStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // non-critical
    }
  }

  /**
   * Generate a deterministic device identifier from hardware/installation sources.
   */
  private static async generateDeviceId(): Promise<string> {
    const components: string[] = [];

    try {
      // ── Platform-specific hardware identifiers (most stable) ──
      if (Platform.OS === 'ios') {
        const vendorId = await Application.getIosIdForVendorAsync();
        if (vendorId) components.push(`ios-vendor:${vendorId}`);
      } else if (Platform.OS === 'android') {
        const androidId = Application.androidId;
        if (androidId) components.push(`android-id:${androidId}`);
      }

      // ── Application identity ──
      const installationId = Constants.installationId;
      if (installationId) components.push(`install:${installationId}`);

      const appVersion = Application.nativeApplicationVersion;
      if (appVersion) components.push(`app:${appVersion}`);

      const buildNumber = Application.nativeBuildVersion;
      if (buildNumber) components.push(`build:${buildNumber}`);

      if (components.length >= 2) {
        // We have at least a hardware ID + installation ID — good enough
        return `${Platform.OS}-${this.djb2Hash(components.join('|'))}`;
      }

      // ── Fallback: installationId only ──
      if (installationId) {
        return `${Platform.OS}-install-${this.djb2Hash(installationId)}`;
      }

      return this.generateFallbackId();
    } catch (error) {
      console.error('Error generating device ID:', error);
      return this.generateFallbackId();
    }
  }

  /**
   * DJB2 hash — returns a short alphanumeric fingerprint.
   */
  private static djb2Hash(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash) + input.charCodeAt(i);
      hash = hash & 0xffffffff; // 32-bit
    }

    // Base36 for compactness, ensure positive
    return (hash >>> 0).toString(36);
  }

  /**
   * Non-deterministic fallback (generates a new random ID each time).
   * Only used when no hardware identifiers are available.
   */
  private static generateFallbackId(): string {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 15);
    return `${Platform.OS}-fallback-${timestamp}-${randomStr}`;
  }

  /**
   * Get device information for debugging/analytics.
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
   * Reset device ID (for testing/privacy).
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
}

export default DeviceService;
