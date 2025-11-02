/**
 * AI Pavilion - API Service COMPLETE
 */

import { CONFIG } from '../config/config.js';
import { HTTP_STATUS, API_ENDPOINTS } from '../utils/constants.js';
import { retry, sleep } from '../utils/helpers.js';

class ApiService {
    constructor() {
        this.baseUrl = CONFIG.api.endpoint;
        this.timeout = CONFIG.api.timeout;
        this.retryAttempts = CONFIG.api.retryAttempts;
        this.retryDelay = CONFIG.api.retryDelay;
        this.requestInterceptors = [];
        this.responseInterceptors = [];
    }

    // ==================== INTERCEPTORS ====================

    addRequestInterceptor(fn) {
        this.requestInterceptors.push(fn);
    }

    addResponseInterceptor(fn) {
        this.responseInterceptors.push(fn);
    }

    async applyRequestInterceptors(config) {
        let finalConfig = config;
        for (const interceptor of this.requestInterceptors) {
            finalConfig = await interceptor(finalConfig);
        }
        return finalConfig;
    }

    async applyResponseInterceptors(response) {
        let finalResponse = response;
        for (const interceptor of this.responseInterceptors) {
            finalResponse = await interceptor(finalResponse);
        }
        return finalResponse;
    }

    // ==================== CORE REQUEST ====================

    async request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
        
        let config = {
            ...options,
            headers: {
                ...CONFIG.api.headers,
                ...options.headers
            }
        };

        // Apply request interceptors
        config = await this.applyRequestInterceptors(config);

        // Add abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                ...config,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // Apply response interceptors
            const interceptedResponse = await this.applyResponseInterceptors(response);

            if (!interceptedResponse.ok) {
                throw new ApiError(
                    `HTTP ${interceptedResponse.status}: ${interceptedResponse.statusText}`,
                    interceptedResponse.status,
                    endpoint
                );
            }

