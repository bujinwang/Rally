import request from 'supertest';
import express from 'express';

jest.mock('../../middleware/auth', () => ({ authenticateToken: (_r: any, _s: any, n: any) => n() }));
jest.mock('../../services/courtBookingService', () => ({
  CourtBookingService: {
    searchCourts: jest.fn(),
    getCourtById: jest.fn(),
    checkCourtAvailability: jest.fn(),
    calculateBookingPrice: jest.fn(),
    createBooking: jest.fn(),
    getUserBookings: jest.fn(),
    getCourtBookings: jest.fn(),
    updateBookingStatus: jest.fn(),
    createMaintenance: jest.fn(),
    getCourtUsageStats: jest.fn(),
    getVenueRevenueReport: jest.fn(),
    createVenue: jest.fn(),
    createCourt: jest.fn(),
    confirmBookingPayment: jest.fn(),
    processBookingRefund: jest.fn(),
  },
}));

import { CourtBookingService } from '../../services/courtBookingService';
import courtBookingsRouter from '../courtBookings';

const app = express();
app.use(express.json());
app.use('/bookings', courtBookingsRouter);

describe('Court Booking Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /bookings/search', () => {
    it('returns courts matching filters', async () => {
      (CourtBookingService.searchCourts as jest.Mock).mockResolvedValue([{ id: 'c1', name: 'Court 1' }]);
      const res = await request(app).get('/bookings/search?courtType=indoor').expect(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /bookings/courts/:courtId', () => {
    it('returns court details', async () => {
      (CourtBookingService.getCourtById as jest.Mock).mockResolvedValue({ id: 'c1', name: 'Court 1' });
      const res = await request(app).get('/bookings/courts/c1').expect(200);
      expect(res.body.data.name).toBe('Court 1');
    });

    it('returns 404 when not found', async () => {
      (CourtBookingService.getCourtById as jest.Mock).mockResolvedValue(null);
      await request(app).get('/bookings/courts/bad').expect(404);
    });
  });

  describe('POST /bookings/check-availability', () => {
    it('returns availability', async () => {
      (CourtBookingService.checkCourtAvailability as jest.Mock).mockResolvedValue(true);
      const res = await request(app).post('/bookings/check-availability')
        .send({ courtId: 'c1', startTime: '2026-05-11T10:00:00Z', endTime: '2026-05-11T11:00:00Z' })
        .expect(200);
      expect(res.body.data.available).toBe(true);
    });

    it('validates required fields', async () => {
      await request(app).post('/bookings/check-availability').send({}).expect(400);
    });
  });

  describe('POST /bookings/calculate-price', () => {
    it('returns calculated price', async () => {
      (CourtBookingService.calculateBookingPrice as jest.Mock).mockResolvedValue(25.50);
      const res = await request(app).post('/bookings/calculate-price')
        .send({ courtId: 'c1', startTime: '2026-05-11T10:00:00Z', endTime: '2026-05-11T11:00:00Z' })
        .expect(200);
      expect(res.body.data.price).toBe(25.5);
    });
  });

  describe('POST /bookings', () => {
    it('creates booking', async () => {
      (CourtBookingService.createBooking as jest.Mock).mockResolvedValue({ id: 'b1', status: 'CONFIRMED' });
      const res = await request(app).post('/bookings')
        .send({ courtId: 'c1', startTime: '2026-05-11T10:00:00Z', endTime: '2026-05-11T11:00:00Z', userId: 'u1' })
        .expect(201);
      expect(res.body.data.status).toBe('CONFIRMED');
    });
  });

  describe('GET /bookings/my-bookings', () => {
    it('returns user bookings (requires userId in body for GET)', async () => {
      (CourtBookingService.getUserBookings as jest.Mock).mockResolvedValue([{ id: 'b1' }]);
      // Route reads userId from req.body — for GET this requires sending a body
      // This matches the existing route behavior
      const res = await request(app).get('/bookings/my-bookings').send({ userId: 'u1' }).expect(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /bookings/courts/:courtId/bookings', () => {
    it('returns court bookings for date range', async () => {
      (CourtBookingService.getCourtBookings as jest.Mock).mockResolvedValue([]);
      await request(app).get('/bookings/courts/c1/bookings?startDate=2026-05-01&endDate=2026-05-31').expect(200);
    });

    it('requires startDate and endDate', async () => {
      await request(app).get('/bookings/courts/c1/bookings').expect(400);
    });
  });

  describe('PUT /bookings/:bookingId/status', () => {
    it('updates booking status', async () => {
      (CourtBookingService.updateBookingStatus as jest.Mock).mockResolvedValue({ id: 'b1', status: 'CANCELLED' });
      const res = await request(app).put('/bookings/b1/status').send({ status: 'CANCELLED', userId: 'u1' }).expect(200);
      expect(res.body.data.status).toBe('CANCELLED');
    });
  });

  describe('DELETE /bookings/:bookingId', () => {
    it('cancels booking', async () => {
      (CourtBookingService.updateBookingStatus as jest.Mock).mockResolvedValue({ id: 'b1', status: 'CANCELLED' });
      const res = await request(app).delete('/bookings/b1').send({ userId: 'u1' }).expect(200);
      expect(res.body.data.status).toBe('CANCELLED');
    });
  });

  describe('GET /bookings/courts/:courtId/stats', () => {
    it('returns court usage stats', async () => {
      (CourtBookingService.getCourtUsageStats as jest.Mock).mockResolvedValue({ totalBookings: 50 });
      const res = await request(app)
        .get('/bookings/courts/c1/stats?startDate=2026-05-01&endDate=2026-05-31')
        .expect(200);
      expect(res.body.data.totalBookings).toBe(50);
    });
  });
});
