"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const paymentService_1 = require("../services/paymentService");
const auth_1 = require("../middleware/auth");
// Initialize payment service with configuration
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
const paymentService = new paymentService_1.PaymentService(paymentConfig);
const router = (0, express_1.Router)();
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
/**
 * @route GET /api/payments/config
 * @desc Get payment configuration (publishable key)
 * @access Private
 */
router.get('/config', async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                publishableKey: paymentService.getPublishableKey(),
                defaultCurrency: paymentConfig.defaultCurrency,
                supportedCurrencies: paymentConfig.supportedCurrencies,
            },
        });
    }
    catch (error) {
        console.error('Error fetching payment config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payment configuration',
        });
    }
});
/**
 * @route POST /api/payments/create-intent
 * @desc Create a payment intent
 * @access Private
 */
router.post('/create-intent', [
    (0, express_validator_1.body)('amount').isFloat({ min: 0.01 }),
    (0, express_validator_1.body)('currency').isString().isLength({ min: 3, max: 3 }),
    (0, express_validator_1.body)('description').optional().isString().isLength({ max: 500 }),
    (0, express_validator_1.body)('metadata').optional().isObject(),
    (0, express_validator_1.body)('receiptEmail').optional().isEmail(),
    (0, express_validator_1.body)('customerId').optional().isString(),
    (0, express_validator_1.body)('paymentMethodId').optional().isString(),
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
            });
        }
        const request = {
            amount: req.body.amount,
            currency: req.body.currency,
            description: req.body.description,
            metadata: req.body.metadata,
            receiptEmail: req.body.receiptEmail,
            customerId: req.body.customerId,
            paymentMethodId: req.body.paymentMethodId,
        };
        const result = await paymentService.createPaymentIntent(request, req.body.userId);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error,
            });
        }
        res.status(201).json({
            success: true,
            data: result.paymentIntent,
            message: 'Payment intent created successfully',
        });
    }
    catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create payment intent',
        });
    }
});
/**
 * @route POST /api/payments/confirm
 * @desc Confirm a payment intent
 * @access Private
 */
router.post('/confirm', [
    (0, express_validator_1.body)('paymentIntentId').isString().isLength({ min: 1 }),
    (0, express_validator_1.body)('paymentMethodId').optional().isString(),
    (0, express_validator_1.body)('returnUrl').optional().isString(),
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
            });
        }
        const request = {
            paymentIntentId: req.body.paymentIntentId,
            paymentMethodId: req.body.paymentMethodId,
            returnUrl: req.body.returnUrl,
        };
        const result = await paymentService.confirmPayment(request);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error,
            });
        }
        res.json({
            success: true,
            data: result.paymentIntent,
            message: 'Payment confirmed successfully',
        });
    }
    catch (error) {
        console.error('Error confirming payment:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to confirm payment',
        });
    }
});
/**
 * @route POST /api/payments/cancel/:paymentIntentId
 * @desc Cancel a payment intent
 * @access Private
 */
router.post('/cancel/:paymentIntentId', [(0, express_validator_1.param)('paymentIntentId').isString().isLength({ min: 1 })], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
            });
        }
        const result = await paymentService.cancelPayment(req.params.paymentIntentId);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error,
            });
        }
        res.json({
            success: true,
            data: result.paymentIntent,
            message: 'Payment cancelled successfully',
        });
    }
    catch (error) {
        console.error('Error cancelling payment:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to cancel payment',
        });
    }
});
/**
 * @route POST /api/payments/refund
 * @desc Create a refund
 * @access Private
 */
router.post('/refund', [
    (0, express_validator_1.body)('paymentIntentId').isString().isLength({ min: 1 }),
    (0, express_validator_1.body)('amount').optional().isFloat({ min: 0.01 }),
    (0, express_validator_1.body)('reason').optional().isIn(['duplicate', 'fraudulent', 'requested_by_customer', 'expired_uncaptured_charge']),
    (0, express_validator_1.body)('metadata').optional().isObject(),
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
            });
        }
        const request = {
            paymentIntentId: req.body.paymentIntentId,
            amount: req.body.amount,
            reason: req.body.reason,
            metadata: req.body.metadata,
        };
        const result = await paymentService.createRefund(request);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error,
            });
        }
        res.json({
            success: true,
            data: result.refund,
            message: 'Refund created successfully',
        });
    }
    catch (error) {
        console.error('Error creating refund:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create refund',
        });
    }
});
/**
 * @route GET /api/payments/intent/:paymentIntentId
 * @desc Get payment intent details
 * @access Private
 */
router.get('/intent/:paymentIntentId', [(0, express_validator_1.param)('paymentIntentId').isString().isLength({ min: 1 })], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
            });
        }
        const paymentIntent = await paymentService.getPaymentIntent(req.params.paymentIntentId);
        if (!paymentIntent) {
            return res.status(404).json({
                success: false,
                error: 'Payment intent not found',
            });
        }
        res.json({
            success: true,
            data: paymentIntent,
        });
    }
    catch (error) {
        console.error('Error fetching payment intent:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch payment intent',
        });
    }
});
/**
 * @route GET /api/payments/transactions
 * @desc Get user payment transactions
 * @access Private
 */
router.get('/transactions', async (req, res) => {
    try {
        const userId = req.body.userId; // This should come from authenticated user
        const limit = req.query.limit ? parseInt(req.query.limit) : 20;
        const offset = req.query.offset ? parseInt(req.query.offset) : 0;
        const transactions = await paymentService.getUserTransactions(userId);
        // Apply pagination
        const paginatedTransactions = transactions.slice(offset, offset + limit);
        res.json({
            success: true,
            data: {
                transactions: paginatedTransactions,
                total: transactions.length,
                limit,
                offset,
            },
        });
    }
    catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch transactions',
        });
    }
});
/**
 * @route POST /api/payments/webhook
 * @desc Handle Stripe webhooks
 * @access Public (but verified via signature)
 */
router.post('/webhook', async (req, res) => {
    try {
        const sig = req.headers['stripe-signature'];
        const rawBody = req.body;
        if (!sig) {
            return res.status(400).json({
                success: false,
                error: 'Missing Stripe signature',
            });
        }
        await paymentService.handleWebhook(rawBody, sig);
        res.json({ success: true, message: 'Webhook processed successfully' });
    }
    catch (error) {
        console.error('Error processing webhook:', error);
        res.status(400).json({
            success: false,
            error: error.message || 'Failed to process webhook',
        });
    }
});
exports.default = router;
//# sourceMappingURL=payments.js.map