/**
 * AI Pavilion - Runtime Configuration
 *
 * Values are injected at build time by Vite from environment variables (see vite.config.js).
 * In local development without a build step, falls back to safe defaults.
 *
 * Import as:  import { CONFIG } from './config.js';
 * (legacy alias `config` also exported for backwards compatibility)
 */

const injected = (typeof __APP_CONFIG__ !== 'undefined') ? __APP_CONFIG__ : {};

export const CONFIG = {
    api: {
        endpoint:      injected.apiEndpoint      || '',
        timeout:       10000,
        retryAttempts: 3,
        retryDelay:    1000,
        headers:       { 'Content-Type': 'application/json' },
    },

    aws: {
        region: injected.cognitoRegion || 'us-east-1',
        cognito: {
            userPoolId: injected.cognitoUserPoolId || '',
            clientId:   injected.cognitoClientId   || '',
            enabled:    !!(injected.cognitoUserPoolId && injected.cognitoClientId),
        },
    },

    stripe: {
        publishableKey: injected.stripePublishableKey || '',
        enabled:        !!injected.stripePublishableKey,
    },

    features: {
        ar:        injected.featureAr        || false,
        tour360:   injected.feature360Tours  || false,
        analytics: injected.featureAnalytics || false,
        reviews:   injected.featureReviews   || false,
        wishlist:  injected.featureWishlist  !== false,
    },

    ar: {
        enabled:   injected.featureAr || false,
        modelsCDN: injected.cloudFrontDomain ? `https://${injected.cloudFrontDomain}/models/` : '',
    },

    tours: {
        enabled:   injected.feature360Tours || false,
        imagesCDN: injected.cloudFrontDomain ? `https://${injected.cloudFrontDomain}/360/` : '',
    },

    cart: {
        storageKey:          'ai_pavilion_cart',
        maxItems:            50,
        maxQuantityPerItem:  99,
        syncWithBackend:     false,
        syncInterval:        30000,
    },

    env: injected.nodeEnv || 'development',

    // Convenience shorthand kept for the legacy app.js usage
    apiUrl: injected.apiEndpoint || '',
};

// Legacy alias — app.js imports `{ config }` (lowercase).
// All other modules use CONFIG (uppercase). Both point to the same object.
export const config = CONFIG;
