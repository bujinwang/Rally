"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportFormat = exports.NotificationPriority = exports.MaintenanceStatus = exports.MaintenancePriority = exports.VenueType = exports.CourtReportType = exports.CourtNotificationType = exports.PricingRuleType = exports.CourtMaintenanceType = exports.PaymentStatus = exports.BookingType = exports.BookingStatus = exports.CourtCondition = exports.CourtStatus = exports.NetHeight = exports.SurfaceType = exports.CourtType = void 0;
// Enums
var CourtType;
(function (CourtType) {
    CourtType["INDOOR"] = "INDOOR";
    CourtType["OUTDOOR"] = "OUTDOOR";
    CourtType["MIXED"] = "MIXED";
})(CourtType || (exports.CourtType = CourtType = {}));
var SurfaceType;
(function (SurfaceType) {
    SurfaceType["WOOD"] = "WOOD";
    SurfaceType["SYNTHETIC"] = "SYNTHETIC";
    SurfaceType["CARPET"] = "CARPET";
    SurfaceType["CONCRETE"] = "CONCRETE";
    SurfaceType["GRASS"] = "GRASS";
    SurfaceType["OTHER"] = "OTHER";
})(SurfaceType || (exports.SurfaceType = SurfaceType = {}));
var NetHeight;
(function (NetHeight) {
    NetHeight["STANDARD"] = "STANDARD";
    NetHeight["ADJUSTABLE"] = "ADJUSTABLE";
    NetHeight["LOW"] = "LOW";
    NetHeight["HIGH"] = "HIGH";
})(NetHeight || (exports.NetHeight = NetHeight = {}));
var CourtStatus;
(function (CourtStatus) {
    CourtStatus["AVAILABLE"] = "AVAILABLE";
    CourtStatus["BOOKED"] = "BOOKED";
    CourtStatus["MAINTENANCE"] = "MAINTENANCE";
    CourtStatus["CLOSED"] = "CLOSED";
    CourtStatus["OUT_OF_ORDER"] = "OUT_OF_ORDER";
})(CourtStatus || (exports.CourtStatus = CourtStatus = {}));
var CourtCondition;
(function (CourtCondition) {
    CourtCondition["EXCELLENT"] = "EXCELLENT";
    CourtCondition["GOOD"] = "GOOD";
    CourtCondition["FAIR"] = "FAIR";
    CourtCondition["POOR"] = "POOR";
    CourtCondition["DAMAGED"] = "DAMAGED";
    CourtCondition["UNUSABLE"] = "UNUSABLE";
})(CourtCondition || (exports.CourtCondition = CourtCondition = {}));
var BookingStatus;
(function (BookingStatus) {
    BookingStatus["PENDING"] = "PENDING";
    BookingStatus["CONFIRMED"] = "CONFIRMED";
    BookingStatus["ACTIVE"] = "ACTIVE";
    BookingStatus["COMPLETED"] = "COMPLETED";
    BookingStatus["CANCELLED"] = "CANCELLED";
    BookingStatus["NO_SHOW"] = "NO_SHOW";
})(BookingStatus || (exports.BookingStatus = BookingStatus = {}));
var BookingType;
(function (BookingType) {
    BookingType["CASUAL"] = "CASUAL";
    BookingType["TOURNAMENT"] = "TOURNAMENT";
    BookingType["LESSON"] = "LESSON";
    BookingType["PRACTICE"] = "PRACTICE";
    BookingType["EVENT"] = "EVENT";
    BookingType["MAINTENANCE"] = "MAINTENANCE";
})(BookingType || (exports.BookingType = BookingType = {}));
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING"] = "PENDING";
    PaymentStatus["PAID"] = "PAID";
    PaymentStatus["REFUNDED"] = "REFUNDED";
    PaymentStatus["PARTIALLY_REFUNDED"] = "PARTIALLY_REFUNDED";
    PaymentStatus["FAILED"] = "FAILED";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
