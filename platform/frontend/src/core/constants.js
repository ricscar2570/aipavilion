/**
 * Application-wide constants.
 */

export const EVENT_TYPES = {
    CART_UPDATED:       'cart:updated',
    CART_ITEM_ADDED:    'cart:item:added',
    CART_ITEM_REMOVED:  'cart:item:removed',
    CART_CLEARED:       'cart:cleared',
    USER_LOGGED_IN:     'user:logged:in',
    USER_LOGGED_OUT:    'user:logged:out',
    STAND_VIEWED:       'stand:viewed',
    SEARCH_PERFORMED:   'search:performed',
    CHECKOUT_STARTED:   'checkout:started',
    CHECKOUT_COMPLETED: 'checkout:completed',
};

export const TOAST_TYPES = {
    SUCCESS: 'success',
    ERROR:   'error',
    WARNING: 'warning',
    INFO:    'info',
};

export const ERROR_MESSAGES = {
    NETWORK_ERROR:   'Network error. Please check your connection.',
    AUTH_REQUIRED:   'Please log in to continue.',
    NOT_FOUND:       'The requested resource was not found.',
    SERVER_ERROR:    'Server error. Please try again later.',
    SESSION_EXPIRED: 'Your session has expired. Please log in again.',
    CART_FULL:       'Your cart is full. Please remove some items.',
    PAYMENT_FAILED:  'Payment failed. Please try again.',
};

export const API_ENDPOINTS = {
    STANDS: {
        LIST:   '/stands',
        DETAIL: '/stands/:id',
        SEARCH: '/stands/search',
    },
    CHECKOUT: {
        CREATE_INTENT: '/checkout/create-intent',
        CONFIRM_ORDER: '/checkout/confirm-order',
        GET_ORDER:     '/checkout/order',
        WEBHOOK:       '/checkout/webhook',
    },
    USER: {
        ORDERS:       '/user/orders',
        SAVED_STANDS: '/user/saved-stands',
        STATS:        '/user/stats',
    },
};
