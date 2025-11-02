// Configuration for AI Pavilion
// ULTIMATE COMPLETE browser-compatible version

const config = {
    // API Configuration
    api: {
        endpoint: 'https://xcbvr1zx7c.execute-api.us-east-1.amazonaws.com/prod',
        timeout: 30000,
        retries: 3
    },
    
    // Error Handling Configuration
    errors: {
        logToConsole: true,
        logToServer: false,
        showUserFriendlyMessages: true
    },
    
    // Analytics Configuration
    analytics: {
        enabled: false,
        trackPageViews: false,
        trackErrors: false
    },
    
    // UI Configuration
    ui: {
        toastDuration: 3000,
        loadingDelay: 500,
        animationDuration: 300,
        debounceDelay: 300
    },
    
    // Cart Configuration
    cart: {
        storageKey: 'ai_pavilion_cart',
        maxItems: 50,
        sessionTimeout: 86400000 // 24 hours
    },
    
    // Translation Service Config
    translate: {
        enabled: false,
        cacheEnabled: true,
        cacheDuration: 86400000,
        defaultLanguage: 'en',
        supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh']
    },
    
    // Personalization Config
    // Personalize Service Config (alias)
    personalize: {
        enabled: false,
        cacheEnabled: true,
        cacheDuration: 3600000,
        endpoint: '/personalize'
    },

    personalization: {
        enabled: false,
        cacheEnabled: true,
        cacheDuration: 3600000,
        endpoint: '/personalize'
    },
    
    // Authentication Config
    auth: {
        mockMode: true,
        sessionDuration: 86400000,
        storageKey: 'ai_pavilion_auth'
    },
    
    // Checkout Config
    checkout: {
        stripeEnabled: false,
        currency: 'usd'
    },
    
    // AWS Configuration
    aws: {
        region: 'us-east-1',
        cognito: {
            userPoolId: '',
            clientId: ''
        }
    },
    
    // Application Settings
    app: {
        name: 'AI Pavilion',
        version: '1.0.0'
    },
    
    // Feature Flags
    features: {
        personalization: false,
        translations: false,
        stripe: false,
        mockAuth: true
    },
    
    // Legacy support
    API_BASE_URL: 'https://xcbvr1zx7c.execute-api.us-east-1.amazonaws.com/prod',
    AWS_REGION: 'us-east-1',
    COGNITO_USER_POOL_ID: '',
    COGNITO_CLIENT_ID: '',
    APP_NAME: 'AI Pavilion',
    APP_VERSION: '1.0.0',
    ENABLE_PERSONALIZATION: false,
    ENABLE_TRANSLATIONS: false,
    ENABLE_STRIPE: false,
    USE_MOCK_AUTH: true
};

export { config, config as CONFIG };
export default config;