var CourtMaintenanceType;
(function (CourtMaintenanceType) {
    CourtMaintenanceType["ROUTINE_INSPECTION"] = "ROUTINE_INSPECTION";
    CourtMaintenanceType["NET_REPLACEMENT"] = "NET_REPLACEMENT";
    CourtMaintenanceType["SURFACE_CLEANING"] = "SURFACE_CLEANING";
    CourtMaintenanceType["LIGHTING_REPAIR"] = "LIGHTING_REPAIR";
    CourtMaintenanceType["FLOOR_REFINISHING"] = "FLOOR_REFINISHING";
    CourtMaintenanceType["NET_HEIGHT_ADJUSTMENT"] = "NET_HEIGHT_ADJUSTMENT";
    CourtMaintenanceType["MARKING_REPAINT"] = "MARKING_REPAINT";
    CourtMaintenanceType["STRUCTURAL_REPAIR"] = "STRUCTURAL_REPAIR";
    CourtMaintenanceType["DEEP_CLEANING"] = "DEEP_CLEANING";
    CourtMaintenanceType["EQUIPMENT_CHECK"] = "EQUIPMENT_CHECK";
})(CourtMaintenanceType || (exports.CourtMaintenanceType = CourtMaintenanceType = {}));
var PricingRuleType;
(function (PricingRuleType) {
    PricingRuleType["BASE_RATE"] = "BASE_RATE";
    PricingRuleType["PEAK_HOURS"] = "PEAK_HOURS";
    PricingRuleType["OFF_PEAK"] = "OFF_PEAK";
    PricingRuleType["MEMBER_DISCOUNT"] = "MEMBER_DISCOUNT";
    PricingRuleType["STUDENT_DISCOUNT"] = "STUDENT_DISCOUNT";
    PricingRuleType["SENIOR_DISCOUNT"] = "SENIOR_DISCOUNT";
    PricingRuleType["GROUP_DISCOUNT"] = "GROUP_DISCOUNT";
    PricingRuleType["PROMOTIONAL"] = "PROMOTIONAL";
    PricingRuleType["HOLIDAY_RATE"] = "HOLIDAY_RATE";
})(PricingRuleType || (exports.PricingRuleType = PricingRuleType = {}));
var CourtNotificationType;
(function (CourtNotificationType) {
    CourtNotificationType["BOOKING_CONFIRMED"] = "BOOKING_CONFIRMED";
    CourtNotificationType["BOOKING_CANCELLED"] = "BOOKING_CANCELLED";
    CourtNotificationType["BOOKING_REMINDER"] = "BOOKING_REMINDER";
    CourtNotificationType["PAYMENT_DUE"] = "PAYMENT_DUE";
    CourtNotificationType["COURT_MAINTENANCE"] = "COURT_MAINTENANCE";
    CourtNotificationType["AVAILABILITY_CHANGE"] = "AVAILABILITY_CHANGE";
    CourtNotificationType["PRICE_CHANGE"] = "PRICE_CHANGE";
    CourtNotificationType["COURT_CLOSED"] = "COURT_CLOSED";
    CourtNotificationType["BOOKING_OVERDUE"] = "BOOKING_OVERDUE";
})(CourtNotificationType || (exports.CourtNotificationType = CourtNotificationType = {}));
var CourtReportType;
(function (CourtReportType) {
    CourtReportType["BOOKING_SUMMARY"] = "BOOKING_SUMMARY";
    CourtReportType["REVENUE_ANALYSIS"] = "REVENUE_ANALYSIS";
    CourtReportType["UTILIZATION_REPORT"] = "UTILIZATION_REPORT";
    CourtReportType["MAINTENANCE_SCHEDULE"] = "MAINTENANCE_SCHEDULE";
    CourtReportType["CUSTOMER_ANALYTICS"] = "CUSTOMER_ANALYTICS";
    CourtReportType["COURT_PERFORMANCE"] = "COURT_PERFORMANCE";
})(CourtReportType || (exports.CourtReportType = CourtReportType = {}));
var VenueType;
(function (VenueType) {
    VenueType["SPORTS_CENTER"] = "SPORTS_CENTER";
    VenueType["SCHOOL"] = "SCHOOL";
    VenueType["UNIVERSITY"] = "UNIVERSITY";
    VenueType["COMMUNITY_CENTER"] = "COMMUNITY_CENTER";
    VenueType["PRIVATE_CLUB"] = "PRIVATE_CLUB";
    VenueType["HOTEL"] = "HOTEL";
    VenueType["STADIUM"] = "STADIUM";
    VenueType["OTHER"] = "OTHER";
})(VenueType || (exports.VenueType = VenueType = {}));
// Re-export common enums from equipment types
var equipment_1 = require("./equipment");
Object.defineProperty(exports, "MaintenancePriority", { enumerable: true, get: function () { return equipment_1.MaintenancePriority; } });
Object.defineProperty(exports, "MaintenanceStatus", { enumerable: true, get: function () { return equipment_1.MaintenanceStatus; } });
Object.defineProperty(exports, "NotificationPriority", { enumerable: true, get: function () { return equipment_1.NotificationPriority; } });
Object.defineProperty(exports, "ReportFormat", { enumerable: true, get: function () { return equipment_1.ReportFormat; } });
//# sourceMappingURL=courts.js.map