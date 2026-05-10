import { API_BASE_URL } from '../config/api';
import { SessionConfiguration, DEFAULT_SESSION_CONFIG } from '../types/sessionConfig';

export interface ConfigurationValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfigurationPreset {
  [key: string]: Partial<SessionConfiguration>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: any[];
  };
  timestamp: string;
}

/**
 * Session Configuration API Service
 * Handles all session configuration related API calls
 */
export class SessionConfigApiService {
  private static baseUrl = `${API_BASE_URL}/sessions/config`;

  /**
   * Get session configuration
   */
  static async getConfiguration(sessionId: string): Promise<SessionConfiguration> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/config`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result: ApiResponse<SessionConfiguration> = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to fetch session configuration');
      }

      return result.data!;
    } catch (error) {
      console.error('Get configuration API error:', error);
      throw error;
    }
  }

  /**
   * Update session configuration
   */
  static async updateConfiguration(
    sessionId: string,
    config: Partial<SessionConfiguration>
  ): Promise<SessionConfiguration> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const result: ApiResponse<SessionConfiguration> = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to update session configuration');
      }

      return result.data!;
    } catch (error) {
      console.error('Update configuration API error:', error);
      throw error;
    }
  }

  /**
   * Reset session configuration to defaults
   */
  static async resetConfiguration(sessionId: string): Promise<SessionConfiguration> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/config`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result: ApiResponse<SessionConfiguration> = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to reset session configuration');
      }

      return result.data!;
    } catch (error) {
      console.error('Reset configuration API error:', error);
      throw error;
    }
  }

  /**
   * Validate configuration without saving
   */
  static async validateConfiguration(
    sessionId: string,
    config: SessionConfiguration
  ): Promise<ConfigurationValidationResult> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/config/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const result: ApiResponse<ConfigurationValidationResult> = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to validate session configuration');
      }

      return result.data!;
    } catch (error) {
      console.error('Validate configuration API error:', error);
      throw error;
    }
  }

  /**
   * Get available configuration presets
   */
  static async getConfigurationPresets(): Promise<ConfigurationPreset> {
    try {
      const response = await fetch(`${this.baseUrl}/presets`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result: ApiResponse<ConfigurationPreset> = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to fetch configuration presets');
      }

      return result.data!;
    } catch (error) {
      console.error('Get presets API error:', error);
      throw error;
    }
  }

  /**
   * Apply a configuration preset
   */
  static async applyConfigurationPreset(
    sessionId: string,
    presetName: string
  ): Promise<SessionConfiguration> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/config/preset/${presetName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result: ApiResponse<SessionConfiguration> = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to apply configuration preset');
      }

      return result.data!;
    } catch (error) {
      console.error('Apply preset API error:', error);
      throw error;
    }
  }

  /**
   * Quick setup methods for common scenarios
   */

  /**
   * Setup a casual session
   */
  static async setupCasualSession(sessionId: string): Promise<SessionConfiguration> {
    return this.applyConfigurationPreset(sessionId, 'casual');
  }

  /**
   * Setup a competitive session
   */
  static async setupCompetitiveSession(sessionId: string): Promise<SessionConfiguration> {
    return this.applyConfigurationPreset(sessionId, 'competitive');
  }

  /**
   * Setup a tournament session
   */
  static async setupTournamentSession(sessionId: string): Promise<SessionConfiguration> {
    return this.applyConfigurationPreset(sessionId, 'tournament');
  }

  /**
   * Setup a beginners session
   */
  static async setupBeginnersSession(sessionId: string): Promise<SessionConfiguration> {
    return this.applyConfigurationPreset(sessionId, 'beginners');
  }

  /**
   * Batch update multiple configuration settings
   */
  static async updateMultipleSettings(
    sessionId: string,
    updates: Partial<SessionConfiguration>
  ): Promise<SessionConfiguration> {
    // Validate first
    const currentConfig = await this.getConfiguration(sessionId);
    const proposedConfig = { ...currentConfig, ...updates };

    const validation = await this.validateConfiguration(sessionId, proposedConfig);
    if (!validation.isValid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }

    // Apply updates
    return this.updateConfiguration(sessionId, updates);
  }

  /**
   * Update court configuration
   */
  static async updateCourtConfiguration(
    sessionId: string,
    courtConfig: {
      surface?: 'wood' | 'synthetic' | 'carpet' | 'grass' | 'rubber';
      lighting?: 'natural' | 'artificial' | 'mixed';
      facilities?: {
        showers: boolean;
        parking: boolean;
        equipmentRental: boolean;
        refreshments: boolean;
        seating: boolean;
      };
    }
  ): Promise<SessionConfiguration> {
    return this.updateConfiguration(sessionId, {
      courtSurface: courtConfig.surface,
      courtLighting: courtConfig.lighting,
      courtFacilities: courtConfig.facilities,
    });
  }

  /**
   * Update scoring rules
   */
  static async updateScoringRules(
    sessionId: string,
    scoringRules: {
      system?: '21_POINT' | '15_POINT' | '11_POINT';
      bestOfGames?: 1 | 3 | 5 | 7;
      gameTimeLimit?: number;
      setTimeLimit?: number;
      restPeriod?: number;
    }
  ): Promise<SessionConfiguration> {
    return this.updateConfiguration(sessionId, {
      scoringSystem: scoringRules.system,
      bestOfGames: scoringRules.bestOfGames,
      gameTimeLimit: scoringRules.gameTimeLimit,
      setTimeLimit: scoringRules.setTimeLimit,
      restPeriod: scoringRules.restPeriod,
    });
  }

  /**
   * Update player restrictions
   */
  static async updatePlayerRestrictions(
    sessionId: string,
    restrictions: {
      minAge?: number;
      maxAge?: number;
      skillLevelMin?: 'beginner' | 'intermediate' | 'advanced';
      skillLevelMax?: 'beginner' | 'intermediate' | 'advanced';
      genderPreference?: 'male' | 'female' | 'mixed';
      maxSkillGap?: number;
    }
  ): Promise<SessionConfiguration> {
    return this.updateConfiguration(sessionId, {
      minAge: restrictions.minAge,
      maxAge: restrictions.maxAge,
      skillLevelMin: restrictions.skillLevelMin,
      skillLevelMax: restrictions.skillLevelMax,
      genderPreference: restrictions.genderPreference,
      maxSkillGap: restrictions.maxSkillGap,
    });
  }

  /**
   * Update notification settings
   */
  static async updateNotificationSettings(
    sessionId: string,
    notifications: {
      reminderTiming?: {
        session_start: number[];
        session_changes: boolean;
        player_joins: boolean;
        player_leaves: boolean;
      };
      updateFrequency?: 'real_time' | 'hourly' | 'daily';
      notifyOnJoin?: boolean;
      notifyOnLeave?: boolean;
      notifyOnStatus?: boolean;
    }
  ): Promise<SessionConfiguration> {
    return this.updateConfiguration(sessionId, {
      reminderTiming: notifications.reminderTiming,
      updateFrequency: notifications.updateFrequency,
      notifyOnJoin: notifications.notifyOnJoin,
      notifyOnLeave: notifications.notifyOnLeave,
      notifyOnStatus: notifications.notifyOnStatus,
    });
  }

  /**
   * Update privacy settings
   */
  static async updatePrivacySettings(
    sessionId: string,
    privacy: {
      requireApproval?: boolean;
      inviteOnly?: boolean;
      maxWaitlist?: number;
      accessCode?: string;
    }
  ): Promise<SessionConfiguration> {
    return this.updateConfiguration(sessionId, {
      requireApproval: privacy.requireApproval,
      inviteOnly: privacy.inviteOnly,
      maxWaitlist: privacy.maxWaitlist,
      accessCode: privacy.accessCode,
    });
  }
}