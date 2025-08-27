import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

export enum HapticType {
  Light = 'light',
  Medium = 'medium', 
  Heavy = 'heavy',
  Selection = 'selection',
  Success = 'success',
  Warning = 'warning',
  Error = 'error'
}

export enum HapticIntensity {
  Off = 'off',
  Light = 'light',
  Medium = 'medium',
  Strong = 'strong'
}

interface HapticPreferences {
  enabled: boolean;
  intensity: HapticIntensity;
  enableForScoring: boolean;
  enableForNavigation: boolean;
  enableForNotifications: boolean;
}

export class HapticService {
  private static instance: HapticService;
  private preferences: HapticPreferences = {
    enabled: true,
    intensity: HapticIntensity.Medium,
    enableForScoring: true,
    enableForNavigation: true,
    enableForNotifications: true,
  };
  
  private readonly STORAGE_KEY = 'badminton_haptic_preferences';
  private isSupported: boolean = true;

  private constructor() {
    this.checkSupport();
    this.loadPreferences();
  }

  public static getInstance(): HapticService {
    if (!HapticService.instance) {
      HapticService.instance = new HapticService();
    }
    return HapticService.instance;
  }

  /**
   * Check if haptic feedback is supported on this device
   */
  private async checkSupport(): Promise<void> {
    try {
      // Test with a light haptic
      await Haptics.selectionAsync();
      this.isSupported = true;
    } catch (error) {
      console.warn('Haptic feedback not supported:', error);
      this.isSupported = false;
    }
  }

  /**
   * Main haptic trigger method
   */
  public async trigger(type: HapticType, context?: 'scoring' | 'navigation' | 'notification'): Promise<void> {
    if (!this.isEnabled(context)) return;

    try {
      switch (type) {
        case HapticType.Light:
          await this.triggerLight();
          break;
        case HapticType.Medium:
          await this.triggerMedium();
          break;
        case HapticType.Heavy:
          await this.triggerHeavy();
          break;
        case HapticType.Selection:
          await Haptics.selectionAsync();
          break;
        case HapticType.Success:
          await this.triggerSuccess();
          break;
        case HapticType.Warning:
          await this.triggerWarning();
          break;
        case HapticType.Error:
          await this.triggerError();
          break;
      }
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
    }
  }

  /**
   * Specialized haptic methods
   */
  
  // Score change haptic
  public async scoreChanged(points: number = 1): Promise<void> {
    if (!this.preferences.enableForScoring) return;
    
    if (points === 1) {
      await this.trigger(HapticType.Light, 'scoring');
    } else {
      // Multiple points - stronger feedback
      await this.trigger(HapticType.Medium, 'scoring');
    }
  }

  // Game milestone haptic (game point, match point, etc.)
  public async gameMilestone(type: 'game_point' | 'match_point' | 'victory'): Promise<void> {
    if (!this.preferences.enableForScoring) return;

    switch (type) {
      case 'game_point':
        await this.trigger(HapticType.Medium, 'scoring');
        break;
      case 'match_point':
        await this.trigger(HapticType.Heavy, 'scoring');
        break;
      case 'victory':
        // Victory sequence: Medium -> pause -> Heavy
        await this.trigger(HapticType.Medium, 'scoring');
        setTimeout(async () => {
          await this.trigger(HapticType.Heavy, 'scoring');
        }, 200);
        break;
    }
  }

  // Queue/rotation haptic
  public async queueUpdate(type: 'added' | 'removed' | 'moved' | 'next_up'): Promise<void> {
    switch (type) {
      case 'added':
      case 'removed':
        await this.trigger(HapticType.Selection, 'navigation');
        break;
      case 'moved':
        await this.trigger(HapticType.Light, 'navigation');
        break;
      case 'next_up':
        await this.trigger(HapticType.Medium, 'notification');
        break;
    }
  }

  // Error/validation haptic
  public async validationError(severity: 'mild' | 'severe' = 'mild'): Promise<void> {
    if (severity === 'mild') {
      await this.trigger(HapticType.Warning, 'navigation');
    } else {
      await this.trigger(HapticType.Error, 'navigation');
    }
  }

  // Button press feedback
  public async buttonPress(importance: 'primary' | 'secondary' = 'secondary'): Promise<void> {
    if (importance === 'primary') {
      await this.trigger(HapticType.Medium, 'navigation');
    } else {
      await this.trigger(HapticType.Selection, 'navigation');
    }
  }

  /**
   * Intensity-adjusted haptic methods
   */
  private async triggerLight(): Promise<void> {
    switch (this.preferences.intensity) {
      case HapticIntensity.Light:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case HapticIntensity.Medium:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case HapticIntensity.Strong:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
    }
  }

  private async triggerMedium(): Promise<void> {
    switch (this.preferences.intensity) {
      case HapticIntensity.Light:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case HapticIntensity.Medium:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case HapticIntensity.Strong:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
    }
  }

  private async triggerHeavy(): Promise<void> {
    switch (this.preferences.intensity) {
      case HapticIntensity.Light:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case HapticIntensity.Medium:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case HapticIntensity.Strong:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
    }
  }

  private async triggerSuccess(): Promise<void> {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  private async triggerWarning(): Promise<void> {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }

  private async triggerError(): Promise<void> {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  /**
   * Preference management
   */
  public isEnabled(context?: 'scoring' | 'navigation' | 'notification'): boolean {
    if (!this.isSupported || !this.preferences.enabled || this.preferences.intensity === HapticIntensity.Off) {
      return false;
    }

    switch (context) {
      case 'scoring':
        return this.preferences.enableForScoring;
      case 'navigation':
        return this.preferences.enableForNavigation;
      case 'notification':
        return this.preferences.enableForNotifications;
      default:
        return true;
    }
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    this.preferences.enabled = enabled;
    await this.savePreferences();
  }

  public async setIntensity(intensity: HapticIntensity): Promise<void> {
    this.preferences.intensity = intensity;
    await this.savePreferences();
  }

  public async setContextEnabled(context: 'scoring' | 'navigation' | 'notification', enabled: boolean): Promise<void> {
    switch (context) {
      case 'scoring':
        this.preferences.enableForScoring = enabled;
        break;
      case 'navigation':
        this.preferences.enableForNavigation = enabled;
        break;
      case 'notification':
        this.preferences.enableForNotifications = enabled;
        break;
    }
    await this.savePreferences();
  }

  public getPreferences(): HapticPreferences {
    return { ...this.preferences };
  }

  public getSupported(): boolean {
    return this.isSupported;
  }

  /**
   * Storage methods
   */
  private async savePreferences(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify(this.preferences)
      );
    } catch (error) {
      console.error('Failed to save haptic preferences:', error);
    }
  }

  private async loadPreferences(): Promise<void> {
    try {
      const prefsJson = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (prefsJson) {
        const loadedPrefs = JSON.parse(prefsJson);
        this.preferences = { ...this.preferences, ...loadedPrefs };
      }
    } catch (error) {
      console.error('Failed to load haptic preferences:', error);
    }
  }

  /**
   * Test method for settings screen
   */
  public async testHaptic(type: HapticType): Promise<void> {
    // Temporarily enable for testing regardless of preferences
    const wasEnabled = this.preferences.enabled;
    this.preferences.enabled = true;
    
    await this.trigger(type);
    
    this.preferences.enabled = wasEnabled;
  }
}

// Export singleton instance
export const hapticService = HapticService.getInstance();

// React hook for components
export const useHapticService = () => {
  return hapticService;
};