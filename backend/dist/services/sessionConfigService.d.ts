import { SessionConfiguration, ConfigurationValidationResult } from '../types/sessionConfig';
export declare class SessionConfigService {
    /**
     * Create or update session configuration
     */
    static upsertConfiguration(sessionId: string, config: Partial<SessionConfiguration>): Promise<SessionConfiguration>;
    /**
     * Get session configuration
     */
    static getConfiguration(sessionId: string): Promise<SessionConfiguration | null>;
    /**
     * Get configuration with defaults merged
     */
    static getConfigurationWithDefaults(sessionId: string): Promise<SessionConfiguration>;
    /**
     * Delete session configuration (reset to defaults)
     */
    static deleteConfiguration(sessionId: string): Promise<void>;
    /**
     * Validate configuration
     */
    static validateConfiguration(config: SessionConfiguration): Promise<ConfigurationValidationResult>;
    /**
     * Get configuration presets for common scenarios
     */
    static getConfigurationPresets(): Record<string, Partial<SessionConfiguration>>;
    /**
     * Map database model to configuration interface
     */
    private static mapDbToConfig;
}
//# sourceMappingURL=sessionConfigService.d.ts.map