/**
 * AI Pavilion - Constants
 */

export const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
};

export const EVENT_TYPES = {
    CART_UPDATED: 'cart:updated',
    CART_ITEM_ADDED: 'cart:item:added',
    CART_ITEM_REMOVED: 'cart:item:removed',
    CART_CLEARED: 'cart:cleared',
    USER_LOGGED_IN: 'user:logged:in',
    USER_LOGGED_OUT: 'user:logged:out',
    STAND_VIEWED: 'stand:viewed',
    SEARCH_PERFORMED: 'search:performed',
    LANGUAGE_CHANGED: 'language:changed',
    CHECKOUT_STARTED: 'checkout:started',
    CHECKOUT_COMPLETED: 'checkout:completed',
    ERROR_OCCURRED: 'error:occurred'
};

export const INTERACTION_TYPES = {
    VIEW: 'view',
    CLICK: 'click',
    ADD_TO_CART: 'add_to_cart',
    PURCHASE: 'purchase',
    LIKE: 'like',
    SHARE: 'share',
    DOWNLOAD: 'download',
    CONTACT: 'contact'
};

export const STAND_CATEGORIES = {
    TECHNOLOGY: 'Technology',
    HEALTHCARE: 'Healthcare',
    FASHION: 'Fashion',
    FOOD: 'Food & Agriculture',
    SUSTAINABILITY: 'Sustainability',
    EDUCATION: 'Education',
    FINANCE: 'Finance',
    ENTERTAINMENT: 'Entertainment',
    AUTOMOTIVE: 'Automotive',
    RETAIL: 'Retail'
};

export const LANGUAGES = {
    EN: { code: 'en', name: 'English', flag: '🇬🇧' },
    IT: { code: 'it', name: 'Italiano', flag: '🇮🇹' },
    ES: { code: 'es', name: 'Español', flag: '🇪🇸' },
    FR: { code: 'fr', name: 'Français', flag: '🇫🇷' },
    DE: { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    PT: { code: 'pt', name: 'Português', flag: '🇵🇹' },
    JA: { code: 'ja', name: '日本語', flag: '🇯🇵' },
    ZH: { code: 'zh', name: '中文', flag: '🇨🇳' }
};

export const SORT_OPTIONS = {
    RELEVANCE: { value: 'relevance', label: 'Most Relevant' },
    NAME_ASC: { value: 'name_asc', label: 'Name (A-Z)' },
    NAME_DESC: { value: 'name_desc', label: 'Name (Z-A)' },
    PRICE_ASC: { value: 'price_asc', label: 'Price (Low to High)' },
    PRICE_DESC: { value: 'price_desc', label: 'Price (High to Low)' },
    DATE_ASC: { value: 'date_asc', label: 'Oldest First' },
    DATE_DESC: { value: 'date_desc', label: 'Newest First' },
    POPULAR: { value: 'popular', label: 'Most Popular' }
};

export const FILTER_TYPES = {
    CATEGORY: 'category',
    PRICE_RANGE: 'price_range',
    RATING: 'rating',
    SPONSORED: 'sponsored',
    AVAILABILITY: 'availability'
};

export const TOAST_TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
};

export const MODAL_SIZES = {
    SMALL: 'small',
    MEDIUM: 'medium',
    LARGE: 'large',
    FULLSCREEN: 'fullscreen'
};

export const BREAKPOINTS = {
    MOBILE: 768,
    TABLET: 1024,
    DESKTOP: 1280,
    WIDE: 1536
};

export const ANIMATION_DURATIONS = {
    FAST: 150,
    NORMAL: 300,
    SLOW: 500
};

export const CACHE_KEYS = {
    STANDS: 'cache:stands',
    RECOMMENDATIONS: 'cache:recommendations',
    TRANSLATIONS: 'cache:translations',
    USER_PROFILE: 'cache:user:profile',
    SEARCH_RESULTS: 'cache:search:results'
};

export const ERROR_MESSAGES = {
    NETWORK_ERROR: 'Network error. Please check your connection.',
    AUTH_REQUIRED: 'Please login to continue.',
    NOT_FOUND: 'The requested resource was not found.',
    SERVER_ERROR: 'Server error. Please try again later.',
    INVALID_INPUT: 'Please check your input and try again.',
    SESSION_EXPIRED: 'Your session has expired. Please login again.',
    CART_FULL: 'Your cart is full. Please remove some items.',
    PAYMENT_FAILED: 'Payment failed. Please try again.'
};

export const SUCCESS_MESSAGES = {
    ITEM_ADDED: 'Item added to cart successfully!',
    ITEM_REMOVED: 'Item removed from cart.',
    ORDER_PLACED: 'Order placed successfully!',
    PROFILE_UPDATED: 'Profile updated successfully!',
    PASSWORD_CHANGED: 'Password changed successfully!',
    EMAIL_SENT: 'Email sent successfully!',
    TRANSLATION_SUCCESS: 'Page translated successfully!'
};

export const REGEX_PATTERNS = {
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    PHONE: /^\+?[\d\s\-()]+$/,
    URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
    ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
    SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
};

export const LOCAL_STORAGE_KEYS = {
    CART: 'ai_pavilion_cart',
    USER_PREFERENCES: 'ai_pavilion_preferences',
    AUTH_TOKEN: 'ai_pavilion_auth_token',
    LANGUAGE: 'ai_pavilion_language',
    THEME: 'ai_pavilion_theme',
    RECENT_SEARCHES: 'ai_pavilion_recent_searches'
};

export const API_ENDPOINTS = {
    STANDS: {
        LIST: '/stands',
        DETAIL: '/stands/:id',
        SPONSORED: '/stands',
        SEARCH: '/stands/search',
        CATEGORIES: '/stands/categories'
    },
    RECOMMENDATIONS: {
        GET: '/recommendations',
        TRACK: '/recommendations/track'
    },
    TRANSLATE: {
        TEXT: '/translate',
        BATCH: '/translate/batch'
    },
    CHECKOUT: {
        CREATE_SESSION: '/checkout/create-session',
        CONFIRM: '/checkout/confirm',
        WEBHOOK: '/checkout/webhook'
    },
    USER: {
        PROFILE: '/user/profile',
        ORDERS: '/user/orders',
        PREFERENCES: '/user/preferences'
    },
    ANALYTICS: {
        TRACK_EVENT: '/analytics/event',
        TRACK_PAGE: '/analytics/page'
    }
};

export const PAGINATION_DEFAULTS = {
    PAGE: 1,
    PAGE_SIZE: 10,
    MAX_PAGE_SIZE: 100
};

export const RATING_SCALE = {
    MIN: 1,
    MAX: 5,
    DEFAULT: 0
};

export const PRICE_RANGES = [
    { min: 0, max: 50, label: 'Under $50' },
    { min: 50, max: 100, label: '$50 - $100' },
    { min: 100, max: 250, label: '$100 - $250' },
    { min: 250, max: 500, label: '$250 - $500' },
    { min: 500, max: Infinity, label: 'Over $500' }
];

export const CURRENCIES = {
    USD: { code: 'USD', symbol: '$', name: 'US Dollar' },
    EUR: { code: 'EUR', symbol: '€', name: 'Euro' },
    GBP: { code: 'GBP', symbol: '£', name: 'British Pound' },
    JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen' }
};

export default {
    HTTP_STATUS,
    EVENT_TYPES,
    INTERACTION_TYPES,
    STAND_CATEGORIES,
    LANGUAGES,
    SORT_OPTIONS,
    TOAST_TYPES,
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,
    LOCAL_STORAGE_KEYS,
    API_ENDPOINTS
};
