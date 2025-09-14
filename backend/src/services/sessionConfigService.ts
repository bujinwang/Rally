import { PrismaClient } from '@prisma/client';
import {
  SessionConfiguration,
  DEFAULT_SESSION_CONFIG,
  ConfigurationValidationResult,
  CourtConfiguration,
  ScoringRules,
  EquipmentRequirements,
  PlayerRestrictions,
  AdvancedScheduling,
  CostStructure,
  NotificationSettings,
  PrivacySettings,
  GameRules,
} from '../types/sessionConfig';

const prisma = new PrismaClient();

export class SessionConfigService {
  /**
   * Create or update session configuration
   */
  static async upsertConfiguration(
    sessionId: string,
    config: Partial<SessionConfiguration>
  ): Promise<SessionConfiguration> {
    // Merge with defaults
    const fullConfig = { ...DEFAULT_SESSION_CONFIG, ...config };

    // Validate configuration
    const validation = await this.validateConfiguration(fullConfig);
    if (!validation.isValid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }

    const configuration = await prisma.mvpSessionConfiguration.upsert({
      where: { sessionId },
      update: {
        // Court Configuration
        courtSurface: fullConfig.courtSurface,
        courtLighting: fullConfig.courtLighting,
        courtFacilities: fullConfig.courtFacilities,

        // Scoring and Game Rules
        scoringSystem: fullConfig.scoringSystem,
        bestOfGames: fullConfig.bestOfGames,
        gameTimeLimit: fullConfig.gameTimeLimit,
        setTimeLimit: fullConfig.setTimeLimit,
        restPeriod: fullConfig.restPeriod,

        // Equipment Requirements
        racketRequired: fullConfig.racketRequired,
        shuttlecockType: fullConfig.shuttlecockType,
        equipmentRental: fullConfig.equipmentRental,

        // Player Restrictions
        minAge: fullConfig.minAge,
        maxAge: fullConfig.maxAge,
        skillLevelMin: fullConfig.skillLevelMin,
        skillLevelMax: fullConfig.skillLevelMax,
        genderPreference: fullConfig.genderPreference,
        maxSkillGap: fullConfig.maxSkillGap,

        // Advanced Scheduling
        setupTime: fullConfig.setupTime,
        bufferTime: fullConfig.bufferTime,
        recurrenceEndDate: fullConfig.recurrenceEndDate,

        // Cost Structure
        baseCost: fullConfig.baseCost,
        costPerPlayer: fullConfig.costPerPlayer,
        costPerCourt: fullConfig.costPerCourt,
        paymentMethods: fullConfig.paymentMethods,
        discounts: fullConfig.discounts,

        // Notification Settings
        reminderTiming: fullConfig.reminderTiming,
        updateFrequency: fullConfig.updateFrequency,
        notifyOnJoin: fullConfig.notifyOnJoin,
        notifyOnLeave: fullConfig.notifyOnLeave,
        notifyOnStatus: fullConfig.notifyOnStatus,

        // Privacy and Access Control
        requireApproval: fullConfig.requireApproval,
        inviteOnly: fullConfig.inviteOnly,
        maxWaitlist: fullConfig.maxWaitlist,
        accessCode: fullConfig.accessCode,

        // Custom Rules
        customRules: fullConfig.customRules,
        substitutions: fullConfig.substitutions,
        coachingAllowed: fullConfig.coachingAllowed,
      },
      create: {
        sessionId,
        // Court Configuration
        courtSurface: fullConfig.courtSurface,
        courtLighting: fullConfig.courtLighting,
        courtFacilities: fullConfig.courtFacilities,

        // Scoring and Game Rules
        scoringSystem: fullConfig.scoringSystem,
        bestOfGames: fullConfig.bestOfGames,
        gameTimeLimit: fullConfig.gameTimeLimit,
        setTimeLimit: fullConfig.setTimeLimit,
        restPeriod: fullConfig.restPeriod,

        // Equipment Requirements
        racketRequired: fullConfig.racketRequired,
        shuttlecockType: fullConfig.shuttlecockType,
        equipmentRental: fullConfig.equipmentRental,

        // Player Restrictions
        minAge: fullConfig.minAge,
        maxAge: fullConfig.maxAge,
        skillLevelMin: fullConfig.skillLevelMin,
        skillLevelMax: fullConfig.skillLevelMax,
        genderPreference: fullConfig.genderPreference,
        maxSkillGap: fullConfig.maxSkillGap,

        // Advanced Scheduling
        setupTime: fullConfig.setupTime,
        bufferTime: fullConfig.bufferTime,
        recurrenceEndDate: fullConfig.recurrenceEndDate,

        // Cost Structure
        baseCost: fullConfig.baseCost,
        costPerPlayer: fullConfig.costPerPlayer,
        costPerCourt: fullConfig.costPerCourt,
        paymentMethods: fullConfig.paymentMethods,
        discounts: fullConfig.discounts,

        // Notification Settings
        reminderTiming: fullConfig.reminderTiming,
        updateFrequency: fullConfig.updateFrequency,
        notifyOnJoin: fullConfig.notifyOnJoin,
        notifyOnLeave: fullConfig.notifyOnLeave,
        notifyOnStatus: fullConfig.notifyOnStatus,

        // Privacy and Access Control
        requireApproval: fullConfig.requireApproval,
        inviteOnly: fullConfig.inviteOnly,
        maxWaitlist: fullConfig.maxWaitlist,
        accessCode: fullConfig.accessCode,

        // Custom Rules
        customRules: fullConfig.customRules,
        substitutions: fullConfig.substitutions,
        coachingAllowed: fullConfig.coachingAllowed,
      },
      include: {
        session: true,
      },
    });

    return this.mapDbToConfig(configuration);
  }

