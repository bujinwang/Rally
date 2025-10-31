import { PaymentIntent, PaymentTransaction, CreatePaymentIntentRequest, ConfirmPaymentRequest, CreateRefundRequest, PaymentIntentResponse, RefundResponse, PaymentConfig } from '../types/payment';
export declare class PaymentService {
    private stripe;
    private config;
    constructor(config: PaymentConfig);
    /**
     * Create a payment intent
     */
    createPaymentIntent(request: CreatePaymentIntentRequest, userId?: string): Promise<PaymentIntentResponse>;
    /**
     * Confirm a payment intent
     */
    confirmPayment(request: ConfirmPaymentRequest): Promise<PaymentIntentResponse>;
    /**
     * Cancel a payment intent
     */
    cancelPayment(paymentIntentId: string): Promise<PaymentIntentResponse>;
    /**
     * Create a refund
     */
    createRefund(request: CreateRefundRequest): Promise<RefundResponse>;
    /**
     * Get payment intent by ID
     */
    getPaymentIntent(paymentIntentId: string): Promise<PaymentIntent | null>;
    /**
     * Get transactions for a user
     */
    getUserTransactions(userId: string): Promise<PaymentTransaction[]>;
    /**
     * Handle Stripe webhook
     */
    handleWebhook(rawBody: Buffer, signature: string): Promise<void>;
    /**
     * Process webhook event
     */
    private processWebhookEvent;
    /**
     * Handle payment intent succeeded
     */
    private handlePaymentIntentSucceeded;
    /**
     * Handle payment intent failed
     */
    private handlePaymentIntentFailed;
    /**
     * Handle charge refunded
     */
    private handleChargeRefunded;
    /**
     * Get Stripe publishable key (for frontend)
     */
    getPublishableKey(): string;
}
//# sourceMappingURL=paymentService.d.ts.map