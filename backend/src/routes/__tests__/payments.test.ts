import request from 'supertest';
import express from 'express';
import paymentRoutes from '../payments';

// Mock the PaymentService
jest.mock('../../services/paymentService', () => {
  return {
    PaymentService: jest.fn().mockImplementation(() => ({
      createPaymentIntent: jest.fn(),
      confirmPayment: jest.fn(),
      cancelPayment: jest.fn(),
      createRefund: jest.fn(),
      getPaymentIntent: jest.fn(),
      getUserTransactions: jest.fn(),
      handleWebhook: jest.fn(),
      getPublishableKey: jest.fn(),
    })),
  };
});

describe('Payment Routes', () => {
  let app: express.Application;
  let mockPaymentService: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create Express app with payment routes
    app = express();
    app.use(express.json());
    app.use('/payments', paymentRoutes);

    // Get the mocked service instance
    const PaymentService = require('../../services/paymentService').PaymentService;
    mockPaymentService = PaymentService.mock.results[PaymentService.mock.calls.length - 1].value;
  });

  describe('GET /payments/config', () => {
    it('should return payment configuration', async () => {
      mockPaymentService.getPublishableKey.mockReturnValue('pk_test_mock');

      const response = await request(app)
        .get('/payments/config')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.publishableKey).toBe('pk_test_mock');
      expect(response.body.data.defaultCurrency).toBe('usd');
    });
  });

  describe('POST /payments/create-intent', () => {
    it('should create a payment intent successfully', async () => {
      const mockPaymentIntent = {
        id: 'pi_mock_123',
        amount: 50,
        currency: 'usd',
        status: 'requires_payment_method',
        clientSecret: 'pi_mock_secret',
      };

      mockPaymentService.createPaymentIntent.mockResolvedValue({
        success: true,
        paymentIntent: mockPaymentIntent,
      });

      const response = await request(app)
        .post('/payments/create-intent')
        .send({
          amount: 50,
          currency: 'usd',
          description: 'Test payment',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('pi_mock_123');
      expect(mockPaymentService.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 50,
          currency: 'usd',
          description: 'Test payment',
        }),
        undefined
      );
    });

    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/payments/create-intent')
        .send({
          amount: -10, // Invalid amount
          currency: 'usd',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle payment service errors', async () => {
      mockPaymentService.createPaymentIntent.mockResolvedValue({
        success: false,
        error: 'Payment service error',
      });

      const response = await request(app)
        .post('/payments/create-intent')
        .send({
          amount: 50,
          currency: 'usd',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Payment service error');
    });
  });

  describe('POST /payments/confirm', () => {
    it('should confirm a payment successfully', async () => {
      const mockPaymentIntent = {
        id: 'pi_mock_123',
        status: 'succeeded',
      };

      mockPaymentService.confirmPayment.mockResolvedValue({
        success: true,
        paymentIntent: mockPaymentIntent,
      });

      const response = await request(app)
        .post('/payments/confirm')
        .send({
          paymentIntentId: 'pi_mock_123',
          paymentMethodId: 'pm_mock_123',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('pi_mock_123');
    });

    it('should handle confirmation errors', async () => {
      mockPaymentService.confirmPayment.mockResolvedValue({
        success: false,
        error: 'Confirmation failed',
      });

      const response = await request(app)
        .post('/payments/confirm')
        .send({
          paymentIntentId: 'pi_mock_123',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Confirmation failed');
    });
  });

  describe('POST /payments/cancel/:paymentIntentId', () => {
    it('should cancel a payment intent successfully', async () => {
      const mockPaymentIntent = {
        id: 'pi_mock_123',
        status: 'canceled',
      };

      mockPaymentService.cancelPayment.mockResolvedValue({
        success: true,
        paymentIntent: mockPaymentIntent,
      });

      const response = await request(app)
        .post('/payments/cancel/pi_mock_123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('canceled');
      expect(mockPaymentService.cancelPayment).toHaveBeenCalledWith('pi_mock_123');
    });
  });

  describe('POST /payments/refund', () => {
    it('should create a refund successfully', async () => {
      const mockRefund = {
        id: 'rf_mock_123',
        amount: 5000,
      };

      mockPaymentService.createRefund.mockResolvedValue({
        success: true,
        refund: mockRefund,
      });

      const response = await request(app)
        .post('/payments/refund')
        .send({
          paymentIntentId: 'pi_mock_123',
          amount: 50,
          reason: 'requested_by_customer',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('rf_mock_123');
    });
  });

  describe('GET /payments/intent/:paymentIntentId', () => {
    it('should retrieve a payment intent successfully', async () => {
      const mockPaymentIntent = {
        id: 'pi_mock_123',
        amount: 50,
        currency: 'usd',
        status: 'succeeded',
      };

      mockPaymentService.getPaymentIntent.mockResolvedValue(mockPaymentIntent);

      const response = await request(app)
        .get('/payments/intent/pi_mock_123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('pi_mock_123');
    });

    it('should return 404 for non-existent payment intent', async () => {
      mockPaymentService.getPaymentIntent.mockResolvedValue(null);

      const response = await request(app)
        .get('/payments/intent/pi_invalid')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Payment intent not found');
    });
  });

  describe('GET /payments/transactions', () => {
    it('should retrieve user transactions successfully', async () => {
      const mockTransactions = [
        {
          id: 'txn_1',
          amount: 50,
          currency: 'usd',
          status: 'succeeded',
        },
      ];

      mockPaymentService.getUserTransactions.mockResolvedValue(mockTransactions);

      const response = await request(app)
        .get('/payments/transactions')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.transactions).toHaveLength(1);
      expect(response.body.data.transactions[0].id).toBe('txn_1');
    });
  });

  describe('POST /payments/webhook', () => {
    it('should handle webhook successfully', async () => {
      mockPaymentService.handleWebhook.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/payments/webhook')
        .set('stripe-signature', 'mock_signature')
        .send({ type: 'payment_intent.succeeded' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Webhook processed successfully');
    });

    it('should reject webhook without signature', async () => {
      const response = await request(app)
        .post('/payments/webhook')
        .send({ type: 'payment_intent.succeeded' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing Stripe signature');
    });
  });
});