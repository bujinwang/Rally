// Court Booking and Reservation Types
import { MaintenancePriority, MaintenanceStatus, NotificationPriority, ReportFormat } from './equipment';

export interface Court {
  id: string;
  name: string;
  venueId: string;
  venue?: Venue;

  // Court Specifications
  courtType: CourtType;
  surfaceType: SurfaceType;
  lighting: boolean;
  netHeight: NetHeight;

  // Physical Dimensions
  length?: number; // in meters
  width?: number; // in meters
  height?: number; // ceiling height in meters

  // Status and Condition
  status: CourtStatus;
  condition: CourtCondition;
  lastMaintenanceDate?: Date;
  nextMaintenanceDate?: Date;

  // Operational Details
  maxPlayers: number;
  requiresReservation: boolean;
  peakHours: string[]; // Array of peak hour time slots
  offHours: string[]; // Array of maintenance/off hours

  // Pricing
  basePrice: number;
  peakPrice?: number;
  offPeakPrice?: number;
  currency: string;

  // Media and Notes
  images: string[]; // Array of court photos
  description?: string;
  notes?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;

  // Relations
  bookings?: CourtBooking[];
  maintenance?: CourtMaintenance[];
  availability?: CourtAvailability[];
  pricing?: CourtPricing[];
}

export interface CourtBooking {
  id: string;
  courtId: string;
  court?: Court;

  // Booking Details
  userId: string;
  sessionId?: string; // Link to badminton session if applicable
  playerCount: number;

  // Timing
  startTime: Date;
  endTime: Date;
  duration: number; // Duration in minutes

  // Booking Status
  status: BookingStatus;
  bookingType: BookingType;

  // Payment
  totalPrice: number;
  currency: string;
  paymentStatus: PaymentStatus;
  paymentId?: string; // External payment provider ID

  // Additional Details
  purpose?: string;
  specialRequests?: string;
  participants: string[]; // Array of participant user IDs

  // Cancellation
  cancelledAt?: Date;
  cancellationReason?: string;
  refundAmount?: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Relations
  notifications?: CourtNotification[];
}

export interface CourtMaintenance {
  id: string;
  courtId: string;
  court?: Court;

  // Maintenance Details
  maintenanceType: CourtMaintenanceType;
  description: string;
  priority: MaintenancePriority;

  // Scheduling
  scheduledStart: Date;
  scheduledEnd?: Date;
  actualStart?: Date;
  actualEnd?: Date;

  // Cost and Resources
  estimatedCost?: number;
  actualCost?: number;
  currency: string;
  materialsUsed: string[]; // Array of materials/parts used

  // Assignment and Notes
  assignedTo?: string;
  performedBy?: string;
  notes?: string;

  // Status
  status: MaintenanceStatus;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Relations
  notifications?: CourtNotification[];
}

export interface CourtAvailability {
  id: string;
  courtId: string;
  court?: Court;

  // Recurring Schedule
  dayOfWeek: number; // 0-6 (Sunday = 0)
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format

  // Availability Rules
  isAvailable: boolean;
  maxAdvanceBooking: number; // Days in advance booking allowed
  minBookingDuration: number; // Minimum booking duration in minutes
  maxBookingDuration: number; // Maximum booking duration in minutes

  // Pricing Override (optional)
  priceOverride?: number;