  /**
   * Get session configuration
   */
  static async getConfiguration(sessionId: string): Promise<SessionConfiguration | null> {
    const configuration = await prisma.mvpSessionConfiguration.findUnique({
      where: { sessionId },
    });

    if (!configuration) {
      return null;
    }

    return this.mapDbToConfig(configuration);
  }

  /**
   * Get configuration with defaults merged
   */
  static async getConfigurationWithDefaults(sessionId: string): Promise<SessionConfiguration> {
    const config = await this.getConfiguration(sessionId);
    return config ? { ...DEFAULT_SESSION_CONFIG, ...config } : DEFAULT_SESSION_CONFIG;
  }

  /**
   * Delete session configuration (reset to defaults)
   */
  static async deleteConfiguration(sessionId: string): Promise<void> {
    await prisma.mvpSessionConfiguration.delete({
      where: { sessionId },
    }).catch(() => {
      // Ignore if configuration doesn't exist
    });
  }

  /**
   * Validate configuration
   */
  static async validateConfiguration(config: SessionConfiguration): Promise<ConfigurationValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate scoring rules
    if (config.bestOfGames && ![1, 3, 5, 7].includes(config.bestOfGames)) {
      errors.push('bestOfGames must be 1, 3, 5, or 7');
    }

    // Validate age restrictions
    if (config.minAge && config.maxAge && config.minAge >= config.maxAge) {
      errors.push('minAge must be less than maxAge');
    }

    // Validate skill level restrictions
    if (config.skillLevelMin && config.skillLevelMax) {
      const skillLevels = ['beginner', 'intermediate', 'advanced'];
      const minIndex = skillLevels.indexOf(config.skillLevelMin);
      const maxIndex = skillLevels.indexOf(config.skillLevelMax);

      if (minIndex > maxIndex) {
        errors.push('skillLevelMin cannot be higher than skillLevelMax');
      }
    }

    // Validate time limits
    if (config.gameTimeLimit && config.gameTimeLimit < 5) {
      warnings.push('gameTimeLimit is very short (< 5 minutes)');
    }

    if (config.setTimeLimit && config.setTimeLimit < 10) {
      warnings.push('setTimeLimit is very short (< 10 minutes)');
    }

    // Validate cost structure
    if (config.baseCost && config.baseCost < 0) {
      errors.push('baseCost cannot be negative');
    }

    if (config.costPerPlayer && config.costPerPlayer < 0) {
      errors.push('costPerPlayer cannot be negative');
    }

