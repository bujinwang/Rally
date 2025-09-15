import { Router, Request, Response } from 'express';
import { CourtBookingService } from '../services/courtBookingService';
import {
  CourtSearchFilters,
  CourtBookingRequest,
  CourtBookingUpdateRequest,
  CourtAvailabilityRequest,
  CourtPricingRequest,
  CourtMaintenanceRequest,
  BookingStatus,
  BookingType,
} from '../types/courts';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/court-bookings/search - Search and filter courts
router.get('/search', async (req: Request, res: Response) => {
  try {
    const filters: CourtSearchFilters = {
      venueId: req.query.venueId as string,
      courtType: req.query.courtType ? [req.query.courtType as any] : undefined,
      surfaceType: req.query.surfaceType ? [req.query.surfaceType as any] : undefined,
      status: req.query.status ? [req.query.status as any] : undefined,
      condition: req.query.condition ? [req.query.condition as any] : undefined,
      lighting: req.query.lighting === 'true',
      requiresReservation: req.query.requiresReservation === 'true',
      priceRange: req.query.minPrice && req.query.maxPrice ? {
        min: parseFloat(req.query.minPrice as string),
        max: parseFloat(req.query.maxPrice as string),
      } : undefined,
    };

    const courts = await CourtBookingService.searchCourts(filters);
    res.json({ success: true, data: courts });
  } catch (error) {
    console.error('Error searching courts:', error);
    res.status(500).json({ success: false, error: 'Failed to search courts' });
  }
});

// GET /api/court-bookings/courts/:courtId - Get court details
router.get('/courts/:courtId', async (req: Request, res: Response) => {
  try {
    const court = await CourtBookingService.getCourtById(req.params.courtId);
    if (!court) {
      return res.status(404).json({ success: false, error: 'Court not found' });
    }
    res.json({ success: true, data: court });
  } catch (error) {
    console.error('Error fetching court:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch court' });
  }
});

// POST /api/court-bookings/check-availability - Check court availability
router.post('/check-availability', async (req: Request, res: Response) => {
  try {
    const { courtId, startTime, endTime } = req.body;

    if (!courtId || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: 'courtId, startTime, and endTime are required'
      });
    }

    const isAvailable = await CourtBookingService.checkCourtAvailability(
      courtId,
      new Date(startTime),
      new Date(endTime)
    );

    res.json({ success: true, data: { available: isAvailable } });
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({ success: false, error: 'Failed to check availability' });
  }
});

// POST /api/court-bookings/calculate-price - Calculate booking price
router.post('/calculate-price', async (req: Request, res: Response) => {
  try {
    const { courtId, startTime, endTime, userType, membershipLevel } = req.body;

    if (!courtId || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: 'courtId, startTime, and endTime are required'
      });
    }

    const price = await CourtBookingService.calculateBookingPrice(
      courtId,
      new Date(startTime),
      new Date(endTime),
      userType,
      membershipLevel
    );

    res.json({ success: true, data: { price } });
  } catch (error) {
    console.error('Error calculating price:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate price' });
  }
});

// POST /api/court-bookings - Create a court booking
router.post('/', async (req: Request, res: Response) => {
  try {
    const bookingRequest: CourtBookingRequest = {
      courtId: req.body.courtId,
      startTime: new Date(req.body.startTime),
      endTime: new Date(req.body.endTime),
      playerCount: req.body.playerCount,
      purpose: req.body.purpose,
      specialRequests: req.body.specialRequests,
      participants: req.body.participants,
      bookingType: req.body.bookingType,
    };

    const booking = await CourtBookingService.createBooking(bookingRequest, req.body.userId);
    res.status(201).json({ success: true, data: booking });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ success: false, error: 'Failed to create booking' });
  }
});

// GET /api/court-bookings/my-bookings - Get user's bookings
router.get('/my-bookings', async (req: Request, res: Response) => {
  try {
    const userId = req.body.userId; // This should come from authenticated user
    const status = req.query.status ? [req.query.status as BookingStatus] : undefined;
    const upcomingOnly = req.query.upcomingOnly === 'true';

    const bookings = await CourtBookingService.getUserBookings(userId, status, upcomingOnly);
    res.json({ success: true, data: bookings });
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch bookings' });
  }
});

// GET /api/court-bookings/courts/:courtId/bookings - Get court bookings
router.get('/courts/:courtId/bookings', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const bookings = await CourtBookingService.getCourtBookings(
      req.params.courtId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json({ success: true, data: bookings });
  } catch (error) {
    console.error('Error fetching court bookings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch court bookings' });
  }
});

// PUT /api/court-bookings/:bookingId/status - Update booking status
router.put('/:bookingId/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;

    if (!status || !Object.values(BookingStatus).includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Valid status is required'
      });
    }

    const booking = await CourtBookingService.updateBookingStatus(
      req.params.bookingId,
      status,
      req.body.userId
    );

    res.json({ success: true, data: booking });
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ success: false, error: 'Failed to update booking status' });
  }
});

// PUT /api/court-bookings/:bookingId - Update booking details
router.put('/:bookingId', async (req: Request, res: Response) => {
  try {
    const updateRequest: CourtBookingUpdateRequest = {
      status: req.body.status,
      specialRequests: req.body.specialRequests,
      participants: req.body.participants,
    };

    // For now, just update status - could be expanded
    if (updateRequest.status) {
      const booking = await CourtBookingService.updateBookingStatus(
        req.params.bookingId,
        updateRequest.status,
        req.body.userId
      );
      res.json({ success: true, data: booking });
    } else {
      res.json({ success: true, message: 'No updates applied' });
    }
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({ success: false, error: 'Failed to update booking' });
  }
});

