export interface Equipment {
    id: string;
    name: string;
    description?: string;
    category: EquipmentCategory;
    type: EquipmentType;
    brand?: string;
    model?: string;
    serialNumber?: string;
    purchaseDate?: Date;
    purchasePrice?: number;
    currency: string;
    condition: EquipmentCondition;
    status: EquipmentStatus;
    location: string;
    venueId?: string;
    quantity: number;
    availableQuantity: number;
    maxReservationTime?: number;
    requiresMaintenance: boolean;
    lastMaintenanceDate?: Date;
    nextMaintenanceDate?: Date;
    maintenanceInterval?: number;
    images: string[];
    tags: string[];
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
}
export interface EquipmentReservation {
    id: string;
    equipmentId: string;
    equipment?: Equipment;
    userId: string;
    sessionId?: string;
    quantity: number;
    reservedAt: Date;
    reservedUntil: Date;
    status: ReservationStatus;
    purpose?: string;
    notes?: string;
    approvedBy?: string;
    approvedAt?: Date;
    returnedAt?: Date;
    returnCondition?: EquipmentCondition;
    returnNotes?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface EquipmentMaintenance {
    id: string;
    equipmentId: string;
    equipment?: Equipment;
    maintenanceType: MaintenanceType;
    description: string;
    priority: MaintenancePriority;
    scheduledDate?: Date;
    completedDate?: Date;
    cost?: number;
    currency: string;
    partsUsed: string[];
    performedBy?: string;
    notes?: string;
    status: MaintenanceStatus;
    createdAt: Date;
    updatedAt: Date;
}
export interface EquipmentNotification {
    id: string;
    userId: string;
    equipmentId?: string;
    reservationId?: string;
    type: NotificationType;
    title: string;
    message: string;
    priority: NotificationPriority;
    read: boolean;
    readAt?: Date;
    actionRequired: boolean;
    actionUrl?: string;
    createdAt: Date;
}
export interface EquipmentReport {
    id: string;
    type: ReportType;
    title: string;
    description?: string;
    filters: EquipmentSearchFilters;
    generatedBy: string;
    generatedAt: Date;
    data: any;
    format: ReportFormat;
    downloadUrl?: string;
}
export interface EquipmentSearchFilters {
    category?: EquipmentCategory[];
    type?: EquipmentType[];
    status?: EquipmentStatus[];
    condition?: EquipmentCondition[];
    location?: string;
    venueId?: string;
    availableOnly?: boolean;
    requiresMaintenance?: boolean;
    brand?: string;
    tags?: string[];
    priceRange?: {
        min: number;
        max: number;
    };
    dateRange?: {
        start: Date;
        end: Date;
    };
}
export interface EquipmentReservationRequest {
    equipmentId: string;
    quantity: number;
    reservedUntil: Date;
    purpose?: string;
    notes?: string;
}
export interface EquipmentCheckoutRequest {
    reservationId: string;
    checkedOutBy: string;
}
export interface EquipmentReturnRequest {
    reservationId: string;
    returnCondition: EquipmentCondition;
    returnNotes?: string;
}
export interface EquipmentUsageStats {
    equipmentId: string;
    totalReservations: number;
    totalUsageHours: number;
    averageUsagePerReservation: number;
    peakUsageTimes: any[];
    mostUsedBy: any[];
    maintenanceFrequency: number;
    averageLifespan: number;
    utilizationRate: number;
    period: {
        start: Date;
        end: Date;
    };
}
export interface EquipmentInventory {
    equipmentId: string;
    totalQuantity: number;
    availableQuantity: number;
    reservedQuantity: number;
    checkedOutQuantity: number;
    maintenanceQuantity: number;
    lostQuantity: number;
    lastUpdated: Date;
}
export declare enum EquipmentCategory {
    RACKETS = "RACKETS",
    SHUTTLECOCKS = "SHUTTLECOCKS",
    NETS = "NETS",
    POSTS = "POSTS",
    LIGHTING = "LIGHTING",
    SCOREBOARDS = "SCOREBOARDS",
    CHAIRS = "CHAIRS",
    TABLES = "TABLES",
    FIRST_AID = "FIRST_AID",
    CLEANING = "CLEANING",
    MISCELLANEOUS = "MISCELLANEOUS"
}
export declare enum EquipmentType {
    BADMINTON_RACKET = "BADMINTON_RACKET",
    TENNIS_RACKET = "TENNIS_RACKET",
    SHUTTLECOCK = "SHUTTLECOCK",
    NET = "NET",
    POST_SET = "POST_SET",
    LIGHT_FIXTURE = "LIGHT_FIXTURE",
    SCOREBOARD = "SCOREBOARD",
    CHAIR = "CHAIR",
    TABLE = "TABLE",
    FIRST_AID_KIT = "FIRST_AID_KIT",
    CLEANING_SUPPLIES = "CLEANING_SUPPLIES",
    OTHER = "OTHER"
}
export declare enum EquipmentCondition {
    EXCELLENT = "EXCELLENT",
    GOOD = "GOOD",
    FAIR = "FAIR",
    POOR = "POOR",
    DAMAGED = "DAMAGED",
    UNUSABLE = "UNUSABLE"
}
export declare enum EquipmentStatus {
    AVAILABLE = "AVAILABLE",
    RESERVED = "RESERVED",
    CHECKED_OUT = "CHECKED_OUT",
    MAINTENANCE = "MAINTENANCE",
    LOST = "LOST",
    RETIRED = "RETIRED"
}
export declare enum ReservationStatus {
    PENDING = "PENDING",
    APPROVED = "APPROVED",
    ACTIVE = "ACTIVE",
    RETURNED = "RETURNED",
    OVERDUE = "OVERDUE",
    CANCELLED = "CANCELLED",
    LOST = "LOST"
}
export declare enum MaintenanceType {
    ROUTINE_INSPECTION = "ROUTINE_INSPECTION",
    REPAIR = "REPAIR",
    REPLACEMENT = "REPLACEMENT",
    CLEANING = "CLEANING",
    CALIBRATION = "CALIBRATION",
    UPGRADE = "UPGRADE",
    DISPOSAL = "DISPOSAL"
}
export declare enum MaintenancePriority {
    LOW = "LOW",
    MEDIUM = "MEDIUM",
    HIGH = "HIGH",
    CRITICAL = "CRITICAL",
    EMERGENCY = "EMERGENCY"
}
export declare enum MaintenanceStatus {
    SCHEDULED = "SCHEDULED",
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED",
    OVERDUE = "OVERDUE"
}
export declare enum NotificationType {
    RESERVATION_APPROVED = "RESERVATION_APPROVED",
    RESERVATION_REJECTED = "RESERVATION_REJECTED",
    RESERVATION_OVERDUE = "RESERVATION_OVERDUE",
    EQUIPMENT_RETURN_REMINDER = "EQUIPMENT_RETURN_REMINDER",
    MAINTENANCE_DUE = "MAINTENANCE_DUE",
    EQUIPMENT_DAMAGED = "EQUIPMENT_DAMAGED",
    EQUIPMENT_LOST = "EQUIPMENT_LOST",
    LOW_INVENTORY = "LOW_INVENTORY",
    MAINTENANCE_COMPLETED = "MAINTENANCE_COMPLETED"
}
export declare enum NotificationPriority {
    LOW = "LOW",
    MEDIUM = "MEDIUM",
    HIGH = "HIGH"
}
export declare enum ReportType {
    INVENTORY_STATUS = "INVENTORY_STATUS",
    USAGE_ANALYTICS = "USAGE_ANALYTICS",
    MAINTENANCE_SCHEDULE = "MAINTENANCE_SCHEDULE",
    RESERVATION_HISTORY = "RESERVATION_HISTORY",
    COST_ANALYSIS = "COST_ANALYSIS",
    UTILIZATION_REPORT = "UTILIZATION_REPORT"
}
export declare enum ReportFormat {
    JSON = "JSON",
    CSV = "CSV",
    PDF = "PDF"
}
//# sourceMappingURL=equipment.d.ts.map