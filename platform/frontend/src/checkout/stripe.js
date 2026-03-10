/**
 * AI Pavilion - Stripe Service
 *
 * Thin wrapper around Stripe.js (loaded from CDN in index.html).
 * Provides Elements creation for the checkout form.
 *
 * Note: The main payment flow (confirmCardPayment) lives in checkout.module.js
 * so that the cart/order logic stays together.
 *
 * Prerequisites: index.html must include:
 *   <script src="https://js.stripe.com/v3/"></script>
 */

import { CONFIG } from '../core/config.js';

class StripeService {
    constructor() {
        this._stripe   = null;
        this._elements = null;
    }

    /** Lazily initialise Stripe.js. */
    _getInstance() {
        if (this._stripe) return this._stripe;
        if (typeof Stripe === 'undefined') throw new Error('Stripe.js not loaded.');
        if (!CONFIG.stripe.publishableKey)  throw new Error('STRIPE_PUBLISHABLE_KEY not configured.');
        this._stripe = Stripe(CONFIG.stripe.publishableKey); // eslint-disable-line no-undef
        return this._stripe;
    }

    /**
     * Create a Stripe Elements instance and mount a card element into a DOM container.
     *
     * @param {string|HTMLElement} container  CSS selector or DOM element
     * @param {object} [elementOptions]  Stripe Elements appearance options
     * @returns {{ elements: StripeElements, cardElement: StripeCardElement }}
     */
    createCardElement(container, elementOptions = {}) {
        const stripe = this._getInstance();

        if (!this._elements) {
            this._elements = stripe.elements();
        }

        const cardElement = this._elements.create('card', {
            style: {
                base: {
                    color:           '#1f2937',
                    fontFamily:      'Inter, sans-serif',
                    fontSize:        '16px',
                    '::placeholder': { color: '#9ca3af' },
                },
                invalid: { color: '#ef4444' },
            },
            ...elementOptions,
        });

        const el = typeof container === 'string' ? document.querySelector(container) : container;
        if (!el) throw new Error(`Stripe card container not found: ${container}`);

        cardElement.mount(el);
        return { elements: this._elements, cardElement };
    }

    /** Destroy mounted elements (call on page navigation). */
    destroy() {
        this._elements = null;
    }
}

export const stripeService = new StripeService();
export default stripeService;
