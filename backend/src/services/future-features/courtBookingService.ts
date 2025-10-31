import {
  Court,
  CourtBooking,
  CourtMaintenance,
  CourtAvailability,
  CourtPricing,
  CourtNotification,
  Venue,
  CourtSearchFilters,
  CourtBookingRequest,
  CourtBookingUpdateRequest,
  CourtAvailabilityRequest,
  CourtPricingRequest,
  CourtMaintenanceRequest,
  CourtUsageStats,
  CourtRevenueReport,
  CourtPerformanceMetrics,
  CourtType,
  CourtStatus,
  BookingStatus,
  BookingType,
  PaymentStatus,
  CourtMaintenanceType,
  PricingRuleType,
  CourtNotificationType,
  CourtReportType,
} from '../types/courts';
import { PaymentService } from './paymentService';
import { PaymentConfig } from '../types/payment';

// Temporary in-memory storage until Prisma client is generated
const courtStore: Court[] = [];
const bookingStore: CourtBooking[] = [];
const maintenanceStore: CourtMaintenance[] = [];
const availabilityStore: CourtAvailability[] = [];
const pricingStore: CourtPricing[] = [];
const notificationStore: CourtNotification[] = [];
const venueStore: Venue[] = [];

// Helper function to generate IDs
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Initialize payment service
const paymentConfig: PaymentConfig = {
  stripe: {
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    apiVersion: '2023-10-16',
  },
  defaultCurrency: 'usd',
  supportedCurrencies: ['usd', 'cad', 'eur', 'gbp'],
  maxRefundDays: 90,
  enableWebhooks: true,
};

const paymentService = new PaymentService(paymentConfig);

