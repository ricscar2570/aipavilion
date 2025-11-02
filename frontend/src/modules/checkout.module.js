import { stripeService } from '../services/stripe.service.js';
/**
 * AI Pavilion - Checkout Module
 */

import { apiService } from '../services/api.service.js';
import { cartManager } from './cart.module.js';
import { authService } from '../services/auth.service.js';
import { personalizeService } from '../services/personalize.service.js';
import { CONFIG } from '../config/config.js';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../utils/constants.js';

class CheckoutManager {
    constructor() {
        this.checkoutInProgress = false;
        this.currentSession = null;
    }

    // ==================== VALIDATION ====================

    async validateCheckout() {
        const errors = [];

        // Check if cart is empty
        if (cartManager.isEmpty()) {
            errors.push('Cart is empty');
        }

        // Validate cart items
        const cartValidation = cartManager.validate();
        if (!cartValidation.isValid) {
            errors.push(...cartValidation.errors);
        }

        // Check authentication
        const isAuthenticated = await authService.isAuthenticated();
        if (!isAuthenticated) {
            errors.push(ERROR_MESSAGES.AUTH_REQUIRED);
        }

        // Check total amount
        const total = cartManager.getTotal();
        if (total <= 0) {
            errors.push('Invalid cart total');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // ==================== CREATE CHECKOUT SESSION ====================

    async createCheckoutSession(metadata = {}) {
        if (this.checkoutInProgress) {
            throw new Error('Checkout already in progress');
        }

        try {
            this.checkoutInProgress = true;

            // Validate checkout
            const validation = await this.validateCheckout();
            if (!validation.isValid) {
                throw new Error(validation.errors.join(', '));
            }

            // Get cart items
            const cart = cartManager.getCart();
            
            // Get user info
            const user = await authService.getCurrentUser();

            // Prepare checkout data
            const checkoutData = {
                items: cart.map(item => ({
                    product_id: item.productId,
                    product_name: item.productName,
                    quantity: item.quantity,
                    price: item.price,
                    currency: CONFIG.stripe.currency
                })),
                customer: {
                    user_id: user?.username,
                    email: user?.attributes?.email
                },
                metadata: {
                    ...metadata,
                    cart_id: this.generateCartId(),
                    timestamp: Date.now()
                },
                success_url: `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${window.location.origin}/checkout/cancel`
            };

            // Create session via API
            const session = await apiService.createCheckoutSession(
                checkoutData.items,
                checkoutData
            );

            this.currentSession = session;

            // Track checkout started
            await personalizeService.trackEvent('checkout_started', {
                itemCount: cart.length,
                totalAmount: cartManager.getTotal()
            });

            return session;

        } catch (error) {
            console.error('Create checkout session error:', error);
            throw error;
        } finally {
            this.checkoutInProgress = false;
        }
    }

    // ==================== REDIRECT TO STRIPE ====================

    async redirectToStripe(sessionId) {
        if (!sessionId) {
            throw new Error('No session ID provided');
        }

        try {
            // In produzione, qui useresti Stripe.js:
            // const stripe = Stripe(CONFIG.stripe.publicKey);
            // await stripe.redirectToCheckout({ sessionId });

            console.log('Redirecting to Stripe with session:', sessionId);
            
            // Mock redirect
            await stripeService.redirectToCheckout(sessionId);
            // alert(`Would redirect to Stripe checkout with session: ${sessionId}`);

        } catch (error) {
            console.error('Stripe redirect error:', error);
            throw new Error(ERROR_MESSAGES.PAYMENT_FAILED);
        }
    }

    // ==================== PROCESS CHECKOUT ====================

    async processCheckout(metadata = {}) {
        try {
            // Create session
            const session = await this.createCheckoutSession(metadata);

            if (!session || !session.id) {
                throw new Error('Invalid checkout session');
            }

            // Redirect to payment
            await this.redirectToStripe(session.id);

            return session;

        } catch (error) {
            console.error('Process checkout error:', error);
            throw error;
        }
    }

    // ==================== CONFIRM PAYMENT ====================

    async confirmPayment(sessionId) {
        try {
            const result = await apiService.confirmPayment(sessionId);

            if (result.status === 'succeeded' || result.status === 'complete') {
                // Track purchase
                const cart = cartManager.getCart();
                await personalizeService.trackPurchase(cart, {
                    sessionId,
                    totalAmount: cartManager.getTotal()
                });

                // Clear cart
                cartManager.clearCart();

                return {
                    success: true,
                    order: result.order
                };
            }

            return {
                success: false,
                error: 'Payment not completed'
            };

        } catch (error) {
            console.error('Confirm payment error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ==================== CANCEL CHECKOUT ====================

    async cancelCheckout(sessionId) {
        try {
            // Track cancellation
            await personalizeService.trackEvent('checkout_cancelled', {
                sessionId
            });

            this.currentSession = null;

        } catch (error) {
            console.error('Cancel checkout error:', error);
        }
    }

    // ==================== UTILITIES ====================

    generateCartId() {
        return `cart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    getCurrentSession() {
        return this.currentSession;
    }

    isCheckoutInProgress() {
        return this.checkoutInProgress;
    }

    // ==================== CHECKOUT SUMMARY ====================

    getCheckoutSummary() {
        const cart = cartManager.getCart();
        const subtotal = cartManager.getTotal();
        const tax = 0; // Calculate based on location
        const shipping = 0; // Calculate based on items
        const total = subtotal + tax + shipping;

        return {
            items: cart,
            itemCount: cartManager.getItemCount(),
            subtotal,
            tax,
            shipping,
            total,
            currency: CONFIG.stripe.currency
        };
    }
}

// ==================== SINGLETON INSTANCE ====================

export const checkoutManager = new CheckoutManager();

export default checkoutManager;
