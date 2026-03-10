import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// __dirname is not available in ESM — derive it from import.meta.url
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    return {
        root: 'frontend',
        publicDir: 'frontend/public',

        define: {
            __APP_CONFIG__: JSON.stringify({
                apiEndpoint:          env.API_GATEWAY_URL            || '',
                cognitoUserPoolId:    env.COGNITO_USER_POOL_ID       || '',
                cognitoClientId:      env.COGNITO_CLIENT_ID          || '',
                cognitoRegion:        env.AWS_REGION                  || 'us-east-1',
                stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY     || '',
                cloudFrontDomain:     env.CLOUDFRONT_DOMAIN          || '',
                featureAr:            env.FEATURE_AR === 'true',
                feature360Tours:      env.FEATURE_360_TOURS === 'true',
                featureAnalytics:     env.FEATURE_ANALYTICS === 'true',
                featureReviews:       env.FEATURE_REVIEWS === 'true',
                featureWishlist:      env.FEATURE_WISHLIST !== 'false',
                nodeEnv:              env.NODE_ENV || 'development',
            }),
        },

        build: {
            outDir: '../dist',
            emptyOutDir: true,
            sourcemap: mode !== 'production',

            rollupOptions: {
                input: {
                    main: resolve(__dirname, 'frontend/index.html'),
                },
                output: {
                    manualChunks(id) {
                        if (id.includes('node_modules')) {
                            if (id.includes('stripe'))    return 'vendor-stripe';
                            if (id.includes('pannellum')) return 'vendor-pannellum';
                            return 'vendor';
                        }
                    },
                    chunkFileNames: 'assets/[name]-[hash].js',
                    assetFileNames: 'assets/[name]-[hash][extname]',
                },
            },

            minify: mode === 'production' ? 'esbuild' : false,
            target: 'es2020',
            chunkSizeWarningLimit: 300,
        },

        server: {
            port: 3000,
            open: true,
            proxy: {
                '/api': {
                    target: env.API_GATEWAY_URL || 'http://localhost:4000',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api/, ''),
                },
            },
        },

        preview: { port: 4173 },
    };
});