// DELETE /api/court-bookings/:bookingId - Cancel booking
router.delete('/:bookingId', async (req: Request, res: Response) => {
  try {
    const booking = await CourtBookingService.updateBookingStatus(
      req.params.bookingId,
      BookingStatus.CANCELLED,
      req.body.userId
    );

    res.json({ success: true, data: booking });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel booking' });
  }
});

// POST /api/court-bookings/courts/:courtId/maintenance - Schedule maintenance
router.post('/courts/:courtId/maintenance', async (req: Request, res: Response) => {
  try {
    const maintenanceRequest: CourtMaintenanceRequest = {
      courtId: req.params.courtId,
      maintenanceType: req.body.maintenanceType,
      description: req.body.description,
      priority: req.body.priority,
      scheduledStart: new Date(req.body.scheduledStart),
      scheduledEnd: req.body.scheduledEnd ? new Date(req.body.scheduledEnd) : undefined,
      estimatedCost: req.body.estimatedCost,
      assignedTo: req.body.assignedTo,
      notes: req.body.notes,
    };

    const maintenance = await CourtBookingService.createMaintenance(maintenanceRequest);
    res.status(201).json({ success: true, data: maintenance });
  } catch (error) {
    console.error('Error scheduling maintenance:', error);
    res.status(500).json({ success: false, error: 'Failed to schedule maintenance' });
  }
});

// GET /api/court-bookings/courts/:courtId/availability - Get court availability
router.get('/courts/:courtId/availability', async (req: Request, res: Response) => {
  try {
    const { date, startTime, endTime, duration } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'date is required'
      });
    }

    const availabilityRequest: CourtAvailabilityRequest = {
      courtId: req.params.courtId,
      date: new Date(date as string),
      startTime: startTime as string,
      endTime: endTime as string,
      duration: duration ? parseInt(duration as string) : undefined,
    };

    // For now, return basic availability - could be expanded
    const isAvailable = await CourtBookingService.checkCourtAvailability(
      req.params.courtId,
      new Date(`${date}T${startTime || '00:00'}:00`),
      new Date(`${date}T${endTime || '23:59'}:00`)
    );

    res.json({ success: true, data: { available: isAvailable } });
  } catch (error) {
    console.error('Error checking court availability:', error);
    res.status(500).json({ success: false, error: 'Failed to check court availability' });
  }
});

// GET /api/court-bookings/courts/:courtId/stats - Get court usage statistics
router.get('/courts/:courtId/stats', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const stats = await CourtBookingService.getCourtUsageStats(
      req.params.courtId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching court stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch court statistics' });
  }
});

// GET /api/court-bookings/venues/:venueId/revenue - Get venue revenue report
router.get('/venues/:venueId/revenue', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const report = await CourtBookingService.getVenueRevenueReport(
      req.params.venueId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json({ success: true, data: report });
  } catch (error) {
    console.error('Error fetching revenue report:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch revenue report' });
  }
});

// POST /api/court-bookings/venues - Create a new venue
router.post('/venues', async (req: Request, res: Response) => {
  try {
    const venueData = req.body;
    const venue = await CourtBookingService.createVenue(venueData);
    res.status(201).json({ success: true, data: venue });
  } catch (error) {
    console.error('Error creating venue:', error);
    res.status(500).json({ success: false, error: 'Failed to create venue' });
  }
});

// POST /api/court-bookings/courts - Create a new court
router.post('/courts', async (req: Request, res: Response) => {
  try {
    const courtData = req.body;
    const court = await CourtBookingService.createCourt(courtData);
    res.status(201).json({ success: true, data: court });
  } catch (error) {
    console.error('Error creating court:', error);
    res.status(500).json({ success: false, error: 'Failed to create court' });
  }
});

// POST /api/court-bookings/:bookingId/confirm-payment - Confirm payment for booking
router.post('/:bookingId/confirm-payment', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        error: 'paymentIntentId is required'
      });
    }

    const booking = await CourtBookingService.confirmBookingPayment(
      req.params.bookingId,
      paymentIntentId
    );

    res.json({
      success: true,
      data: booking,
      message: 'Payment confirmed and booking updated successfully'
    });
  } catch (error: any) {
    console.error('Error confirming booking payment:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to confirm booking payment'
    });
  }
});

// POST /api/court-bookings/:bookingId/refund - Process refund for booking
router.post('/:bookingId/refund', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;

    const booking = await CourtBookingService.processBookingRefund(
      req.params.bookingId,
      reason
    );

    res.json({
      success: true,
      data: booking,
      message: 'Refund processed successfully'
    });
  } catch (error: any) {
    console.error('Error processing booking refund:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process booking refund'
    });
  }
});

// GET /api/court-bookings/:bookingId/payment-status - Get payment status for booking
router.get('/:bookingId/payment-status', async (req: Request, res: Response) => {
  try {
    // Get booking details from service
    const bookings = await CourtBookingService.getUserBookings(req.body.userId || '', [], false);
    const booking = bookings.find(b => b.id === req.params.bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    // Get latest payment intent status if paymentId exists
    let paymentIntent = null;
    if (booking.paymentId) {
      try {
        const { PaymentService } = await import('../services/paymentService');
        const paymentConfig = {
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
        paymentIntent = await paymentService.getPaymentIntent(booking.paymentId);
      } catch (error) {
        console.error('Error fetching payment intent:', error);
      }
    }

    res.json({
      success: true,
      data: {
        bookingId: booking.id,
        paymentStatus: booking.paymentStatus,
        paymentId: booking.paymentId,
        totalPrice: booking.totalPrice,
        currency: booking.currency,
        paymentIntent: paymentIntent,
      }
    });
  } catch (error: any) {
    console.error('Error fetching payment status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch payment status'
    });
  }
});

export default router;