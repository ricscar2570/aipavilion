/**
 * API client with auth injection, bounded timeouts and conservative retries.
 * Mutating requests are never retried unless the caller supplies an explicit
 * idempotency key and opts in with retryUnsafe=true.
 */

import { CONFIG } from "./config.js";
import { API_ENDPOINTS } from "./constants.js";
import { authService } from "../account/auth.js";

const RETRYABLE_STATUS = new Set([408, 425, 429, 502, 503, 504]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomRequestId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

class ApiService {
    constructor() {
        this.baseUrl = CONFIG.api.endpoint;
        this.timeout = CONFIG.api.timeout;
        this.retryAttempts = CONFIG.api.retryAttempts;
        this.retryDelay = CONFIG.api.retryDelay;
        this.requestInterceptors = [];
        this.responseInterceptors = [];
    }

    addRequestInterceptor(fn) {
        this.requestInterceptors.push(fn);
    }

    addResponseInterceptor(fn) {
        this.responseInterceptors.push(fn);
    }

    async _applyRequestInterceptors(config) {
        let result = config;
        for (const fn of this.requestInterceptors) {
            result = await fn(result);
        }
        return result;
    }

    async _applyResponseInterceptors(response) {
        let result = response;
        for (const fn of this.responseInterceptors) {
            result = await fn(result);
        }
        return result;
    }

    async request(endpoint, options = {}) {
        const url = endpoint.startsWith("http")
            ? endpoint
            : `${this.baseUrl}${endpoint}`;
        let config = {
            ...options,
            headers: {
                ...CONFIG.api.headers,
                "X-Request-Id": options.requestId || randomRequestId(),
                ...options.headers,
            },
        };
        delete config.requestId;
        delete config.retryUnsafe;
        config = await this._applyRequestInterceptors(config);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);
        try {
            const raw = await fetch(url, {
                ...config,
                signal: controller.signal,
            });
            const response = await this._applyResponseInterceptors(raw);
            if (!response.ok) {
                let details = null;
                try {
                    details = await response.clone().json();
                } catch {
                    // Non-JSON error responses are represented by status only.
                }
                throw new ApiError(
                    details?.message || `HTTP ${response.status}`,
                    response.status,
                    endpoint,
                    details?.error,
                );
            }
            if (response.status === 204) {
                return null;
            }
            return response.json();
        } catch (error) {
            if (error.name === "AbortError") {
                throw new ApiError("Request timeout", 408, endpoint, "TIMEOUT");
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    _canRetry(options, error) {
        const method = String(options.method || "GET").toUpperCase();
        const safe = SAFE_METHODS.has(method);
        const explicitlyIdempotent =
            options.retryUnsafe === true &&
            Boolean(options.headers?.["Idempotency-Key"]);
        if (!safe && !explicitlyIdempotent) {
            return false;
        }
        if (!(error instanceof ApiError)) {
            return true; // network error
        }
        return RETRYABLE_STATUS.has(error.status);
    }

    async _withRetry(endpoint, options) {
        const attempts = Math.max(1, this.retryAttempts);
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                return await this.request(endpoint, options);
            } catch (error) {
                if (attempt === attempts || !this._canRetry(options, error)) {
                    throw error;
                }
                await sleep(this.retryDelay * attempt);
            }
        }
        throw new ApiError("Request failed", 0, endpoint, "UNKNOWN");
    }

    get(endpoint, params = {}, options = {}) {
        const qs = new URLSearchParams(params).toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
        return this._withRetry(url, { method: "GET", ...options });
    }

    post(endpoint, data = {}, options = {}) {
        return this._withRetry(endpoint, {
            method: "POST",
            body: JSON.stringify(data),
            ...options,
        });
    }

    put(endpoint, data = {}, options = {}) {
        return this._withRetry(endpoint, {
            method: "PUT",
            body: JSON.stringify(data),
            ...options,
        });
    }

    patch(endpoint, data = {}, options = {}) {
        return this._withRetry(endpoint, {
            method: "PATCH",
            body: JSON.stringify(data),
            ...options,
        });
    }

    delete(endpoint, options = {}) {
        return this._withRetry(endpoint, { method: "DELETE", ...options });
    }

    getStandDetails(standId) {
        return this.get(API_ENDPOINTS.STANDS.DETAIL.replace(":id", standId));
    }

    searchStands(query, filters = {}) {
        return this.get(API_ENDPOINTS.STANDS.SEARCH, {
            q: query,
            ...filters,
        }).then((data) => data.stands || []);
    }

    createPaymentIntent(items, customerEmail, checkoutRequestId) {
        const requestId = checkoutRequestId || randomRequestId();
        const safeItems = items.map(({ standId, productId, quantity }) => ({
            standId,
            productId,
            quantity,
        }));
        return this.post(
            API_ENDPOINTS.CHECKOUT.CREATE_INTENT,
            { items: safeItems, customerEmail, checkoutRequestId: requestId },
            {
                retryUnsafe: true,
                headers: { "Idempotency-Key": requestId },
            },
        );
    }

    confirmOrder(orderId, paymentIntentId) {
        return this.post(API_ENDPOINTS.CHECKOUT.CONFIRM_ORDER, {
            orderId,
            paymentIntentId,
        });
    }

    getOrder(orderId) {
        return this.get(`${API_ENDPOINTS.CHECKOUT.GET_ORDER}/${orderId}`);
    }

    getUserOrders(params = {}) {
        return this.get(API_ENDPOINTS.USER.ORDERS, params);
    }

    getUserStats() {
        return this.get(API_ENDPOINTS.USER.STATS);
    }

    getSavedStands(params = {}) {
        return this.get(API_ENDPOINTS.USER.SAVED_STANDS, params);
    }

    saveStand(standId) {
        return this.post(API_ENDPOINTS.USER.SAVED_STANDS, { standId });
    }

    deleteSavedStand(standId) {
        return this.delete(`${API_ENDPOINTS.USER.SAVED_STANDS}/${standId}`);
    }
}

export class ApiError extends Error {
    constructor(message, status, endpoint, code = null) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.endpoint = endpoint;
        this.code = code;
    }

    isAuthError() {
        return this.status === 401 || this.status === 403;
    }

    isClientError() {
        return this.status >= 400 && this.status < 500;
    }

    isServerError() {
        return this.status >= 500;
    }
}

export const apiService = new ApiService();

// API Gateway Cognito authorizers validate access tokens. ID tokens remain for
// client-side identity display only and are not sent to application APIs.
apiService.addRequestInterceptor(async (config) => {
    const token = await authService.getAccessToken().catch(() => null);
    if (token) {
        config.headers = {
            ...config.headers,
            Authorization: `Bearer ${token}`,
        };
    }
    return config;
});

export default apiService;