export class CourtBookingService {
  /**
   * Create a new venue
   */
  static async createVenue(data: Omit<Venue, 'id' | 'createdAt' | 'updatedAt'>): Promise<Venue> {
    const venue: Venue = {
      id: generateId('venue'),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    venueStore.push(venue);
    return venue;
  }

  /**
   * Create a new court
   */
  static async createCourt(data: Omit<Court, 'id' | 'createdAt' | 'updatedAt'>): Promise<Court> {
    const court: Court = {
      id: generateId('court'),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    courtStore.push(court);
    return court;
  }

  /**
   * Get court by ID with full details
   */
  static async getCourtById(id: string): Promise<Court | null> {
    const court = courtStore.find(c => c.id === id);
    if (!court) return null;

    // Add related data
    const venue = venueStore.find(v => v.id === court.venueId);
    const bookings = bookingStore.filter(b => b.courtId === id);
    const maintenance = maintenanceStore.filter(m => m.courtId === id);
    const availability = availabilityStore.filter(a => a.courtId === id);
    const pricing = pricingStore.filter(p => p.courtId === id);

    return {
      ...court,
      venue,
      bookings,
      maintenance,
      availability,
      pricing,
    };
  }

  /**
   * Search and filter courts
   */
  static async searchCourts(filters: CourtSearchFilters): Promise<Court[]> {
    let courts = [...courtStore];

    // Apply filters
    if (filters.venueId) {
      courts = courts.filter(c => c.venueId === filters.venueId);
    }

    if (filters.courtType?.length) {
      courts = courts.filter(c => filters.courtType!.includes(c.courtType));
    }

    if (filters.surfaceType?.length) {
      courts = courts.filter(c => filters.surfaceType!.includes(c.surfaceType));
    }

    if (filters.status?.length) {
      courts = courts.filter(c => filters.status!.includes(c.status));
    }

    if (filters.condition?.length) {
      courts = courts.filter(c => filters.condition!.includes(c.condition));
    }

    if (filters.lighting !== undefined) {
      courts = courts.filter(c => c.lighting === filters.lighting);
    }

    if (filters.requiresReservation !== undefined) {
      courts = courts.filter(c => c.requiresReservation === filters.requiresReservation);
    }

    if (filters.priceRange) {
      courts = courts.filter(c =>
        c.basePrice >= filters.priceRange!.min &&
        c.basePrice <= filters.priceRange!.max
      );
    }

    // Add venue information
    return courts.map(court => ({
      ...court,
      venue: venueStore.find(v => v.id === court.venueId),
    }));
  }

  /**
   * Check court availability for a specific time slot
   */
  static async checkCourtAvailability(
    courtId: string,
    startTime: Date,
    endTime: Date
  ): Promise<boolean> {
    // Check for conflicting bookings
    const conflicts = bookingStore.filter(booking =>
      booking.courtId === courtId &&
      booking.status !== BookingStatus.CANCELLED &&
      booking.status !== BookingStatus.NO_SHOW &&
      (
        (booking.startTime <= startTime && booking.endTime > startTime) ||
        (booking.startTime < endTime && booking.endTime >= endTime) ||
        (booking.startTime >= startTime && booking.endTime <= endTime)
      )
    );

    // Check for maintenance
    const maintenanceConflicts = maintenanceStore.filter(maint =>
      maint.courtId === courtId &&
      maint.status !== 'COMPLETED' &&
      maint.status !== 'CANCELLED' &&
      (
        (maint.scheduledStart <= startTime && maint.scheduledEnd && maint.scheduledEnd > startTime) ||
        (maint.scheduledStart < endTime && maint.scheduledEnd && maint.scheduledEnd >= endTime)
      )
    );

    return conflicts.length === 0 && maintenanceConflicts.length === 0;
  }

  /**
   * Calculate pricing for a court booking
   */
  static async calculateBookingPrice(
    courtId: string,
    startTime: Date,
    endTime: Date,
    userType?: string,
    membershipLevel?: string
  ): Promise<number> {
    const court = courtStore.find(c => c.id === courtId);
    if (!court) throw new Error('Court not found');

    const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60); // hours
    const dayOfWeek = startTime.getDay();
    const hour = startTime.getHours();

    // Find applicable pricing rules
    const applicableRules = pricingStore.filter(rule =>
      rule.courtId === courtId &&
      rule.isActive &&
      (rule.dayOfWeek === undefined || rule.dayOfWeek === dayOfWeek) &&
      (rule.userType === undefined || rule.userType === userType) &&
      (rule.membershipLevel === undefined || rule.membershipLevel === membershipLevel)
    );

    let basePrice = court.basePrice;
    let discountPercent = 0;

    // Apply pricing rules
    for (const rule of applicableRules) {
      if (rule.ruleType === PricingRuleType.BASE_RATE) {
        basePrice = rule.price;
      } else if (rule.discountPercent) {
        discountPercent = Math.max(discountPercent, rule.discountPercent);
      }
    }

    // Check for peak/off-peak pricing
    if (court.peakHours.includes(`${hour}:00`)) {
      if (court.peakPrice) {
        basePrice = court.peakPrice;
      }
    } else if (court.offPeakPrice) {
      basePrice = court.offPeakPrice;
    }

    // Apply discount
    const finalPrice = basePrice * duration * (1 - discountPercent / 100);

    return Math.round(finalPrice * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Create a court booking
   */
  static async createBooking(
    request: CourtBookingRequest,
    userId: string
  ): Promise<CourtBooking> {
    // Validate court exists
    const court = courtStore.find(c => c.id === request.courtId);
    if (!court) throw new Error('Court not found');

    // Check availability
    const isAvailable = await this.checkCourtAvailability(
      request.courtId,
      request.startTime,
      request.endTime
    );
    if (!isAvailable) throw new Error('Court is not available for the requested time');

    // Calculate price
    const totalPrice = await this.calculateBookingPrice(
      request.courtId,
      request.startTime,
      request.endTime
    );

    const duration = (request.endTime.getTime() - request.startTime.getTime()) / (1000 * 60);

    // Create payment intent first
    const paymentResult = await paymentService.createPaymentIntent({
      amount: totalPrice,
      currency: court.currency,
      description: `Court booking: ${court.name} - ${request.startTime.toISOString().split('T')[0]}`,
      metadata: {
        bookingType: 'court',
        courtId: request.courtId,
        userId: userId,
        startTime: request.startTime.toISOString(),
        endTime: request.endTime.toISOString(),
      },
    }, userId);

    if (!paymentResult.success) {
      throw new Error(`Payment initialization failed: ${paymentResult.error}`);
    }

    const booking: CourtBooking = {
      id: generateId('booking'),
      courtId: request.courtId,
      userId,
      sessionId: undefined,
      playerCount: request.playerCount || 2,
      startTime: request.startTime,
      endTime: request.endTime,
      duration,
      status: BookingStatus.PENDING,
      bookingType: request.bookingType || BookingType.CASUAL,
      totalPrice,
      currency: court.currency,
      paymentStatus: PaymentStatus.PENDING,
      paymentId: paymentResult.paymentIntent?.id,
      purpose: request.purpose,
      specialRequests: request.specialRequests,
      participants: request.participants || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    bookingStore.push(booking);

    // Create notification
    await this.createNotification({
      userId,
      courtId: request.courtId,
      bookingId: booking.id,
      type: CourtNotificationType.BOOKING_CONFIRMED,
      title: 'Booking Created - Payment Required',
      message: `Your court booking for ${court.name} has been created. Please complete payment to confirm.`,
      priority: 'HIGH' as any,
      read: false,
      actionRequired: true,
    });

    return booking;
  }

  /**
   * Update booking status
   */
  static async updateBookingStatus(
    bookingId: string,
    status: BookingStatus,
    userId: string
  ): Promise<CourtBooking> {
    const booking = bookingStore.find(b => b.id === bookingId);
    if (!booking) throw new Error('Booking not found');

    // Update booking
    booking.status = status;
    booking.updatedAt = new Date();

    if (status === BookingStatus.CANCELLED) {
      booking.cancelledAt = new Date();
    }

    // Create notification
    const notificationType = status === BookingStatus.CANCELLED
      ? CourtNotificationType.BOOKING_CANCELLED
      : CourtNotificationType.BOOKING_CONFIRMED;

    await this.createNotification({
      userId: booking.userId,
      courtId: booking.courtId,
      bookingId: booking.id,
      type: notificationType,
      title: status === BookingStatus.CANCELLED ? 'Booking Cancelled' : 'Booking Updated',
      message: `Your court booking has been ${status.toLowerCase()}.`,
      priority: 'MEDIUM' as any,
      read: false,
      actionRequired: false,
    });

    return booking;
  }

  /**
   * Confirm payment and update booking status
   */
  static async confirmBookingPayment(
    bookingId: string,
    paymentIntentId: string
  ): Promise<CourtBooking> {
    const booking = bookingStore.find(b => b.id === bookingId);
    if (!booking) throw new Error('Booking not found');

    if (booking.paymentId !== paymentIntentId) {
      throw new Error('Payment intent ID does not match booking');
    }

    // Get payment intent status from payment service
    const paymentIntent = await paymentService.getPaymentIntent(paymentIntentId);
    if (!paymentIntent) {
      throw new Error('Payment intent not found');
    }

    // Update booking based on payment status
    if (paymentIntent.status === 'succeeded') {
      booking.status = BookingStatus.CONFIRMED;
      booking.paymentStatus = PaymentStatus.PAID;
    } else if (paymentIntent.status === 'canceled') {
      booking.status = BookingStatus.CANCELLED;
      booking.paymentStatus = PaymentStatus.FAILED;
    } else {
      // Payment still processing
      booking.paymentStatus = PaymentStatus.PENDING;
    }

    booking.updatedAt = new Date();

    // Create notification
    const court = courtStore.find(c => c.id === booking.courtId);
    const courtName = court?.name || 'Court';

    let notificationTitle: string;
    let notificationMessage: string;
    let priority: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';

    if (booking.status === BookingStatus.CONFIRMED) {
      notificationTitle = 'Booking Confirmed - Payment Successful';
      notificationMessage = `Your payment for ${courtName} has been processed successfully. Your booking is now confirmed.`;
      priority = 'HIGH';
    } else if (booking.status === BookingStatus.CANCELLED) {
      notificationTitle = 'Booking Cancelled - Payment Failed';
      notificationMessage = `Your payment for ${courtName} could not be processed. Your booking has been cancelled.`;
      priority = 'HIGH';
    } else {
      notificationTitle = 'Payment Processing';
      notificationMessage = `Your payment for ${courtName} is being processed. We'll notify you once it's complete.`;
    }

    await this.createNotification({
      userId: booking.userId,
      courtId: booking.courtId,
      bookingId: booking.id,
      type: CourtNotificationType.PAYMENT_DUE,
      title: notificationTitle,
      message: notificationMessage,
      priority: priority as any,
      read: false,
      actionRequired: booking.status === BookingStatus.PENDING,
    });

    return booking;
  }

  /**
   * Process refund for cancelled booking
   */
  static async processBookingRefund(
    bookingId: string,
    reason?: string
  ): Promise<CourtBooking> {
    const booking = bookingStore.find(b => b.id === bookingId);
    if (!booking) throw new Error('Booking not found');

    if (!booking.paymentId) {
      throw new Error('No payment associated with this booking');
    }

    if (booking.paymentStatus !== PaymentStatus.PAID) {
      throw new Error('Cannot refund unpaid booking');
    }

    // Process refund through payment service
    const refundResult = await paymentService.createRefund({
      paymentIntentId: booking.paymentId,
      amount: booking.totalPrice,
      reason: reason as any,
      metadata: {
        bookingId: booking.id,
        courtId: booking.courtId,
        userId: booking.userId,
      },
    });

    if (!refundResult.success) {
      throw new Error(`Refund failed: ${refundResult.error}`);
    }

    // Update booking status
    booking.status = BookingStatus.CANCELLED;
    booking.paymentStatus = PaymentStatus.REFUNDED;
    booking.refundAmount = booking.totalPrice;
    booking.updatedAt = new Date();

    // Create notification
    const court = courtStore.find(c => c.id === booking.courtId);
    const courtName = court?.name || 'Court';

    await this.createNotification({
      userId: booking.userId,
      courtId: booking.courtId,
      bookingId: booking.id,
      type: CourtNotificationType.BOOKING_CANCELLED,
      title: 'Booking Refunded',
      message: `Your booking for ${courtName} has been cancelled and refunded. Refund amount: ${booking.currency.toUpperCase()} ${booking.totalPrice}`,
      priority: 'HIGH' as any,
      read: false,
      actionRequired: false,
    });

    return booking;
  }

  /**
   * Get user's bookings
   */
  static async getUserBookings(
    userId: string,
    status?: BookingStatus[],
    upcomingOnly = false
  ): Promise<CourtBooking[]> {
    let bookings = bookingStore.filter(b => b.userId === userId);

    if (status?.length) {
      bookings = bookings.filter(b => status.includes(b.status));
    }

    if (upcomingOnly) {
      const now = new Date();
      bookings = bookings.filter(b => b.startTime > now);
    }

    // Add court information
    return bookings.map(booking => ({
      ...booking,
      court: courtStore.find(c => c.id === booking.courtId),
    }));
  }

  /**
   * Get court bookings for a specific time period
   */
  static async getCourtBookings(
    courtId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CourtBooking[]> {
    return bookingStore.filter(booking =>
      booking.courtId === courtId &&
      booking.startTime >= startDate &&
      booking.endTime <= endDate
    );
  }

  /**
   * Create maintenance schedule
   */
  static async createMaintenance(request: CourtMaintenanceRequest): Promise<CourtMaintenance> {
    const maintenance: CourtMaintenance = {
      id: generateId('maintenance'),
      courtId: request.courtId,
      maintenanceType: request.maintenanceType,
      description: request.description,
      priority: request.priority || 'MEDIUM' as any,
      scheduledStart: request.scheduledStart,
      scheduledEnd: request.scheduledEnd,
      estimatedCost: request.estimatedCost,
      currency: 'USD',
      materialsUsed: [],
      assignedTo: request.assignedTo,
      notes: request.notes,
      status: 'SCHEDULED' as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    maintenanceStore.push(maintenance);

    // Update court status
    const court = courtStore.find(c => c.id === request.courtId);
    if (court) {
      court.status = CourtStatus.MAINTENANCE;
      court.nextMaintenanceDate = request.scheduledStart;
    }

    return maintenance;
  }

  /**
   * Create notification
   */
  static async createNotification(
    notification: Omit<CourtNotification, 'id' | 'createdAt'>
  ): Promise<CourtNotification> {
    const newNotification: CourtNotification = {
      id: generateId('notification'),
      ...notification,
      createdAt: new Date(),
    };

    notificationStore.push(newNotification);
    return newNotification;
  }

  /**
   * Get court usage statistics
   */
  static async getCourtUsageStats(
    courtId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CourtUsageStats> {
    const bookings = bookingStore.filter(booking =>
      booking.courtId === courtId &&
      booking.createdAt >= startDate &&
      booking.createdAt <= endDate &&
      booking.status === BookingStatus.COMPLETED
    );

    const totalBookings = bookings.length;
    const totalRevenue = bookings.reduce((sum, booking) => sum + booking.totalPrice, 0);
    const totalDuration = bookings.reduce((sum, booking) => sum + booking.duration, 0);
    const averageBookingDuration = totalBookings > 0 ? totalDuration / totalBookings : 0;
    const averagePricePerHour = totalDuration > 0 ? totalRevenue / (totalDuration / 60) : 0;

    // Calculate utilization rate (simplified)
    const totalHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
    const bookedHours = totalDuration / 60;
    const utilizationRate = totalHours > 0 ? (bookedHours / totalHours) * 100 : 0;

    return {
      courtId,
      totalBookings,
      totalRevenue,
      averageBookingDuration,
      utilizationRate,
      peakUsageHours: [], // Would need more complex analysis
      mostPopularDays: [], // Would need more complex analysis
      averagePricePerHour,
      cancellationRate: 0, // Would need cancellation data
      noShowRate: 0, // Would need no-show data
      period: { start: startDate, end: endDate },
    };
  }

  /**
   * Get venue revenue report
   */
  static async getVenueRevenueReport(
    venueId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CourtRevenueReport> {
    const venueCourts = courtStore.filter(court => court.venueId === venueId);
    const courtIds = venueCourts.map(court => court.id);

    const bookings = bookingStore.filter(booking =>
      courtIds.includes(booking.courtId) &&
      booking.createdAt >= startDate &&
      booking.createdAt <= endDate &&
      booking.paymentStatus === PaymentStatus.PAID
    );

    const totalRevenue = bookings.reduce((sum, booking) => sum + booking.totalPrice, 0);
    const totalBookings = bookings.length;
    const averageBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

    return {
      venueId,
      totalRevenue,
      totalBookings,
      averageBookingValue,
      revenueByCourtType: {} as any, // Would need aggregation logic
      revenueByBookingType: {} as any, // Would need aggregation logic
      revenueByDayOfWeek: {} as any, // Would need aggregation logic
      revenueByHour: {} as any, // Would need aggregation logic
      period: { start: startDate, end: endDate },
    };
  }
}