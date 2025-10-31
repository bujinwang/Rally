import { MaintenancePriority, MaintenanceStatus, NotificationPriority, ReportFormat } from './equipment';
export interface Court {
    id: string;
    name: string;
    venueId: string;
    venue?: Venue;
    courtType: CourtType;
    surfaceType: SurfaceType;
    lighting: boolean;
    netHeight: NetHeight;
    length?: number;
    width?: number;
    height?: number;
    status: CourtStatus;
    condition: CourtCondition;
    lastMaintenanceDate?: Date;
    nextMaintenanceDate?: Date;
    maxPlayers: number;
    requiresReservation: boolean;
    peakHours: string[];
    offHours: string[];
    basePrice: number;
    peakPrice?: number;
    offPeakPrice?: number;
    currency: string;
    images: string[];
    description?: string;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    bookings?: CourtBooking[];
    maintenance?: CourtMaintenance[];
    availability?: CourtAvailability[];
    pricing?: CourtPricing[];
}
export interface CourtBooking {
    id: string;
    courtId: string;
    court?: Court;
    userId: string;
    sessionId?: string;
    playerCount: number;
    startTime: Date;
    endTime: Date;
    duration: number;
    status: BookingStatus;
    bookingType: BookingType;
    totalPrice: number;
    currency: string;
    paymentStatus: PaymentStatus;
    paymentId?: string;
    purpose?: string;
    specialRequests?: string;
    participants: string[];
    cancelledAt?: Date;
    cancellationReason?: string;
    refundAmount?: number;
    createdAt: Date;
    updatedAt: Date;
    notifications?: CourtNotification[];
}
export interface CourtMaintenance {
    id: string;
    courtId: string;
    court?: Court;
    maintenanceType: CourtMaintenanceType;
    description: string;
    priority: MaintenancePriority;
    scheduledStart: Date;
    scheduledEnd?: Date;
    actualStart?: Date;
    actualEnd?: Date;
    estimatedCost?: number;
    actualCost?: number;
    currency: string;
    materialsUsed: string[];
    assignedTo?: string;
    performedBy?: string;
    notes?: string;
    status: MaintenanceStatus;
    createdAt: Date;
    updatedAt: Date;
    notifications?: CourtNotification[];
}
export interface CourtAvailability {
    id: string;
    courtId: string;
    court?: Court;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
    maxAdvanceBooking: number;
    minBookingDuration: number;
    maxBookingDuration: number;
    priceOverride?: number;
    requiresApproval: boolean;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface CourtPricing {
    id: string;
    courtId: string;
    court?: Court;
    ruleType: PricingRuleType;
    name: string;
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
    userType?: string;
    membershipLevel?: string;
    price: number;
    currency: string;
    discountPercent?: number;
    minDuration?: number;
    maxDuration?: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface CourtNotification {
    id: string;
    userId: string;
    courtId?: string;
    bookingId?: string;
    maintenanceId?: string;
    type: CourtNotificationType;
    title: string;
    message: string;
    priority: NotificationPriority;
    read: boolean;
    readAt?: Date;
    actionRequired: boolean;
    actionUrl?: string;
    createdAt: Date;
    booking?: CourtBooking;
}
export interface CourtReport {
    id: string;
    type: CourtReportType;
    title: string;
    description?: string;
    filters: CourtSearchFilters;
    generatedBy: string;
    generatedAt: Date;
    data: any;
    format: ReportFormat;
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
    phone?: string;
    email?: string;
    website?: string;
    latitude?: number;
    longitude?: number;
    venueType: VenueType;
    description?: string;
    amenities: string[];
    timezone: string;
    openingTime: string;
    closingTime: string;
    managerId?: string;
    isActive: boolean;
    images: string[];
    createdAt: Date;
    updatedAt: Date;
    courts?: Court[];
}
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
        radius: number;
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
export interface CourtUsageStats {
    courtId: string;
    totalBookings: number;
    totalRevenue: number;
    averageBookingDuration: number;
    utilizationRate: number;
    peakUsageHours: string[];
    mostPopularDays: number[];
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
    uptime: number;
    averageMaintenanceTime: number;
    conditionTrend: CourtCondition[];
    bookingSuccessRate: number;
    customerSatisfaction: number;
    maintenanceCostPerMonth: number;
    period: {
        start: Date;
        end: Date;
    };
}
export declare enum CourtType {
    INDOOR = "INDOOR",
    OUTDOOR = "OUTDOOR",
    MIXED = "MIXED"
}
export declare enum SurfaceType {
    WOOD = "WOOD",
    SYNTHETIC = "SYNTHETIC",
    CARPET = "CARPET",
    CONCRETE = "CONCRETE",
    GRASS = "GRASS",
    OTHER = "OTHER"
}
export declare enum NetHeight {
    STANDARD = "STANDARD",
    ADJUSTABLE = "ADJUSTABLE",
    LOW = "LOW",
    HIGH = "HIGH"
}
export declare enum CourtStatus {
    AVAILABLE = "AVAILABLE",
    BOOKED = "BOOKED",
    MAINTENANCE = "MAINTENANCE",
    CLOSED = "CLOSED",
    OUT_OF_ORDER = "OUT_OF_ORDER"
}
export declare enum CourtCondition {
    EXCELLENT = "EXCELLENT",
    GOOD = "GOOD",
    FAIR = "FAIR",
    POOR = "POOR",
    DAMAGED = "DAMAGED",
    UNUSABLE = "UNUSABLE"
}
export declare enum BookingStatus {
    PENDING = "PENDING",
    CONFIRMED = "CONFIRMED",
    ACTIVE = "ACTIVE",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED",
    NO_SHOW = "NO_SHOW"
}
export declare enum BookingType {
    CASUAL = "CASUAL",
    TOURNAMENT = "TOURNAMENT",
    LESSON = "LESSON",
    PRACTICE = "PRACTICE",
    EVENT = "EVENT",
    MAINTENANCE = "MAINTENANCE"
}
export declare enum PaymentStatus {
    PENDING = "PENDING",
    PAID = "PAID",
    REFUNDED = "REFUNDED",
    PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",
    FAILED = "FAILED"
}
export declare enum CourtMaintenanceType {
    ROUTINE_INSPECTION = "ROUTINE_INSPECTION",
    NET_REPLACEMENT = "NET_REPLACEMENT",
    SURFACE_CLEANING = "SURFACE_CLEANING",
    LIGHTING_REPAIR = "LIGHTING_REPAIR",
    FLOOR_REFINISHING = "FLOOR_REFINISHING",
    NET_HEIGHT_ADJUSTMENT = "NET_HEIGHT_ADJUSTMENT",
    MARKING_REPAINT = "MARKING_REPAINT",
    STRUCTURAL_REPAIR = "STRUCTURAL_REPAIR",
    DEEP_CLEANING = "DEEP_CLEANING",
    EQUIPMENT_CHECK = "EQUIPMENT_CHECK"
}
export declare enum PricingRuleType {
    BASE_RATE = "BASE_RATE",
    PEAK_HOURS = "PEAK_HOURS",
    OFF_PEAK = "OFF_PEAK",
    MEMBER_DISCOUNT = "MEMBER_DISCOUNT",
    STUDENT_DISCOUNT = "STUDENT_DISCOUNT",
    SENIOR_DISCOUNT = "SENIOR_DISCOUNT",
    GROUP_DISCOUNT = "GROUP_DISCOUNT",
    PROMOTIONAL = "PROMOTIONAL",
    HOLIDAY_RATE = "HOLIDAY_RATE"
}
export declare enum CourtNotificationType {
    BOOKING_CONFIRMED = "BOOKING_CONFIRMED",
    BOOKING_CANCELLED = "BOOKING_CANCELLED",
    BOOKING_REMINDER = "BOOKING_REMINDER",
    PAYMENT_DUE = "PAYMENT_DUE",
    COURT_MAINTENANCE = "COURT_MAINTENANCE",
    AVAILABILITY_CHANGE = "AVAILABILITY_CHANGE",
    PRICE_CHANGE = "PRICE_CHANGE",
    COURT_CLOSED = "COURT_CLOSED",
    BOOKING_OVERDUE = "BOOKING_OVERDUE"
}
export declare enum CourtReportType {
    BOOKING_SUMMARY = "BOOKING_SUMMARY",
    REVENUE_ANALYSIS = "REVENUE_ANALYSIS",
    UTILIZATION_REPORT = "UTILIZATION_REPORT",
    MAINTENANCE_SCHEDULE = "MAINTENANCE_SCHEDULE",
    CUSTOMER_ANALYTICS = "CUSTOMER_ANALYTICS",
    COURT_PERFORMANCE = "COURT_PERFORMANCE"
}
export declare enum VenueType {
    SPORTS_CENTER = "SPORTS_CENTER",
    SCHOOL = "SCHOOL",
    UNIVERSITY = "UNIVERSITY",
    COMMUNITY_CENTER = "COMMUNITY_CENTER",
    PRIVATE_CLUB = "PRIVATE_CLUB",
    HOTEL = "HOTEL",
    STADIUM = "STADIUM",
    OTHER = "OTHER"
}
export { MaintenancePriority, MaintenanceStatus, NotificationPriority, ReportFormat } from './equipment';
//# sourceMappingURL=courts.d.ts.map