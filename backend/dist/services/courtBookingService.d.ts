import { Court, CourtBooking, CourtMaintenance, CourtNotification, Venue, CourtSearchFilters, CourtBookingRequest, CourtMaintenanceRequest, CourtUsageStats, CourtRevenueReport, BookingStatus } from '../types/courts';
export declare class CourtBookingService {
    /**
     * Create a new venue
     */
    static createVenue(data: Omit<Venue, 'id' | 'createdAt' | 'updatedAt'>): Promise<Venue>;
    /**
     * Create a new court
     */
    static createCourt(data: Omit<Court, 'id' | 'createdAt' | 'updatedAt'>): Promise<Court>;
    /**
     * Get court by ID with full details
     */
    static getCourtById(id: string): Promise<Court | null>;
    /**
     * Search and filter courts
     */
    static searchCourts(filters: CourtSearchFilters): Promise<Court[]>;
    /**
     * Check court availability for a specific time slot
     */
    static checkCourtAvailability(courtId: string, startTime: Date, endTime: Date): Promise<boolean>;
    /**
     * Calculate pricing for a court booking
     */
    static calculateBookingPrice(courtId: string, startTime: Date, endTime: Date, userType?: string, membershipLevel?: string): Promise<number>;
    /**
     * Create a court booking
     */
    static createBooking(request: CourtBookingRequest, userId: string): Promise<CourtBooking>;
    /**
     * Update booking status
     */
    static updateBookingStatus(bookingId: string, status: BookingStatus, userId: string): Promise<CourtBooking>;
    /**
     * Confirm payment and update booking status
     */
    static confirmBookingPayment(bookingId: string, paymentIntentId: string): Promise<CourtBooking>;
    /**
     * Process refund for cancelled booking
     */
    static processBookingRefund(bookingId: string, reason?: string): Promise<CourtBooking>;
    /**
     * Get user's bookings
     */
    static getUserBookings(userId: string, status?: BookingStatus[], upcomingOnly?: boolean): Promise<CourtBooking[]>;
    /**
     * Get court bookings for a specific time period
     */
    static getCourtBookings(courtId: string, startDate: Date, endDate: Date): Promise<CourtBooking[]>;
    /**
     * Create maintenance schedule
     */
    static createMaintenance(request: CourtMaintenanceRequest): Promise<CourtMaintenance>;
    /**
     * Create notification
     */
    static createNotification(notification: Omit<CourtNotification, 'id' | 'createdAt'>): Promise<CourtNotification>;
    /**
     * Get court usage statistics
     */
    static getCourtUsageStats(courtId: string, startDate: Date, endDate: Date): Promise<CourtUsageStats>;
    /**
     * Get venue revenue report
     */
    static getVenueRevenueReport(venueId: string, startDate: Date, endDate: Date): Promise<CourtRevenueReport>;
}
//# sourceMappingURL=courtBookingService.d.ts.map