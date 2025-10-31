"use strict";
// Payment Processing Types
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookEventType = exports.RefundReason = exports.PaymentStatus = exports.PaymentMethodType = exports.PaymentIntentStatus = void 0;
// Enums
var PaymentIntentStatus;
(function (PaymentIntentStatus) {
    PaymentIntentStatus["REQUIRES_PAYMENT_METHOD"] = "requires_payment_method";
    PaymentIntentStatus["REQUIRES_CONFIRMATION"] = "requires_confirmation";
    PaymentIntentStatus["REQUIRES_ACTION"] = "requires_action";
    PaymentIntentStatus["PROCESSING"] = "processing";
    PaymentIntentStatus["REQUIRES_CAPTURE"] = "requires_capture";
    PaymentIntentStatus["CANCELED"] = "canceled";
    PaymentIntentStatus["SUCCEEDED"] = "succeeded";
})(PaymentIntentStatus || (exports.PaymentIntentStatus = PaymentIntentStatus = {}));
var PaymentMethodType;
(function (PaymentMethodType) {
    PaymentMethodType["CARD"] = "card";
    PaymentMethodType["BANK_ACCOUNT"] = "bank_account";
    PaymentMethodType["PAYPAL"] = "paypal";
})(PaymentMethodType || (exports.PaymentMethodType = PaymentMethodType = {}));
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING"] = "pending";
    PaymentStatus["PROCESSING"] = "processing";
    PaymentStatus["SUCCEEDED"] = "succeeded";
    PaymentStatus["FAILED"] = "failed";
    PaymentStatus["CANCELED"] = "canceled";
    PaymentStatus["REFUNDED"] = "refunded";
    PaymentStatus["PARTIALLY_REFUNDED"] = "partially_refunded";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
var RefundReason;
(function (RefundReason) {
    RefundReason["DUPLICATE"] = "duplicate";
    RefundReason["FRAUDULENT"] = "fraudulent";
    RefundReason["REQUESTED_BY_CUSTOMER"] = "requested_by_customer";
    RefundReason["EXPIRED_UNCAPTURED_CHARGE"] = "expired_uncaptured_charge";
})(RefundReason || (exports.RefundReason = RefundReason = {}));
// Webhook Event Types
var WebhookEventType;
(function (WebhookEventType) {
    WebhookEventType["PAYMENT_INTENT_SUCCEEDED"] = "payment_intent.succeeded";
    WebhookEventType["PAYMENT_INTENT_PAYMENT_FAILED"] = "payment_intent.payment_failed";
    WebhookEventType["PAYMENT_INTENT_CANCELED"] = "payment_intent.canceled";
    WebhookEventType["PAYMENT_METHOD_ATTACHED"] = "payment_method.attached";
    WebhookEventType["PAYMENT_METHOD_DETACHED"] = "payment_method.detached";
    WebhookEventType["CHARGE_SUCCEEDED"] = "charge.succeeded";
    WebhookEventType["CHARGE_FAILED"] = "charge.failed";
    WebhookEventType["CHARGE_REFUNDED"] = "charge.refunded";
})(WebhookEventType || (exports.WebhookEventType = WebhookEventType = {}));
//# sourceMappingURL=payment.js.map