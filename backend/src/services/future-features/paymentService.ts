import Stripe from 'stripe';
import {
  PaymentIntent,
  PaymentIntentStatus,
  PaymentMethod,
  PaymentTransaction,
  PaymentStatus,
  RefundRequest,
  CreatePaymentIntentRequest,
  ConfirmPaymentRequest,
  CreateRefundRequest,
  PaymentIntentResponse,
  RefundResponse,
  PaymentWebhookEvent,
  WebhookEventType,
  StripeConfig,
  PaymentConfig,
} from '../types/payment';

// Temporary in-memory storage until Prisma client is generated
const paymentIntentStore: PaymentIntent[] = [];
const paymentMethodStore: PaymentMethod[] = [];
const transactionStore: PaymentTransaction[] = [];

// Helper function to generate IDs
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export class PaymentService {
  private stripe: Stripe;
  private config: PaymentConfig;

  constructor(config: PaymentConfig) {
    this.config = config;
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: config.stripe.apiVersion as any,
    });
  }

  /**
   * Create a payment intent
   */
  async createPaymentIntent(
    request: CreatePaymentIntentRequest,
    userId?: string
  ): Promise<PaymentIntentResponse> {
    try {
      // Validate currency
      if (!this.config.supportedCurrencies.includes(request.currency)) {
        return {
          success: false,
          error: `Unsupported currency: ${request.currency}`,
        };
      }

      // Create Stripe payment intent
      const stripeIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(request.amount * 100), // Convert to cents
        currency: request.currency,
        payment_method: request.paymentMethodId,
        description: request.description,
        metadata: {
          userId: userId || '',
          ...request.metadata,
        },
        receipt_email: request.receiptEmail,
        customer: request.customerId,
        automatic_payment_methods: {
          enabled: !request.paymentMethodId, // Enable automatic payment methods if no specific method provided
        },
      });

      // Store payment intent locally
      const paymentIntent: PaymentIntent = {
        id: stripeIntent.id,
        amount: request.amount,
        currency: request.currency,
        status: stripeIntent.status as PaymentIntentStatus,
        clientSecret: stripeIntent.client_secret!,
        paymentMethodId: request.paymentMethodId,
        metadata: request.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      paymentIntentStore.push(paymentIntent);

      // Create transaction record
      const transaction: PaymentTransaction = {
        id: generateId('txn'),
        paymentIntentId: stripeIntent.id,
        amount: request.amount,
        currency: request.currency,
        status: PaymentStatus.PENDING,
        paymentMethodId: request.paymentMethodId,
        description: request.description,
        metadata: request.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      transactionStore.push(transaction);

      return {
        success: true,
        paymentIntent,
      };
    } catch (error: any) {
      console.error('Error creating payment intent:', error);
      return {
        success: false,
        error: error.message || 'Failed to create payment intent',
      };
    }
  }

  /**
   * Confirm a payment intent
   */
  async confirmPayment(request: ConfirmPaymentRequest): Promise<PaymentIntentResponse> {
    try {
      const stripeIntent = await this.stripe.paymentIntents.confirm(
        request.paymentIntentId,
        {
          payment_method: request.paymentMethodId,
          return_url: request.returnUrl,
        }
      );

      // Update local payment intent
      const localIntent = paymentIntentStore.find(pi => pi.id === request.paymentIntentId);
      if (localIntent) {
        localIntent.status = stripeIntent.status as PaymentIntentStatus;
        localIntent.updatedAt = new Date();
      }

      // Update transaction
      const transaction = transactionStore.find(t => t.paymentIntentId === request.paymentIntentId);
      if (transaction) {
        transaction.status = stripeIntent.status === 'succeeded' ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED;
        transaction.updatedAt = new Date();
      }

      return {
        success: true,
        paymentIntent: localIntent,
      };
    } catch (error: any) {
      console.error('Error confirming payment:', error);
      return {
        success: false,
        error: error.message || 'Failed to confirm payment',
      };
    }
  }

  /**
   * Cancel a payment intent
   */
  async cancelPayment(paymentIntentId: string): Promise<PaymentIntentResponse> {
    try {
      const stripeIntent = await this.stripe.paymentIntents.cancel(paymentIntentId);

      // Update local payment intent
      const localIntent = paymentIntentStore.find(pi => pi.id === paymentIntentId);
      if (localIntent) {
        localIntent.status = PaymentIntentStatus.CANCELED;
        localIntent.updatedAt = new Date();
      }

      // Update transaction
      const transaction = transactionStore.find(t => t.paymentIntentId === paymentIntentId);
      if (transaction) {
        transaction.status = PaymentStatus.CANCELED;
        transaction.updatedAt = new Date();
      }

      return {
        success: true,
        paymentIntent: localIntent,
      };
    } catch (error: any) {
      console.error('Error canceling payment:', error);
      return {
        success: false,
        error: error.message || 'Failed to cancel payment',
      };
    }
  }

  /**
   * Create a refund
   */
  async createRefund(request: CreateRefundRequest): Promise<RefundResponse> {
    try {
      // Find the payment intent to get the charge ID
      const paymentIntent = await this.stripe.paymentIntents.retrieve(request.paymentIntentId);

      if (!paymentIntent.charges.data.length) {
        return {
          success: false,
          error: 'No charge found for this payment intent',
        };
      }

      const chargeId = paymentIntent.charges.data[0].id;

      const refund = await this.stripe.refunds.create({
        charge: chargeId,
        amount: request.amount ? Math.round(request.amount * 100) : undefined,
        reason: request.reason as any,
        metadata: request.metadata,
      });

      // Update transaction record
      const transaction = transactionStore.find(t => t.paymentIntentId === request.paymentIntentId);
      if (transaction) {
        transaction.status = PaymentStatus.REFUNDED;
        transaction.refundedAmount = (refund.amount / 100);
        transaction.refundReason = request.reason;
        transaction.updatedAt = new Date();
      }

      return {
        success: true,
        refund,
      };
    } catch (error: any) {
      console.error('Error creating refund:', error);
      return {
        success: false,
        error: error.message || 'Failed to create refund',
      };
    }
  }

  /**
   * Get payment intent by ID
   */
  async getPaymentIntent(paymentIntentId: string): Promise<PaymentIntent | null> {
    const localIntent = paymentIntentStore.find(pi => pi.id === paymentIntentId);
    if (!localIntent) return null;

    try {
      // Get latest status from Stripe
      const stripeIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      localIntent.status = stripeIntent.status as PaymentIntentStatus;
      localIntent.updatedAt = new Date();
    } catch (error) {
      console.error('Error retrieving payment intent from Stripe:', error);
    }

    return localIntent;
  }

  /**
   * Get transactions for a user
   */
  async getUserTransactions(userId: string): Promise<PaymentTransaction[]> {
    // In a real implementation, this would filter by userId from metadata
    return transactionStore.filter(t => t.metadata?.userId === userId);
  }

  /**
   * Handle Stripe webhook
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    try {
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.stripe.webhookSecret
      ) as PaymentWebhookEvent;

      await this.processWebhookEvent(event);
    } catch (error: any) {
      console.error('Webhook signature verification failed:', error);
      throw new Error('Invalid webhook signature');
    }
  }

  /**
   * Process webhook event
   */
  private async processWebhookEvent(event: PaymentWebhookEvent): Promise<void> {
    console.log(`Processing webhook event: ${event.type}`);

    switch (event.type) {
      case WebhookEventType.PAYMENT_INTENT_SUCCEEDED:
        await this.handlePaymentIntentSucceeded(event.data.object);
        break;

      case WebhookEventType.PAYMENT_INTENT_PAYMENT_FAILED:
        await this.handlePaymentIntentFailed(event.data.object);
        break;

      case WebhookEventType.CHARGE_REFUNDED:
        await this.handleChargeRefunded(event.data.object);
        break;

      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }
  }

  /**
   * Handle payment intent succeeded
   */
  private async handlePaymentIntentSucceeded(paymentIntent: any): Promise<void> {
    const localIntent = paymentIntentStore.find(pi => pi.id === paymentIntent.id);
    if (localIntent) {
      localIntent.status = PaymentIntentStatus.SUCCEEDED;
      localIntent.updatedAt = new Date();
    }

    const transaction = transactionStore.find(t => t.paymentIntentId === paymentIntent.id);
    if (transaction) {
      transaction.status = PaymentStatus.SUCCEEDED;
      transaction.updatedAt = new Date();
    }

    console.log(`Payment intent ${paymentIntent.id} succeeded`);
  }

  /**
   * Handle payment intent failed
   */
  private async handlePaymentIntentFailed(paymentIntent: any): Promise<void> {
    const localIntent = paymentIntentStore.find(pi => pi.id === paymentIntent.id);
    if (localIntent) {
      localIntent.status = PaymentIntentStatus.CANCELED;
      localIntent.updatedAt = new Date();
    }

    const transaction = transactionStore.find(t => t.paymentIntentId === paymentIntent.id);
    if (transaction) {
      transaction.status = PaymentStatus.FAILED;
      transaction.updatedAt = new Date();
    }

    console.log(`Payment intent ${paymentIntent.id} failed`);
  }

  /**
   * Handle charge refunded
   */
  private async handleChargeRefunded(charge: any): Promise<void> {
    // Find transaction by charge ID (this would need to be stored in metadata)
    const transaction = transactionStore.find(t => t.metadata?.chargeId === charge.id);
    if (transaction) {
      transaction.status = PaymentStatus.REFUNDED;
      transaction.refundedAmount = charge.amount_refunded / 100;
      transaction.updatedAt = new Date();
    }

    console.log(`Charge ${charge.id} refunded`);
  }

  /**
   * Get Stripe publishable key (for frontend)
   */
  getPublishableKey(): string {
    return this.config.stripe.publishableKey;
  }
}