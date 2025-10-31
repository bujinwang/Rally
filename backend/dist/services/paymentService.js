"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentService = void 0;
const stripe_1 = __importDefault(require("stripe"));
const payment_1 = require("../types/payment");
// Temporary in-memory storage until Prisma client is generated
const paymentIntentStore = [];
const paymentMethodStore = [];
const transactionStore = [];
// Helper function to generate IDs
function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
class PaymentService {
    constructor(config) {
        this.config = config;
        this.stripe = new stripe_1.default(config.stripe.secretKey, {
            apiVersion: config.stripe.apiVersion,
        });
    }
    /**
     * Create a payment intent
     */
    async createPaymentIntent(request, userId) {
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
            const paymentIntent = {
                id: stripeIntent.id,
                amount: request.amount,
                currency: request.currency,
                status: stripeIntent.status,
                clientSecret: stripeIntent.client_secret,
                paymentMethodId: request.paymentMethodId,
                metadata: request.metadata,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            paymentIntentStore.push(paymentIntent);
            // Create transaction record
            const transaction = {
                id: generateId('txn'),
                paymentIntentId: stripeIntent.id,
                amount: request.amount,
                currency: request.currency,
                status: payment_1.PaymentStatus.PENDING,
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
        }
        catch (error) {
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
    async confirmPayment(request) {
        try {
            const stripeIntent = await this.stripe.paymentIntents.confirm(request.paymentIntentId, {
                payment_method: request.paymentMethodId,
                return_url: request.returnUrl,
            });
            // Update local payment intent
            const localIntent = paymentIntentStore.find(pi => pi.id === request.paymentIntentId);
            if (localIntent) {
                localIntent.status = stripeIntent.status;
                localIntent.updatedAt = new Date();
            }
            // Update transaction
            const transaction = transactionStore.find(t => t.paymentIntentId === request.paymentIntentId);
            if (transaction) {
                transaction.status = stripeIntent.status === 'succeeded' ? payment_1.PaymentStatus.SUCCEEDED : payment_1.PaymentStatus.FAILED;
                transaction.updatedAt = new Date();
            }
            return {
                success: true,
                paymentIntent: localIntent,
            };
        }
        catch (error) {
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
    async cancelPayment(paymentIntentId) {
        try {
            const stripeIntent = await this.stripe.paymentIntents.cancel(paymentIntentId);
            // Update local payment intent
            const localIntent = paymentIntentStore.find(pi => pi.id === paymentIntentId);
            if (localIntent) {
                localIntent.status = payment_1.PaymentIntentStatus.CANCELED;
                localIntent.updatedAt = new Date();
            }
            // Update transaction
            const transaction = transactionStore.find(t => t.paymentIntentId === paymentIntentId);
            if (transaction) {
                transaction.status = payment_1.PaymentStatus.CANCELED;
                transaction.updatedAt = new Date();
            }
            return {
                success: true,
                paymentIntent: localIntent,
            };
        }
        catch (error) {
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
    async createRefund(request) {
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
                reason: request.reason,
                metadata: request.metadata,
            });
            // Update transaction record
            const transaction = transactionStore.find(t => t.paymentIntentId === request.paymentIntentId);
            if (transaction) {
                transaction.status = payment_1.PaymentStatus.REFUNDED;
                transaction.refundedAmount = (refund.amount / 100);
                transaction.refundReason = request.reason;
                transaction.updatedAt = new Date();
            }
            return {
                success: true,
                refund,
            };
        }
        catch (error) {
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
    async getPaymentIntent(paymentIntentId) {
        const localIntent = paymentIntentStore.find(pi => pi.id === paymentIntentId);
        if (!localIntent)
            return null;
        try {
            // Get latest status from Stripe
            const stripeIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
            localIntent.status = stripeIntent.status;
            localIntent.updatedAt = new Date();
        }
        catch (error) {
            console.error('Error retrieving payment intent from Stripe:', error);
        }
        return localIntent;
    }
    /**
     * Get transactions for a user
     */
    async getUserTransactions(userId) {
        // In a real implementation, this would filter by userId from metadata
        return transactionStore.filter(t => t.metadata?.userId === userId);
    }
    /**
     * Handle Stripe webhook
     */
    async handleWebhook(rawBody, signature) {
        try {
            const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.config.stripe.webhookSecret);
            await this.processWebhookEvent(event);
        }
        catch (error) {
            console.error('Webhook signature verification failed:', error);
            throw new Error('Invalid webhook signature');
        }
    }
    /**
     * Process webhook event
     */
    async processWebhookEvent(event) {
        console.log(`Processing webhook event: ${event.type}`);
        switch (event.type) {
            case payment_1.WebhookEventType.PAYMENT_INTENT_SUCCEEDED:
                await this.handlePaymentIntentSucceeded(event.data.object);
                break;
            case payment_1.WebhookEventType.PAYMENT_INTENT_PAYMENT_FAILED:
                await this.handlePaymentIntentFailed(event.data.object);
                break;
            case payment_1.WebhookEventType.CHARGE_REFUNDED:
                await this.handleChargeRefunded(event.data.object);
                break;
            default:
                console.log(`Unhandled webhook event type: ${event.type}`);
        }
    }
    /**
     * Handle payment intent succeeded
     */
    async handlePaymentIntentSucceeded(paymentIntent) {
        const localIntent = paymentIntentStore.find(pi => pi.id === paymentIntent.id);
        if (localIntent) {
            localIntent.status = payment_1.PaymentIntentStatus.SUCCEEDED;
            localIntent.updatedAt = new Date();
        }
        const transaction = transactionStore.find(t => t.paymentIntentId === paymentIntent.id);
        if (transaction) {
            transaction.status = payment_1.PaymentStatus.SUCCEEDED;
            transaction.updatedAt = new Date();
        }
        console.log(`Payment intent ${paymentIntent.id} succeeded`);
    }
    /**
     * Handle payment intent failed
     */
    async handlePaymentIntentFailed(paymentIntent) {
        const localIntent = paymentIntentStore.find(pi => pi.id === paymentIntent.id);
        if (localIntent) {
            localIntent.status = payment_1.PaymentIntentStatus.CANCELED;
            localIntent.updatedAt = new Date();
        }
        const transaction = transactionStore.find(t => t.paymentIntentId === paymentIntent.id);
        if (transaction) {
            transaction.status = payment_1.PaymentStatus.FAILED;
            transaction.updatedAt = new Date();
        }
        console.log(`Payment intent ${paymentIntent.id} failed`);
    }
    /**
     * Handle charge refunded
     */
    async handleChargeRefunded(charge) {
        // Find transaction by charge ID (this would need to be stored in metadata)
        const transaction = transactionStore.find(t => t.metadata?.chargeId === charge.id);
        if (transaction) {
            transaction.status = payment_1.PaymentStatus.REFUNDED;
            transaction.refundedAmount = charge.amount_refunded / 100;
            transaction.updatedAt = new Date();
        }
        console.log(`Charge ${charge.id} refunded`);
    }
    /**
     * Get Stripe publishable key (for frontend)
     */
    getPublishableKey() {
        return this.config.stripe.publishableKey;
    }
}
exports.PaymentService = PaymentService;
//# sourceMappingURL=paymentService.js.map