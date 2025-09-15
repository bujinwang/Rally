// Equipment Management Types

export interface Equipment {
  id: string;
  name: string;
  description?: string;

  // Classification
  category: EquipmentCategory;
  type: EquipmentType;

  // Product Information
  brand?: string;
  model?: string;
  serialNumber?: string;

  // Purchase Information
  purchaseDate?: Date;
  purchasePrice?: number;
  currency: string;

  // Condition and Status
  condition: EquipmentCondition;
  status: EquipmentStatus;

  // Location and Quantity
  location: string;
  venueId?: string;
  quantity: number;
  availableQuantity: number;

  // Maintenance
  maxReservationTime?: number; // in hours
  requiresMaintenance: boolean;
  lastMaintenanceDate?: Date;
  nextMaintenanceDate?: Date;
  maintenanceInterval?: number; // in days

  // Media
  images: string[]; // Array of image URLs
  tags: string[]; // Array of tags for search

  // Notes
  notes?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface EquipmentReservation {
  id: string;
  equipmentId: string;
  equipment?: Equipment;

  // Reservation Details
  userId: string;
  sessionId?: string;
  quantity: number;

  // Timing
  reservedAt: Date;
  reservedUntil: Date;
  status: ReservationStatus;

  // Purpose and Notes
  purpose?: string;
  notes?: string;

  // Approval Process
  approvedBy?: string;
  approvedAt?: Date;

  // Return Process
  returnedAt?: Date;
  returnCondition?: EquipmentCondition;
  returnNotes?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface EquipmentMaintenance {
  id: string;
  equipmentId: string;
  equipment?: Equipment;

  // Maintenance Details
  maintenanceType: MaintenanceType;
  description: string;
  priority: MaintenancePriority;

  // Scheduling
  scheduledDate?: Date;
  completedDate?: Date;

  // Cost and Parts
  cost?: number;
  currency: string;
  partsUsed: string[]; // Array of part names/descriptions

  // Assignment and Notes
  performedBy?: string;
  notes?: string;

  // Status
  status: MaintenanceStatus;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface EquipmentNotification {
  id: string;
  userId: string;

  // Notification Content
  equipmentId?: string;
  reservationId?: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;

  // Status
  read: boolean;
  readAt?: Date;

  // Action Requirements
  actionRequired: boolean;
  actionUrl?: string;

  // Timestamps
  createdAt: Date;
}

export interface EquipmentReport {
  id: string;

  // Report Details
  type: ReportType;
  title: string;
  description?: string;

  // Filters and Data
  filters: EquipmentSearchFilters;
  generatedBy: string;
  generatedAt: Date;

  // Report Data
  data: any; // Report-specific data structure
  format: ReportFormat;

  // Download Information
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
  peakUsageTimes: any[]; // Would need more complex analysis
  mostUsedBy: any[]; // Would need user analysis
  maintenanceFrequency: number; // Would need maintenance data
  averageLifespan: number; // Would need lifecycle data
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

// Enums
export enum EquipmentCategory {
  RACKETS = 'RACKETS',
  SHUTTLECOCKS = 'SHUTTLECOCKS',
  NETS = 'NETS',
  POSTS = 'POSTS',
  LIGHTING = 'LIGHTING',
  SCOREBOARDS = 'SCOREBOARDS',
  CHAIRS = 'CHAIRS',
  TABLES = 'TABLES',
  FIRST_AID = 'FIRST_AID',
  CLEANING = 'CLEANING',
  MISCELLANEOUS = 'MISCELLANEOUS',
}

export enum EquipmentType {
  BADMINTON_RACKET = 'BADMINTON_RACKET',
  TENNIS_RACKET = 'TENNIS_RACKET',
  SHUTTLECOCK = 'SHUTTLECOCK',
  NET = 'NET',
  POST_SET = 'POST_SET',
  LIGHT_FIXTURE = 'LIGHT_FIXTURE',
  SCOREBOARD = 'SCOREBOARD',
  CHAIR = 'CHAIR',
  TABLE = 'TABLE',
  FIRST_AID_KIT = 'FIRST_AID_KIT',
  CLEANING_SUPPLIES = 'CLEANING_SUPPLIES',
  OTHER = 'OTHER',
}

export enum EquipmentCondition {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
  DAMAGED = 'DAMAGED',
  UNUSABLE = 'UNUSABLE',
}

export enum EquipmentStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  CHECKED_OUT = 'CHECKED_OUT',
  MAINTENANCE = 'MAINTENANCE',
  LOST = 'LOST',
  RETIRED = 'RETIRED',
}

export enum ReservationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  ACTIVE = 'ACTIVE',
  RETURNED = 'RETURNED',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
  LOST = 'LOST',
}

export enum MaintenanceType {
  ROUTINE_INSPECTION = 'ROUTINE_INSPECTION',
  REPAIR = 'REPAIR',
  REPLACEMENT = 'REPLACEMENT',
  CLEANING = 'CLEANING',
  CALIBRATION = 'CALIBRATION',
  UPGRADE = 'UPGRADE',
  DISPOSAL = 'DISPOSAL',
}

export enum MaintenancePriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
  EMERGENCY = 'EMERGENCY',
}

export enum MaintenanceStatus {
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  OVERDUE = 'OVERDUE',
}

export enum NotificationType {
  RESERVATION_APPROVED = 'RESERVATION_APPROVED',
  RESERVATION_REJECTED = 'RESERVATION_REJECTED',
  RESERVATION_OVERDUE = 'RESERVATION_OVERDUE',
  EQUIPMENT_RETURN_REMINDER = 'EQUIPMENT_RETURN_REMINDER',
  MAINTENANCE_DUE = 'MAINTENANCE_DUE',
  EQUIPMENT_DAMAGED = 'EQUIPMENT_DAMAGED',
  EQUIPMENT_LOST = 'EQUIPMENT_LOST',
  LOW_INVENTORY = 'LOW_INVENTORY',
  MAINTENANCE_COMPLETED = 'MAINTENANCE_COMPLETED',
}

export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum ReportType {
  INVENTORY_STATUS = 'INVENTORY_STATUS',
  USAGE_ANALYTICS = 'USAGE_ANALYTICS',
  MAINTENANCE_SCHEDULE = 'MAINTENANCE_SCHEDULE',
  RESERVATION_HISTORY = 'RESERVATION_HISTORY',
  COST_ANALYSIS = 'COST_ANALYSIS',
  UTILIZATION_REPORT = 'UTILIZATION_REPORT',
}

export enum ReportFormat {
  JSON = 'JSON',
  CSV = 'CSV',
  PDF = 'PDF',
}