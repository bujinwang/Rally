export interface CourtConfiguration {
    surface: 'wood' | 'synthetic' | 'carpet' | 'grass' | 'rubber';
    lighting: 'natural' | 'artificial' | 'mixed';
    facilities: {
        showers: boolean;
        parking: boolean;
        equipmentRental: boolean;
        refreshments: boolean;
        seating: boolean;
    };
}
export interface ScoringRules {
    system: '21_POINT' | '15_POINT' | '11_POINT';
    bestOfGames: 1 | 3 | 5 | 7;
    gameTimeLimit?: number;
    setTimeLimit?: number;
    restPeriod: number;
    deuceRules: 'sudden_death' | 'advantage' | 'standard';
}
export interface EquipmentRequirements {
    racketRequired: boolean;
    racketType?: 'any' | 'club_provided' | 'bring_own';
    shuttlecockType: 'feather' | 'plastic' | 'mixed';
    equipmentRental: boolean;
    rentalCost?: number;
}
export interface PlayerRestrictions {
    minAge?: number;
    maxAge?: number;
    skillLevelMin?: 'beginner' | 'intermediate' | 'advanced';
    skillLevelMax?: 'beginner' | 'intermediate' | 'advanced';
    genderPreference?: 'male' | 'female' | 'mixed';
    maxSkillGap?: number;
    maxPlayers?: number;
    minPlayers?: number;
}
export interface AdvancedScheduling {
    setupTime: number;
    bufferTime: number;
    recurrenceEndDate?: Date;
    cancellationPolicy: 'flexible' | 'moderate' | 'strict';
    lateJoinAllowed: boolean;
    lateJoinGracePeriod?: number;
}
export interface CostStructure {
    baseCost?: number;
    costPerPlayer?: number;
    costPerCourt?: number;
    paymentMethods: {
        cash: boolean;
        card: boolean;
        digital_wallet: boolean;
        bank_transfer: boolean;
    };
    discounts: {
        earlyBird?: {
            enabled: boolean;
            discountPercent: number;
            hoursBefore: number;
        };
        group?: {
            enabled: boolean;
            minPlayers: number;
            discountPercent: number;
        };
        member?: {
            enabled: boolean;
            discountPercent: number;
        };
    };
}
export interface NotificationSettings {
    reminderTiming: {
        session_start: number[];
        session_changes: boolean;
        player_joins: boolean;
        player_leaves: boolean;
    };
    updateFrequency: 'real_time' | 'hourly' | 'daily';
    notifyOnJoin: boolean;
    notifyOnLeave: boolean;
    notifyOnStatus: boolean;
    notifyOnPairing: boolean;
    notifyOnResults: boolean;
}
export interface PrivacySettings {
    requireApproval: boolean;
    inviteOnly: boolean;
    maxWaitlist?: number;
    accessCode?: string;
    visibility: 'public' | 'private' | 'unlisted';
    allowGuests: boolean;
    guestLimit?: number;
}
export interface GameRules {
    customRules?: string[];
    substitutions: 'allowed' | 'limited' | 'not_allowed';
    coachingAllowed: boolean;
    injuryTimeouts: boolean;
    maxInjuryTimeouts?: number;
    protestAllowed: boolean;
    umpireRequired: boolean;
    lineJudgesRequired: boolean;
}
export interface SessionConfiguration {
    courtSurface?: CourtConfiguration['surface'];
    courtLighting?: CourtConfiguration['lighting'];
    courtFacilities?: CourtConfiguration['facilities'];
    scoringSystem: ScoringRules['system'];
    bestOfGames: ScoringRules['bestOfGames'];
    gameTimeLimit?: ScoringRules['gameTimeLimit'];
    setTimeLimit?: ScoringRules['setTimeLimit'];
    restPeriod: ScoringRules['restPeriod'];
    racketRequired: EquipmentRequirements['racketRequired'];
    shuttlecockType: EquipmentRequirements['shuttlecockType'];
    equipmentRental: EquipmentRequirements['equipmentRental'];
    minAge?: PlayerRestrictions['minAge'];
    maxAge?: PlayerRestrictions['maxAge'];
    skillLevelMin?: PlayerRestrictions['skillLevelMin'];
    skillLevelMax?: PlayerRestrictions['skillLevelMax'];
    genderPreference?: PlayerRestrictions['genderPreference'];
    maxSkillGap?: PlayerRestrictions['maxSkillGap'];
    setupTime: AdvancedScheduling['setupTime'];
    bufferTime: AdvancedScheduling['bufferTime'];
    recurrenceEndDate?: AdvancedScheduling['recurrenceEndDate'];
    baseCost?: CostStructure['baseCost'];
    costPerPlayer?: CostStructure['costPerPlayer'];
    costPerCourt?: CostStructure['costPerCourt'];
    paymentMethods?: CostStructure['paymentMethods'];
    discounts?: CostStructure['discounts'];
    reminderTiming?: NotificationSettings['reminderTiming'];
    updateFrequency: NotificationSettings['updateFrequency'];
    notifyOnJoin: NotificationSettings['notifyOnJoin'];
    notifyOnLeave: NotificationSettings['notifyOnLeave'];
    notifyOnStatus: NotificationSettings['notifyOnStatus'];
    requireApproval: PrivacySettings['requireApproval'];
    inviteOnly: PrivacySettings['inviteOnly'];
    maxWaitlist?: PrivacySettings['maxWaitlist'];
    accessCode?: PrivacySettings['accessCode'];
    customRules?: GameRules['customRules'];
    substitutions: GameRules['substitutions'];
    coachingAllowed: GameRules['coachingAllowed'];
}
export declare const DEFAULT_SESSION_CONFIG: SessionConfiguration;
export interface ConfigurationValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}
export type ConfigurationSection = 'court' | 'scoring' | 'equipment' | 'playerRestrictions' | 'scheduling' | 'cost' | 'notifications' | 'privacy' | 'rules';
//# sourceMappingURL=sessionConfig.d.ts.map