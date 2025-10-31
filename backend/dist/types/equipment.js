"use strict";
// Equipment Management Types
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportFormat = exports.ReportType = exports.NotificationPriority = exports.NotificationType = exports.MaintenanceStatus = exports.MaintenancePriority = exports.MaintenanceType = exports.ReservationStatus = exports.EquipmentStatus = exports.EquipmentCondition = exports.EquipmentType = exports.EquipmentCategory = void 0;
// Enums
var EquipmentCategory;
(function (EquipmentCategory) {
    EquipmentCategory["RACKETS"] = "RACKETS";
    EquipmentCategory["SHUTTLECOCKS"] = "SHUTTLECOCKS";
    EquipmentCategory["NETS"] = "NETS";
    EquipmentCategory["POSTS"] = "POSTS";
    EquipmentCategory["LIGHTING"] = "LIGHTING";
    EquipmentCategory["SCOREBOARDS"] = "SCOREBOARDS";
    EquipmentCategory["CHAIRS"] = "CHAIRS";
    EquipmentCategory["TABLES"] = "TABLES";
    EquipmentCategory["FIRST_AID"] = "FIRST_AID";
    EquipmentCategory["CLEANING"] = "CLEANING";
    EquipmentCategory["MISCELLANEOUS"] = "MISCELLANEOUS";
})(EquipmentCategory || (exports.EquipmentCategory = EquipmentCategory = {}));
var EquipmentType;
(function (EquipmentType) {
    EquipmentType["BADMINTON_RACKET"] = "BADMINTON_RACKET";
    EquipmentType["TENNIS_RACKET"] = "TENNIS_RACKET";
    EquipmentType["SHUTTLECOCK"] = "SHUTTLECOCK";
    EquipmentType["NET"] = "NET";
    EquipmentType["POST_SET"] = "POST_SET";
    EquipmentType["LIGHT_FIXTURE"] = "LIGHT_FIXTURE";
    EquipmentType["SCOREBOARD"] = "SCOREBOARD";
    EquipmentType["CHAIR"] = "CHAIR";
    EquipmentType["TABLE"] = "TABLE";
    EquipmentType["FIRST_AID_KIT"] = "FIRST_AID_KIT";
    EquipmentType["CLEANING_SUPPLIES"] = "CLEANING_SUPPLIES";
    EquipmentType["OTHER"] = "OTHER";
})(EquipmentType || (exports.EquipmentType = EquipmentType = {}));
var EquipmentCondition;
(function (EquipmentCondition) {
    EquipmentCondition["EXCELLENT"] = "EXCELLENT";
    EquipmentCondition["GOOD"] = "GOOD";
    EquipmentCondition["FAIR"] = "FAIR";
    EquipmentCondition["POOR"] = "POOR";
    EquipmentCondition["DAMAGED"] = "DAMAGED";
    EquipmentCondition["UNUSABLE"] = "UNUSABLE";
})(EquipmentCondition || (exports.EquipmentCondition = EquipmentCondition = {}));
var EquipmentStatus;
(function (EquipmentStatus) {
    EquipmentStatus["AVAILABLE"] = "AVAILABLE";
    EquipmentStatus["RESERVED"] = "RESERVED";
    EquipmentStatus["CHECKED_OUT"] = "CHECKED_OUT";
    EquipmentStatus["MAINTENANCE"] = "MAINTENANCE";
    EquipmentStatus["LOST"] = "LOST";
    EquipmentStatus["RETIRED"] = "RETIRED";
})(EquipmentStatus || (exports.EquipmentStatus = EquipmentStatus = {}));
var ReservationStatus;
(function (ReservationStatus) {
    ReservationStatus["PENDING"] = "PENDING";
    ReservationStatus["APPROVED"] = "APPROVED";
    ReservationStatus["ACTIVE"] = "ACTIVE";
    ReservationStatus["RETURNED"] = "RETURNED";
    ReservationStatus["OVERDUE"] = "OVERDUE";
    ReservationStatus["CANCELLED"] = "CANCELLED";
    ReservationStatus["LOST"] = "LOST";
})(ReservationStatus || (exports.ReservationStatus = ReservationStatus = {}));
var MaintenanceType;
(function (MaintenanceType) {
    MaintenanceType["ROUTINE_INSPECTION"] = "ROUTINE_INSPECTION";
    MaintenanceType["REPAIR"] = "REPAIR";
    MaintenanceType["REPLACEMENT"] = "REPLACEMENT";
    MaintenanceType["CLEANING"] = "CLEANING";
    MaintenanceType["CALIBRATION"] = "CALIBRATION";
    MaintenanceType["UPGRADE"] = "UPGRADE";
    MaintenanceType["DISPOSAL"] = "DISPOSAL";
})(MaintenanceType || (exports.MaintenanceType = MaintenanceType = {}));
var MaintenancePriority;
(function (MaintenancePriority) {
    MaintenancePriority["LOW"] = "LOW";
    MaintenancePriority["MEDIUM"] = "MEDIUM";
    MaintenancePriority["HIGH"] = "HIGH";
    MaintenancePriority["CRITICAL"] = "CRITICAL";
    MaintenancePriority["EMERGENCY"] = "EMERGENCY";
})(MaintenancePriority || (exports.MaintenancePriority = MaintenancePriority = {}));
var MaintenanceStatus;
(function (MaintenanceStatus) {
    MaintenanceStatus["SCHEDULED"] = "SCHEDULED";
    MaintenanceStatus["IN_PROGRESS"] = "IN_PROGRESS";
    MaintenanceStatus["COMPLETED"] = "COMPLETED";
    MaintenanceStatus["CANCELLED"] = "CANCELLED";
    MaintenanceStatus["OVERDUE"] = "OVERDUE";
})(MaintenanceStatus || (exports.MaintenanceStatus = MaintenanceStatus = {}));
var NotificationType;
(function (NotificationType) {
    NotificationType["RESERVATION_APPROVED"] = "RESERVATION_APPROVED";
    NotificationType["RESERVATION_REJECTED"] = "RESERVATION_REJECTED";
    NotificationType["RESERVATION_OVERDUE"] = "RESERVATION_OVERDUE";
    NotificationType["EQUIPMENT_RETURN_REMINDER"] = "EQUIPMENT_RETURN_REMINDER";
    NotificationType["MAINTENANCE_DUE"] = "MAINTENANCE_DUE";
    NotificationType["EQUIPMENT_DAMAGED"] = "EQUIPMENT_DAMAGED";
    NotificationType["EQUIPMENT_LOST"] = "EQUIPMENT_LOST";
    NotificationType["LOW_INVENTORY"] = "LOW_INVENTORY";
    NotificationType["MAINTENANCE_COMPLETED"] = "MAINTENANCE_COMPLETED";
})(NotificationType || (exports.NotificationType = NotificationType = {}));
var NotificationPriority;
(function (NotificationPriority) {
    NotificationPriority["LOW"] = "LOW";
    NotificationPriority["MEDIUM"] = "MEDIUM";
    NotificationPriority["HIGH"] = "HIGH";
})(NotificationPriority || (exports.NotificationPriority = NotificationPriority = {}));
var ReportType;
(function (ReportType) {
    ReportType["INVENTORY_STATUS"] = "INVENTORY_STATUS";
    ReportType["USAGE_ANALYTICS"] = "USAGE_ANALYTICS";
    ReportType["MAINTENANCE_SCHEDULE"] = "MAINTENANCE_SCHEDULE";
    ReportType["RESERVATION_HISTORY"] = "RESERVATION_HISTORY";
    ReportType["COST_ANALYSIS"] = "COST_ANALYSIS";
    ReportType["UTILIZATION_REPORT"] = "UTILIZATION_REPORT";
})(ReportType || (exports.ReportType = ReportType = {}));
var ReportFormat;
(function (ReportFormat) {
    ReportFormat["JSON"] = "JSON";
    ReportFormat["CSV"] = "CSV";
    ReportFormat["PDF"] = "PDF";
})(ReportFormat || (exports.ReportFormat = ReportFormat = {}));
//# sourceMappingURL=equipment.js.map