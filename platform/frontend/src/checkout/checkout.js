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

import { apiService }        from '../core/api.js';
import { cartManager }       from './cart.js';
import { authService }       from '../account/auth.js';
import { CONFIG }            from '../core/config.js';
import { ERROR_MESSAGES }    from '../core/constants.js';

class CheckoutManager {
    constructor() {
        this._inProgress = false;
        this._orderId    = null;
        this._stripe     = null;   // Stripe.js instance, loaded lazily
    }

    // ─── Stripe.js ────────────────────────────────────────────────────────

    /**
     * Lazily initialise Stripe.js from the CDN script already loaded in index.html.
     * Throws if the publishable key is not configured.
     */
    _getStripe() {
        if (this._stripe) return this._stripe;

        if (typeof Stripe === 'undefined') {
            throw new Error('Stripe.js not loaded. Add <script src="https://js.stripe.com/v3/"></script> to index.html.');
        }
        if (!CONFIG.stripe.publishableKey) {
            throw new Error('STRIPE_PUBLISHABLE_KEY not configured.');
        }

        this._stripe = Stripe(CONFIG.stripe.publishableKey);  // eslint-disable-line no-undef
        return this._stripe;
    }

    // ─── Validation ───────────────────────────────────────────────────────

    async validate() {
        const errors = [];

        if (cartManager.isEmpty()) errors.push('Cart is empty');

        const cartValidation = cartManager.validate?.() || { isValid: true, errors: [] };
        if (!cartValidation.isValid) errors.push(...cartValidation.errors);

        const isAuth = await authService.isAuthenticated();
        if (!isAuth) errors.push(ERROR_MESSAGES.AUTH_REQUIRED || 'Please login to continue.');

        if (cartManager.getTotal() <= 0) errors.push('Invalid cart total');

        return { isValid: errors.length === 0, errors };
    }

    // ─── Create Payment Intent ─────────────────────────────────────────────

    /**
     * Step 1: Create a PaymentIntent on the server.
     * Cart items are converted to the { productId, name, quantity, priceInCents }
     * format the Lambda expects. Prices stored in the cart as euros are
     * multiplied by 100 — if already in cents they are used as-is.
     */
    async _createIntent(customerEmail) {
        const cart = cartManager.getCart();

        const items = cart.map(item => ({
            productId:    item.productId,
            name:         item.productName || item.name || 'Product',
            quantity:     item.quantity,
            // Support both priceInCents (preferred) and price (euros, legacy)
            priceInCents: item.priceInCents ?? Math.round((item.price || 0) * 100),
        }));

        return apiService.createPaymentIntent(items, customerEmail);
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
        if (this._inProgress) throw new Error('Checkout already in progress');

        const validation = await this.validate();
        if (!validation.isValid) throw new Error(validation.errors.join('\n'));

        this._inProgress = true;

        try {
            const user          = await authService.getCurrentUser();
            const customerEmail = user?.attributes?.email || user?.username || '';

            // Step 1 — create PaymentIntent
            const { clientSecret, orderId } = await this._createIntent(customerEmail);
            this._orderId = orderId;

            // Step 2 — confirm payment with Stripe.js on the client
            const stripe = this._getStripe();
            const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
                payment_method: { card: cardElement },
            });

            if (error) {
                // Stripe returns user-friendly error messages — safe to surface
                throw new Error(error.message);
            }

            if (paymentIntent.status !== 'succeeded') {
                throw new Error(`Payment status: ${paymentIntent.status}`);
            }

            // Step 3 — confirm order on the server
            const result = await apiService.confirmOrder(orderId, paymentIntent.id);

            if (!result.success) throw new Error('Order confirmation failed');

            // Step 4 — clear cart
            cartManager.clearCart();

            return { success: true, orderId };

        } finally {
            this._inProgress = false;
        }
    }

    // ─── Utilities ────────────────────────────────────────────────────────

    isInProgress()   { return this._inProgress; }
    getCurrentOrder(){ return this._orderId; }

    getCheckoutSummary() {
        const cart     = cartManager.getCart();
        const subtotal = cartManager.getTotal();
        return {
            items:    cart,
            count:    cartManager.getItemCount?.() || cart.length,
            subtotal,
            tax:      0,
            shipping: 0,
            total:    subtotal,
            currency: 'EUR',
        };
    }
}

export const checkoutManager = new CheckoutManager();
export default checkoutManager;
