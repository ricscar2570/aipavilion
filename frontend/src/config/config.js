// AI Pavilion Configuration
export const config = {
    // API Configuration
    apiUrl: 'https://xcbvr1zx7c.execute-api.us-east-1.amazonaws.com/prod',
    
    // AWS Configuration
    aws: {
        region: 'us-east-1',
        cognito: {
            userPoolId: 'us-east-1_XXXXXXXXX',
            clientId: 'XXXXXXXXXXXXXXXXXXXXXXXXXX',
            enabled: false
        }
    },
    
    // Stripe Configuration
    stripe: {
        publishableKey: 'pk_test_XXXXXXXXXXXXXXXXXXXX',
        enabled: false
    },
    
    // Feature Flags
    features: {
        ar: false,
        tour360: false,
        analytics: false,
        reviews: false,
        wishlist: true
    },
    
    // AR Configuration
    ar: {
        enabled: false,
        modelsCDN: 'https://ai-pavilion-3d-models.s3.amazonaws.com/'
    },
    
    // 360 Tours Configuration
    tours: {
        enabled: false,
        imagesCDN: 'https://ai-pavilion-360-images.s3.amazonaws.com/'
    }
};
