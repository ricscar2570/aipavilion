/**
 * AI Pavilion - Checkout
 *
 * Orchestrates the full purchase flow:
 *  1. Validate cart + auth
 *  2. Call /checkout/create-intent  → get clientSecret + orderId
 *  3. Use Stripe.js to confirm payment on the client
 *  4. Call /checkout/confirm-order  → mark order paid
 *  5. Clear cart + redirect to confirmation
 */

import { apiService } from "../core/api.js";
import { cartManager } from "./cart.js";
import { authService } from "../account/auth.js";
import { CONFIG } from "../core/config.js";
import { ERROR_MESSAGES } from "../core/constants.js";
import { loadStripeJs } from "../core/external.js";

class CheckoutManager {
    constructor() {
        this._inProgress = false;
        this._orderId = null;
        this._stripe = null; // Stripe.js instance, loaded lazily
        this._checkoutRequestId = null;
        this._checkoutFingerprint = null;
    }

    // ─── Stripe.js ────────────────────────────────────────────────────────

    /**
     * Lazily initialise Stripe.js from the CDN script already loaded in index.html.
     * Throws if the publishable key is not configured.
     */
    async _getStripe() {
        if (this._stripe) {
            return this._stripe;
        }
        if (!CONFIG.stripe.publishableKey) {
            throw new Error("STRIPE_PUBLISHABLE_KEY not configured.");
        }
        const StripeFactory = await loadStripeJs();
        this._stripe = StripeFactory(CONFIG.stripe.publishableKey);
        return this._stripe;
    }

    // ─── Validation ───────────────────────────────────────────────────────

    async validate() {
        const errors = [];

        if (cartManager.isEmpty()) {
            errors.push("Cart is empty");
        }

        const cartValidation = cartManager.validate?.() || {
            isValid: true,
            errors: [],
        };
        if (!cartValidation.isValid) {
            errors.push(...cartValidation.errors);
        }

        const isAuth = await authService.isAuthenticated();
        if (!isAuth) {
            errors.push(
                ERROR_MESSAGES.AUTH_REQUIRED || "Please login to continue.",
            );
        }

        if (cartManager.getTotal() <= 0) {
            errors.push("Invalid cart total");
        }

        return { isValid: errors.length === 0, errors };
    }

    // ─── Create Payment Intent ─────────────────────────────────────────────

    /**
     * Step 1: Create a PaymentIntent on the server.
     * Cart items are reduced to identifiers and quantity. The backend resolves
     * product names and prices from the authoritative catalogue.
     */
    async _createIntent(customerEmail) {
        const cart = cartManager.getCart();
        const items = cart.map((item) => ({
            standId: item.metadata?.standId,
            productId: item.productId,
            quantity: item.quantity,
        }));
        const fingerprint = JSON.stringify(items);
        if (
            !this._checkoutRequestId ||
            this._checkoutFingerprint !== fingerprint
        ) {
            this._checkoutRequestId = globalThis.crypto?.randomUUID
                ? globalThis.crypto.randomUUID()
                : `checkout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            this._checkoutFingerprint = fingerprint;
        }
        return apiService.createPaymentIntent(
            items,
            customerEmail,
            this._checkoutRequestId,
        );
    }

    // ─── Full Checkout Flow ────────────────────────────────────────────────

    /**
     * Run the complete checkout:
     *  - validate → create intent → confirm with Stripe.js → confirm order
     *
     * @param {HTMLElement} cardElement  Stripe Elements card element
     * @returns {Promise<{ success: boolean, orderId: string }>}
     */
    async processCheckout(cardElement) {
        if (this._inProgress) {
            throw new Error("Checkout already in progress");
        }

        const validation = await this.validate();
        if (!validation.isValid) {
            throw new Error(validation.errors.join("\n"));
        }

        this._inProgress = true;

        try {
            const user = await authService.getCurrentUser();
            const customerEmail =
                user?.attributes?.email || user?.username || "";

            // Step 1 — create PaymentIntent or a dev-only simulated intent
            const {
                clientSecret,
                orderId,
                paymentIntentId,
                paymentMode = "stripe",
            } = await this._createIntent(customerEmail);
            this._orderId = orderId;

            let confirmedPaymentIntentId = paymentIntentId;
            if (paymentMode === "stripe") {
                // Step 2 — confirm payment with Stripe.js on the client
                const stripe = await this._getStripe();
                const { error, paymentIntent } =
                    await stripe.confirmCardPayment(clientSecret, {
                        payment_method: { card: cardElement },
                    });

                if (error) {
                    // Stripe returns user-friendly error messages — safe to surface
                    throw new Error(error.message);
                }

                if (paymentIntent.status !== "succeeded") {
                    throw new Error(`Payment status: ${paymentIntent.status}`);
                }
                confirmedPaymentIntentId = paymentIntent.id;
            }

            if (!confirmedPaymentIntentId) {
                throw new Error("Payment intent identifier missing");
            }

            // Step 3 — confirm order on the server
            const result = await apiService.confirmOrder(
                orderId,
                confirmedPaymentIntentId,
            );

            if (!result.success) {
                throw new Error("Order confirmation failed");
            }

            // Step 4 — clear cart
            cartManager.clearCart();
            this._checkoutRequestId = null;
            this._checkoutFingerprint = null;

            return { success: true, orderId };
        } finally {
            this._inProgress = false;
        }
    }

    // ─── Utilities ────────────────────────────────────────────────────────

    isInProgress() {
        return this._inProgress;
    }
    getCurrentOrder() {
        return this._orderId;
    }

    getCheckoutSummary() {
        const cart = cartManager.getCart();
        const subtotal = cartManager.getTotal();
        return {
            items: cart,
            count: cartManager.getItemCount?.() || cart.length,
            subtotal,
            tax: 0,
            shipping: 0,
            total: subtotal,
            currency: "EUR",
        };
    }
}

export const checkoutManager = new CheckoutManager();
export default checkoutManager;