            const data = await interceptedResponse.json();
            return data;

        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new ApiError('Request timeout', 408, endpoint);
            }

            console.error(`API request failed for ${endpoint}:`, error);
            throw error;
        }
    }

    async requestWithRetry(endpoint, options = {}) {
        return retry(
            () => this.request(endpoint, options),
            this.retryAttempts,
            this.retryDelay
        );
    }

    // ==================== HTTP METHODS ====================

    async get(endpoint, params = {}, options = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.requestWithRetry(url, {
            method: 'GET',
            ...options
        });
    }

    async post(endpoint, data = {}, options = {}) {
        return this.requestWithRetry(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
            ...options
        });
    }

    async put(endpoint, data = {}, options = {}) {
        return this.requestWithRetry(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
            ...options
        });
    }

    async patch(endpoint, data = {}, options = {}) {
        return this.requestWithRetry(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(data),
            ...options
        });
    }

    async delete(endpoint, options = {}) {
        return this.requestWithRetry(endpoint, {
            method: 'DELETE',
            ...options
        });
    }

    // ==================== STANDS ENDPOINTS ====================

    async getSponsoredStands(params = {}) {
        const data = await this.get(API_ENDPOINTS.STANDS.SPONSORED, params);
        const sponsoredStands = (data.stands || []).filter(s => s.is_sponsored === true);
        return sponsoredStands;
    }

    async getStandDetails(standId) {
        const endpoint = API_ENDPOINTS.STANDS.DETAIL.replace(':id', standId);
        return this.get(endpoint);
    }

    async searchStands(query, filters = {}) {
        const params = { q: query, ...filters };
        const data = await this.get(API_ENDPOINTS.STANDS.SEARCH, params);
        return data.stands || [];
    }

    async getStandsByCategory(category, params = {}) {
        const data = await this.get(API_ENDPOINTS.STANDS.LIST, {
            category,
            ...params
        });
        return data.stands || [];
    }

    async getStandCategories() {
        const data = await this.get(API_ENDPOINTS.STANDS.CATEGORIES);
        return data.categories || [];
    }

    // ==================== RECOMMENDATIONS ENDPOINTS ====================

    async getRecommendations(userId, params = {}) {
        const data = await this.get(API_ENDPOINTS.RECOMMENDATIONS.GET, {
            user_id: userId,
            ...params
        });
        return data.recommendations || [];
    }

    async trackInteraction(userId, standId, interactionType) {
        return this.post(API_ENDPOINTS.RECOMMENDATIONS.TRACK, {
            user_id: userId,
            stand_id: standId,
            interaction_type: interactionType,
            timestamp: Date.now()
        });
    }

    // ==================== TRANSLATION ENDPOINTS ====================

    async translateText(text, targetLanguage, sourceLanguage = 'auto') {
        const data = await this.post(API_ENDPOINTS.TRANSLATE.TEXT, {
            text,
            target_language: targetLanguage,
            source_language: sourceLanguage
        });
        return data.translated_text;
    }

    async translateBatch(texts, targetLanguage, sourceLanguage = 'auto') {
        const data = await this.post(API_ENDPOINTS.TRANSLATE.BATCH, {
            texts,
            target_language: targetLanguage,
            source_language: sourceLanguage
        });
        return data.translations || [];
    }

    // ==================== CHECKOUT ENDPOINTS ====================

    async createCheckoutSession(items, metadata = {}) {
        return this.post(API_ENDPOINTS.CHECKOUT.CREATE_SESSION, {
            items,
            metadata,
            success_url: `${window.location.origin}/checkout/success`,
            cancel_url: `${window.location.origin}/checkout/cancel`
        });
    }

    async confirmPayment(sessionId) {
        return this.post(API_ENDPOINTS.CHECKOUT.CONFIRM, {
            session_id: sessionId
        });
    }

    // ==================== USER ENDPOINTS ====================

    async getUserProfile() {
        return this.get(API_ENDPOINTS.USER.PROFILE);
    }

    async updateUserProfile(data) {
        return this.put(API_ENDPOINTS.USER.PROFILE, data);
    }

    async getUserOrders(params = {}) {
        const data = await this.get(API_ENDPOINTS.USER.ORDERS, params);
        return data.orders || [];
    }

    async getUserPreferences() {
        return this.get(API_ENDPOINTS.USER.PREFERENCES);
    }

    async updateUserPreferences(preferences) {
        return this.put(API_ENDPOINTS.USER.PREFERENCES, preferences);
    }

    // ==================== ANALYTICS ENDPOINTS ====================

    async trackEvent(eventName, eventData = {}) {
        if (!CONFIG.analytics.enabled) return;

        return this.post(API_ENDPOINTS.ANALYTICS.TRACK_EVENT, {
            event_name: eventName,
            event_data: eventData,
            timestamp: Date.now(),
            user_agent: navigator.userAgent,
            url: window.location.href
        }).catch(err => {
            // Don't fail the app if analytics fail
            console.warn('Analytics tracking failed:', err);
        });
    }

    async trackPageView(pageName, pageData = {}) {
        if (!CONFIG.analytics.enabled) return;

        return this.post(API_ENDPOINTS.ANALYTICS.TRACK_PAGE, {
            page_name: pageName,
            page_data: pageData,
            timestamp: Date.now(),
            referrer: document.referrer,
            url: window.location.href
        }).catch(err => {
            console.warn('Page tracking failed:', err);
        });
    }

    // ==================== BATCH REQUESTS ====================

    async batchRequest(requests) {
        return Promise.allSettled(
            requests.map(({ endpoint, method = 'GET', data, params }) => {
                switch (method.toUpperCase()) {
                    case 'GET': return this.get(endpoint, params);
                    case 'POST': return this.post(endpoint, data);
                    case 'PUT': return this.put(endpoint, data);
                    case 'DELETE': return this.delete(endpoint);
                    default: throw new Error(`Unsupported method: ${method}`);
                }
            })
        );
    }

    // ==================== UPLOAD ====================

    async uploadFile(file, endpoint, onProgress = null) {
        const formData = new FormData();
        formData.append('file', file);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            if (onProgress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100;
                        onProgress(percentComplete);
                    }
                });
            }

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new ApiError(`Upload failed: ${xhr.statusText}`, xhr.status, endpoint));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new ApiError('Upload failed', 0, endpoint));
            });

            xhr.open('POST', `${this.baseUrl}${endpoint}`);
            xhr.send(formData);
        });
    }
}

// ==================== CUSTOM ERROR CLASS ====================

export class ApiError extends Error {
    constructor(message, status, endpoint) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.endpoint = endpoint;
    }

    isNetworkError() {
        return this.status === 0;
    }

    isClientError() {
        return this.status >= 400 && this.status < 500;
    }

    isServerError() {
        return this.status >= 500;
    }

    isAuthError() {
        return this.status === 401 || this.status === 403;
    }
}

// ==================== SINGLETON INSTANCE ====================

export const apiService = new ApiService();

// Add default auth interceptor
apiService.addRequestInterceptor(async (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
        config.headers = {
            ...config.headers,
            'Authorization': `Bearer ${token}`
        };
    }
    return config;
});

// Add default error logging interceptor
apiService.addResponseInterceptor(async (response) => {
    if (!response.ok && CONFIG.errors.logToConsole) {
        console.error(`API Error: ${response.status} ${response.statusText}`, {
            url: response.url,
            status: response.status
        });
    }
    return response;
});

export default apiService;