  // Special Rules
  requiresApproval: boolean;
  notes?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface CourtPricing {
  id: string;
  courtId: string;
  court?: Court;

  // Pricing Rules
  ruleType: PricingRuleType;
  name: string; // Rule name (e.g., "Peak Hours", "Member Discount")

  // Time-based Rules
  dayOfWeek?: number; // 0-6 (Sunday = 0), null for all days
  startTime?: string; // HH:MM format, null for all day
  endTime?: string; // HH:MM format, null for all day

  // User-based Rules
  userType?: string; // member, guest, student, etc.
  membershipLevel?: string;

  // Pricing
  price: number;
  currency: string;
  discountPercent?: number; // Percentage discount (0-100)

  // Conditions
  minDuration?: number; // Minimum duration in minutes
  maxDuration?: number; // Maximum duration in minutes
  isActive: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface CourtNotification {
  id: string;
  userId: string;

  // Notification Content
  courtId?: string;
  bookingId?: string;
  maintenanceId?: string;
  type: CourtNotificationType;
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

  // Relations
  booking?: CourtBooking;
}

export interface CourtReport {
  id: string;

  // Report Details
  type: CourtReportType;
  title: string;
  description?: string;

  // Filters and Data
  filters: CourtSearchFilters;
  generatedBy: string;
  generatedAt: Date;

  // Report Data
  data: any; // Report-specific data structure
  format: ReportFormat;

  // Download Information
  downloadUrl?: string;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  state?: string;
  zipCode?: string;
  country: string;

  // Contact Information
  phone?: string;
  email?: string;
  website?: string;

  // Location
  latitude?: number;
  longitude?: number;

  // Venue Details
  venueType: VenueType;
  description?: string;
  amenities: string[]; // Array of amenities (parking, showers, etc.)

  // Operating Hours
  timezone: string;
  openingTime: string; // HH:MM format
  closingTime: string; // HH:MM format

  // Management
  managerId?: string;
  isActive: boolean;

  // Media
  images: string[]; // Array of venue photos

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Relations
  courts?: Court[];
}

// Search and Filter Types
export interface CourtSearchFilters {
  venueId?: string;
  courtType?: CourtType[];
  surfaceType?: SurfaceType[];
  status?: CourtStatus[];
  condition?: CourtCondition[];
  lighting?: boolean;
  requiresReservation?: boolean;
  priceRange?: {
    min: number;
    max: number;
  };
  availability?: {
    date: Date;
    startTime?: string;
    endTime?: string;
    duration?: number;
  };
  location?: {
    latitude: number;
    longitude: number;
    radius: number; // in kilometers
  };
}

export interface CourtBookingRequest {
  courtId: string;
  startTime: Date;
  endTime: Date;
  playerCount?: number;
  purpose?: string;
  specialRequests?: string;
  participants?: string[];
  bookingType?: BookingType;
}

export interface CourtBookingUpdateRequest {
  status?: BookingStatus;
  specialRequests?: string;
  participants?: string[];
}

export interface CourtAvailabilityRequest {
  courtId: string;
  date: Date;
  startTime?: string;
  endTime?: string;
  duration?: number;
}

export interface CourtPricingRequest {
  courtId: string;
  startTime: Date;
  endTime: Date;
  userType?: string;
  membershipLevel?: string;
  duration: number;
}

export interface CourtMaintenanceRequest {
  courtId: string;
  maintenanceType: CourtMaintenanceType;
  description: string;
  priority?: MaintenancePriority;
  scheduledStart: Date;
  scheduledEnd?: Date;
  estimatedCost?: number;
  assignedTo?: string;
  notes?: string;
}

// Analytics and Reporting Types
export interface CourtUsageStats {
  courtId: string;
  totalBookings: number;
  totalRevenue: number;
  averageBookingDuration: number;
  utilizationRate: number; // Percentage of available time booked
  peakUsageHours: string[];
  mostPopularDays: number[]; // 0-6 (Sunday = 0)
  averagePricePerHour: number;
  cancellationRate: number;
  noShowRate: number;
  period: {
    start: Date;
    end: Date;
  };
}

export interface CourtRevenueReport {
  venueId?: string;
  totalRevenue: number;
  totalBookings: number;
  averageBookingValue: number;
  revenueByCourtType: Record<CourtType, number>;
  revenueByBookingType: Record<BookingType, number>;
  revenueByDayOfWeek: Record<number, number>;
  revenueByHour: Record<string, number>;
  period: {
    start: Date;
    end: Date;
  };
}

export interface CourtPerformanceMetrics {
  courtId: string;
  uptime: number; // Percentage of time court is operational
  averageMaintenanceTime: number; // Average time between maintenance
  conditionTrend: CourtCondition[];
  bookingSuccessRate: number; // Percentage of booking attempts that succeed
  customerSatisfaction: number; // Average rating (if available)
  maintenanceCostPerMonth: number;
  period: {
    start: Date;
    end: Date;
  };
}

// Enums
export enum CourtType {
  INDOOR = 'INDOOR',
  OUTDOOR = 'OUTDOOR',
  MIXED = 'MIXED',
}

export enum SurfaceType {
  WOOD = 'WOOD',
  SYNTHETIC = 'SYNTHETIC',
  CARPET = 'CARPET',
  CONCRETE = 'CONCRETE',
  GRASS = 'GRASS',
  OTHER = 'OTHER',
}

export enum NetHeight {
  STANDARD = 'STANDARD',
  ADJUSTABLE = 'ADJUSTABLE',
  LOW = 'LOW',
  HIGH = 'HIGH',
}

export enum CourtStatus {
  AVAILABLE = 'AVAILABLE',
  BOOKED = 'BOOKED',
  MAINTENANCE = 'MAINTENANCE',
  CLOSED = 'CLOSED',
  OUT_OF_ORDER = 'OUT_OF_ORDER',
}

export enum CourtCondition {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
  DAMAGED = 'DAMAGED',
  UNUSABLE = 'UNUSABLE',
}

export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export enum BookingType {
  CASUAL = 'CASUAL',
  TOURNAMENT = 'TOURNAMENT',
  LESSON = 'LESSON',
  PRACTICE = 'PRACTICE',
  EVENT = 'EVENT',
  MAINTENANCE = 'MAINTENANCE',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  FAILED = 'FAILED',
}

export enum CourtMaintenanceType {
  ROUTINE_INSPECTION = 'ROUTINE_INSPECTION',
  NET_REPLACEMENT = 'NET_REPLACEMENT',
  SURFACE_CLEANING = 'SURFACE_CLEANING',
  LIGHTING_REPAIR = 'LIGHTING_REPAIR',
  FLOOR_REFINISHING = 'FLOOR_REFINISHING',
  NET_HEIGHT_ADJUSTMENT = 'NET_HEIGHT_ADJUSTMENT',
  MARKING_REPAINT = 'MARKING_REPAINT',
  STRUCTURAL_REPAIR = 'STRUCTURAL_REPAIR',
  DEEP_CLEANING = 'DEEP_CLEANING',
  EQUIPMENT_CHECK = 'EQUIPMENT_CHECK',
}

export enum PricingRuleType {
  BASE_RATE = 'BASE_RATE',
  PEAK_HOURS = 'PEAK_HOURS',
  OFF_PEAK = 'OFF_PEAK',
  MEMBER_DISCOUNT = 'MEMBER_DISCOUNT',
  STUDENT_DISCOUNT = 'STUDENT_DISCOUNT',
  SENIOR_DISCOUNT = 'SENIOR_DISCOUNT',
  GROUP_DISCOUNT = 'GROUP_DISCOUNT',
  PROMOTIONAL = 'PROMOTIONAL',
  HOLIDAY_RATE = 'HOLIDAY_RATE',
}

export enum CourtNotificationType {
  BOOKING_CONFIRMED = 'BOOKING_CONFIRMED',
  BOOKING_CANCELLED = 'BOOKING_CANCELLED',
  BOOKING_REMINDER = 'BOOKING_REMINDER',
  PAYMENT_DUE = 'PAYMENT_DUE',
  COURT_MAINTENANCE = 'COURT_MAINTENANCE',
  AVAILABILITY_CHANGE = 'AVAILABILITY_CHANGE',
  PRICE_CHANGE = 'PRICE_CHANGE',
  COURT_CLOSED = 'COURT_CLOSED',
  BOOKING_OVERDUE = 'BOOKING_OVERDUE',
}

export enum CourtReportType {
  BOOKING_SUMMARY = 'BOOKING_SUMMARY',
  REVENUE_ANALYSIS = 'REVENUE_ANALYSIS',
  UTILIZATION_REPORT = 'UTILIZATION_REPORT',
  MAINTENANCE_SCHEDULE = 'MAINTENANCE_SCHEDULE',
  CUSTOMER_ANALYTICS = 'CUSTOMER_ANALYTICS',
  COURT_PERFORMANCE = 'COURT_PERFORMANCE',
}

export enum VenueType {
  SPORTS_CENTER = 'SPORTS_CENTER',
  SCHOOL = 'SCHOOL',
  UNIVERSITY = 'UNIVERSITY',
  COMMUNITY_CENTER = 'COMMUNITY_CENTER',
  PRIVATE_CLUB = 'PRIVATE_CLUB',
  HOTEL = 'HOTEL',
  STADIUM = 'STADIUM',
  OTHER = 'OTHER',
}

// Re-export common enums from equipment types
export { MaintenancePriority, MaintenanceStatus, NotificationPriority, ReportFormat } from './equipment';