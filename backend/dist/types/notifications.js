"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationCategory = exports.NotificationType = void 0;
var NotificationType;
(function (NotificationType) {
    NotificationType["MATCH_RESULT"] = "MATCH_RESULT";
    NotificationType["ACHIEVEMENT_UNLOCK"] = "ACHIEVEMENT_UNLOCK";
    NotificationType["FRIEND_REQUEST"] = "FRIEND_REQUEST";
    NotificationType["FRIEND_ACCEPTED"] = "FRIEND_ACCEPTED";
    NotificationType["CHALLENGE_RECEIVED"] = "CHALLENGE_RECEIVED";
    NotificationType["CHALLENGE_RESPONSE"] = "CHALLENGE_RESPONSE";
    NotificationType["TOURNAMENT_UPDATE"] = "TOURNAMENT_UPDATE";
    NotificationType["SESSION_REMINDER"] = "SESSION_REMINDER";
    NotificationType["SOCIAL_MESSAGE"] = "SOCIAL_MESSAGE";
    NotificationType["SYSTEM_ANNOUNCEMENT"] = "SYSTEM_ANNOUNCEMENT";
})(NotificationType || (exports.NotificationType = NotificationType = {}));
var NotificationCategory;
(function (NotificationCategory) {
    NotificationCategory["MATCHES"] = "MATCHES";
    NotificationCategory["ACHIEVEMENTS"] = "ACHIEVEMENTS";
    NotificationCategory["SOCIAL"] = "SOCIAL";
    NotificationCategory["TOURNAMENTS"] = "TOURNAMENTS";
    NotificationCategory["SESSIONS"] = "SESSIONS";
    NotificationCategory["SYSTEM"] = "SYSTEM";
})(NotificationCategory || (exports.NotificationCategory = NotificationCategory = {}));
//# sourceMappingURL=notifications.js.map