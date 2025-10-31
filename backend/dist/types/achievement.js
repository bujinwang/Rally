"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RewardType = exports.BadgeRarity = exports.AchievementRarity = exports.AchievementTriggerType = exports.AchievementCategory = void 0;
// Achievement Enums (matching Prisma schema)
var AchievementCategory;
(function (AchievementCategory) {
    AchievementCategory["MATCH_PLAYING"] = "MATCH_PLAYING";
    AchievementCategory["TOURNAMENT"] = "TOURNAMENT";
    AchievementCategory["SOCIAL"] = "SOCIAL";
    AchievementCategory["PROGRESSION"] = "PROGRESSION";
    AchievementCategory["SPECIAL"] = "SPECIAL";
})(AchievementCategory || (exports.AchievementCategory = AchievementCategory = {}));
var AchievementTriggerType;
(function (AchievementTriggerType) {
    AchievementTriggerType["MATCH_WIN"] = "MATCH_WIN";
    AchievementTriggerType["MATCH_PLAY"] = "MATCH_PLAY";
    AchievementTriggerType["TOURNAMENT_WIN"] = "TOURNAMENT_WIN";
    AchievementTriggerType["TOURNAMENT_PARTICIPATE"] = "TOURNAMENT_PARTICIPATE";
    AchievementTriggerType["STREAK"] = "STREAK";
    AchievementTriggerType["PERFECT_GAME"] = "PERFECT_GAME";
    AchievementTriggerType["SOCIAL_FRIEND"] = "SOCIAL_FRIEND";
    AchievementTriggerType["SESSION_HOST"] = "SESSION_HOST";
    AchievementTriggerType["SKILL_LEVEL"] = "SKILL_LEVEL";
    AchievementTriggerType["TIME_PLAYED"] = "TIME_PLAYED";
    AchievementTriggerType["CUSTOM"] = "CUSTOM";
})(AchievementTriggerType || (exports.AchievementTriggerType = AchievementTriggerType = {}));
var AchievementRarity;
(function (AchievementRarity) {
    AchievementRarity["COMMON"] = "COMMON";
    AchievementRarity["UNCOMMON"] = "UNCOMMON";
    AchievementRarity["RARE"] = "RARE";
    AchievementRarity["EPIC"] = "EPIC";
    AchievementRarity["LEGENDARY"] = "LEGENDARY";
})(AchievementRarity || (exports.AchievementRarity = AchievementRarity = {}));
var BadgeRarity;
(function (BadgeRarity) {
    BadgeRarity["COMMON"] = "COMMON";
    BadgeRarity["UNCOMMON"] = "UNCOMMON";
    BadgeRarity["RARE"] = "RARE";
    BadgeRarity["EPIC"] = "EPIC";
    BadgeRarity["LEGENDARY"] = "LEGENDARY";
})(BadgeRarity || (exports.BadgeRarity = BadgeRarity = {}));
var RewardType;
(function (RewardType) {
    RewardType["POINTS"] = "POINTS";
    RewardType["BADGE"] = "BADGE";
    RewardType["TITLE"] = "TITLE";
    RewardType["AVATAR"] = "AVATAR";
    RewardType["BOOSTER"] = "BOOSTER";
    RewardType["UNLOCK"] = "UNLOCK";
})(RewardType || (exports.RewardType = RewardType = {}));
//# sourceMappingURL=achievement.js.map