    // Validate scheduling
    if (config.setupTime < 0) {
      errors.push('setupTime cannot be negative');
    }

    if (config.bufferTime < 0) {
      errors.push('bufferTime cannot be negative');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get configuration presets for common scenarios
   */
  static getConfigurationPresets(): Record<string, Partial<SessionConfiguration>> {
    return {
      casual: {
        scoringSystem: '21_POINT',
        bestOfGames: 1,
        restPeriod: 1,
        racketRequired: false,
        shuttlecockType: 'plastic',
        requireApproval: false,
        inviteOnly: false,
        substitutions: 'allowed',
        coachingAllowed: true,
      },
      competitive: {
        scoringSystem: '21_POINT',
        bestOfGames: 3,
        restPeriod: 2,
        racketRequired: true,
        shuttlecockType: 'feather',
        requireApproval: true,
        substitutions: 'limited',
        coachingAllowed: false,
        minAge: 16,
        skillLevelMin: 'intermediate',
      },
      tournament: {
        scoringSystem: '21_POINT',
        bestOfGames: 5,
        restPeriod: 3,
        racketRequired: true,
        shuttlecockType: 'feather',
        requireApproval: true,
        substitutions: 'not_allowed',
        coachingAllowed: false,
        minAge: 18,
        skillLevelMin: 'advanced',
        baseCost: 50,
      },
      beginners: {
        scoringSystem: '11_POINT',
        bestOfGames: 1,
        restPeriod: 1,
        racketRequired: false,
        shuttlecockType: 'plastic',
        requireApproval: false,
        skillLevelMax: 'beginner',
        substitutions: 'allowed',
        coachingAllowed: true,
      },
    };
  }

  /**
   * Map database model to configuration interface
   */
  private static mapDbToConfig(dbConfig: any): SessionConfiguration {
    return {
      // Court Configuration
      courtSurface: dbConfig.courtSurface,
      courtLighting: dbConfig.courtLighting,
      courtFacilities: dbConfig.courtFacilities,

      // Scoring and Game Rules
      scoringSystem: dbConfig.scoringSystem,
      bestOfGames: dbConfig.bestOfGames,
      gameTimeLimit: dbConfig.gameTimeLimit,
      setTimeLimit: dbConfig.setTimeLimit,
      restPeriod: dbConfig.restPeriod,

      // Equipment Requirements
      racketRequired: dbConfig.racketRequired,
      shuttlecockType: dbConfig.shuttlecockType,
      equipmentRental: dbConfig.equipmentRental,

      // Player Restrictions
      minAge: dbConfig.minAge,
      maxAge: dbConfig.maxAge,
      skillLevelMin: dbConfig.skillLevelMin,
      skillLevelMax: dbConfig.skillLevelMax,
      genderPreference: dbConfig.genderPreference,
      maxSkillGap: dbConfig.maxSkillGap,

      // Advanced Scheduling
      setupTime: dbConfig.setupTime,
      bufferTime: dbConfig.bufferTime,
      recurrenceEndDate: dbConfig.recurrenceEndDate,

      // Cost Structure
      baseCost: dbConfig.baseCost,
      costPerPlayer: dbConfig.costPerPlayer,
      costPerCourt: dbConfig.costPerCourt,
      paymentMethods: dbConfig.paymentMethods,
      discounts: dbConfig.discounts,

      // Notification Settings
      reminderTiming: dbConfig.reminderTiming,
      updateFrequency: dbConfig.updateFrequency,
      notifyOnJoin: dbConfig.notifyOnJoin,
      notifyOnLeave: dbConfig.notifyOnLeave,
      notifyOnStatus: dbConfig.notifyOnStatus,

      // Privacy and Access Control
      requireApproval: dbConfig.requireApproval,
      inviteOnly: dbConfig.inviteOnly,
      maxWaitlist: dbConfig.maxWaitlist,
      accessCode: dbConfig.accessCode,

      // Custom Rules
      customRules: dbConfig.customRules,
      substitutions: dbConfig.substitutions,
      coachingAllowed: dbConfig.coachingAllowed,
    };
  }
}