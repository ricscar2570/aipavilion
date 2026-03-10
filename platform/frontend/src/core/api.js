/**
 * API client — thin wrapper around fetch with timeout, retry, and auth injection.
 *
 * Only methods that have a caller in the codebase are defined here.
 * If you need a new endpoint, add a method; don't pre-generate them.
 */

import { CONFIG } from './config.js';
import { API_ENDPOINTS } from './constants.js';
import { retry } from './helpers.js';

class ApiService {
    constructor() {
        this.baseUrl          = CONFIG.api.endpoint;
        this.timeout          = CONFIG.api.timeout;
        this.retryAttempts    = CONFIG.api.retryAttempts;
        this.retryDelay       = CONFIG.api.retryDelay;
        this.requestInterceptors  = [];
        this.responseInterceptors = [];
    }

    addRequestInterceptor(fn)  { this.requestInterceptors.push(fn); }
    addResponseInterceptor(fn) { this.responseInterceptors.push(fn); }

    async _applyRequestInterceptors(config) {
        let c = config;
        for (const fn of this.requestInterceptors) c = await fn(c);
        return c;
    }

    async _applyResponseInterceptors(response) {
        let r = response;
        for (const fn of this.responseInterceptors) r = await fn(r);
        return r;
    }

    async request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

        let config = {
            ...options,
            headers: { ...CONFIG.api.headers, ...options.headers },
        };

        config = await this._applyRequestInterceptors(config);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);

        try {
            const raw = await fetch(url, { ...config, signal: controller.signal });
            clearTimeout(timer);

            const response = await this._applyResponseInterceptors(raw);
            if (!response.ok) {
                throw new ApiError(`HTTP ${response.status}`, response.status, endpoint);
            }
            return response.json();

        } catch (err) {
            clearTimeout(timer);
            if (err.name === 'AbortError') throw new ApiError('Request timeout', 408, endpoint);
            throw err;
        }
    }

    _withRetry(endpoint, options) {
        return retry(() => this.request(endpoint, options), this.retryAttempts, this.retryDelay);
    }

    // ─── HTTP verbs ───────────────────────────────────────────────────────────

    get(endpoint, params = {}, options = {}) {
        const qs  = new URLSearchParams(params).toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
        return this._withRetry(url, { method: 'GET', ...options });
    }

    post(endpoint, data = {}, options = {}) {
        return this._withRetry(endpoint, { method: 'POST', body: JSON.stringify(data), ...options });
    }

    put(endpoint, data = {}, options = {}) {
        return this._withRetry(endpoint, { method: 'PUT', body: JSON.stringify(data), ...options });
    }

    delete(endpoint, options = {}) {
        return this._withRetry(endpoint, { method: 'DELETE', ...options });
    }

    // ─── Domain methods ───────────────────────────────────────────────────────

    getStandDetails(standId) {
        return this.get(API_ENDPOINTS.STANDS.DETAIL.replace(':id', standId));
    }

    searchStands(query, filters = {}) {
        return this.get(API_ENDPOINTS.STANDS.SEARCH, { q: query, ...filters })
            .then(data => data.stands || []);
    }

    /**
     * Create a Stripe PaymentIntent server-side.
     * The server recomputes the total — we never trust the client amount.
     * @param {Array<{ productId, name, quantity, priceInCents }>} items
     * @param {string} customerEmail
     */
    createPaymentIntent(items, customerEmail) {
        return this.post(API_ENDPOINTS.CHECKOUT.CREATE_INTENT, { items, customerEmail });
    }

    /**
     * Confirm order after Stripe.js has confirmed payment on the client.
     * Must be called before showing the success page.
     */
    confirmOrder(orderId, paymentIntentId) {
        return this.post(API_ENDPOINTS.CHECKOUT.CONFIRM_ORDER, { orderId, paymentIntentId });
    }

    getOrder(orderId) {
        return this.get(`${API_ENDPOINTS.CHECKOUT.GET_ORDER}/${orderId}`);
    }

    getUserOrders(params = {}) {
        return this.get(API_ENDPOINTS.USER.ORDERS, params)
            .then(data => data.orders || []);
    }

    getUserStats() {
        return this.get(API_ENDPOINTS.USER.STATS);
    }

    getSavedStands() {
        return this.get(API_ENDPOINTS.USER.SAVED_STANDS)
            .then(data => data.stands || []);
    }

    saveStand(standId, name, imageUrl) {
        return this.post(API_ENDPOINTS.USER.SAVED_STANDS, { standId, name, imageUrl });
    }

    deleteSavedStand(standId) {
        return this.delete(`${API_ENDPOINTS.USER.SAVED_STANDS}/${standId}`);
    }

}

export class ApiError extends Error {
    constructor(message, status, endpoint) {
        super(message);
        this.name     = 'ApiError';
        this.status   = status;
        this.endpoint = endpoint;
    }

    isAuthError()   { return this.status === 401 || this.status === 403; }
    isClientError() { return this.status >= 400 && this.status < 500; }
    isServerError() { return this.status >= 500; }
}

export const apiService = new ApiService();

// Attach the Cognito id_token to every request when the user is signed in.
// The token key matches what auth.js writes after signIn.
apiService.addRequestInterceptor(async (config) => {
    const token = localStorage.getItem('ai_pavilion_id_token');
    if (token) {
        config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
    }
    return config;
});

export default apiService;
