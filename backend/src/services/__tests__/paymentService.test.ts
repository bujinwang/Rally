import { PaymentService } from '../paymentService';
import { PaymentConfig, PaymentIntentStatus, PaymentStatus } from '../../types/payment';

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
      confirm: jest.fn(),
      cancel: jest.fn(),
    },
    refunds: {
      create: jest.fn(),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  }));
});

describe('PaymentService', () => {
  let paymentService: PaymentService;
  let mockStripe: any;

  const mockConfig: PaymentConfig = {
    stripe: {
      publishableKey: 'pk_test_mock',
      secretKey: 'sk_test_mock',
      webhookSecret: 'whsec_mock',
      apiVersion: '2023-10-16',
    },
    defaultCurrency: 'usd',
    supportedCurrencies: ['usd', 'cad', 'eur', 'gbp'],
    maxRefundDays: 90,
    enableWebhooks: true,
  };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create service instance
    paymentService = new PaymentService(mockConfig);

    // Get the mocked Stripe instance
    const Stripe = require('stripe');
    mockStripe = Stripe.mock.results[Stripe.mock.calls.length - 1].value;
  });

  describe('createPaymentIntent', () => {
    it('should create a payment intent successfully', async () => {
      const mockStripeIntent = {
        id: 'pi_mock_123',
        client_secret: 'pi_mock_secret',
        status: 'requires_payment_method',
        amount: 5000, // $50.00 in cents
        currency: 'usd',
      };

      mockStripe.paymentIntents.create.mockResolvedValue(mockStripeIntent);

      const result = await paymentService.createPaymentIntent({
        amount: 50,
        currency: 'usd',
        description: 'Test payment',
        metadata: { orderId: '123' },
      }, 'user_123');

      expect(result.success).toBe(true);
      expect(result.paymentIntent).toBeDefined();
      expect(result.paymentIntent?.id).toBe('pi_mock_123');
      expect(result.paymentIntent?.amount).toBe(50);
      expect(result.paymentIntent?.status).toBe(PaymentIntentStatus.REQUIRES_PAYMENT_METHOD);
    });

    it('should fail with unsupported currency', async () => {
      const result = await paymentService.createPaymentIntent({
        amount: 50,
        currency: 'btc', // Unsupported currency
        description: 'Test payment',
      }, 'user_123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported currency');
    });

    it('should handle Stripe errors', async () => {
      mockStripe.paymentIntents.create.mockRejectedValue(new Error('Stripe API error'));

      const result = await paymentService.createPaymentIntent({
        amount: 50,
        currency: 'usd',
        description: 'Test payment',
      }, 'user_123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Stripe API error');
    });
  });

  describe('confirmPayment', () => {
    it('should confirm a payment successfully', async () => {
      const mockStripeIntent = {
        id: 'pi_mock_123',
        status: 'succeeded',
      };

      mockStripe.paymentIntents.confirm.mockResolvedValue(mockStripeIntent);

      const result = await paymentService.confirmPayment({
        paymentIntentId: 'pi_mock_123',
        paymentMethodId: 'pm_mock_123',
      });

      expect(result.success).toBe(true);
      expect(result.paymentIntent?.status).toBe(PaymentIntentStatus.SUCCEEDED);
    });

    it('should handle confirmation errors', async () => {
      mockStripe.paymentIntents.confirm.mockRejectedValue(new Error('Confirmation failed'));

      const result = await paymentService.confirmPayment({
        paymentIntentId: 'pi_mock_123',
        paymentMethodId: 'pm_mock_123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Confirmation failed');
    });
  });

  describe('cancelPayment', () => {
    it('should cancel a payment intent successfully', async () => {
      const mockStripeIntent = {
        id: 'pi_mock_123',
        status: 'canceled',
      };

      mockStripe.paymentIntents.cancel.mockResolvedValue(mockStripeIntent);

      const result = await paymentService.cancelPayment('pi_mock_123');

      expect(result.success).toBe(true);
      expect(result.paymentIntent?.status).toBe(PaymentIntentStatus.CANCELED);
    });
  });

  describe('createRefund', () => {
    it('should create a refund successfully', async () => {
      const mockStripeIntent = {
        id: 'pi_mock_123',
        charges: {
          data: [{ id: 'ch_mock_123' }],
        },
      };

      const mockRefund = {
        id: 'rf_mock_123',
        amount: 5000,
      };

      mockStripe.paymentIntents.retrieve.mockResolvedValue(mockStripeIntent);
      mockStripe.refunds.create.mockResolvedValue(mockRefund);

      const result = await paymentService.createRefund({
        paymentIntentId: 'pi_mock_123',
        amount: 50,
        reason: 'requested_by_customer' as any,
      });

      expect(result.success).toBe(true);
      expect(result.refund).toBeDefined();
    });

    it('should handle refund errors', async () => {
      mockStripe.paymentIntents.retrieve.mockRejectedValue(new Error('Payment not found'));

      const result = await paymentService.createRefund({
        paymentIntentId: 'pi_invalid',
        amount: 50,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Payment not found');
    });
  });

  describe('getPaymentIntent', () => {
    it('should retrieve a payment intent successfully', async () => {
      const mockStripeIntent = {
        id: 'pi_mock_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
      };

      mockStripe.paymentIntents.retrieve.mockResolvedValue(mockStripeIntent);

      const paymentIntent = await paymentService.getPaymentIntent('pi_mock_123');

      expect(paymentIntent).toBeDefined();
      expect(paymentIntent?.id).toBe('pi_mock_123');
      expect(paymentIntent?.status).toBe(PaymentIntentStatus.SUCCEEDED);
    });

    it('should return null for non-existent payment intent', async () => {
      mockStripe.paymentIntents.retrieve.mockRejectedValue(new Error('Payment intent not found'));

      const paymentIntent = await paymentService.getPaymentIntent('pi_invalid');

      expect(paymentIntent).toBeNull();
    });
  });

  describe('getPublishableKey', () => {
    it('should return the publishable key', () => {
      const key = paymentService.getPublishableKey();
      expect(key).toBe('pk_test_mock');
    });
  });
});