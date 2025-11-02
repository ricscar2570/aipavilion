// Stripe Service - Mock version (no external dependencies)
class StripeService {
    constructor() {
        this.initialized = false;
    }

    async initialize() {
        console.log('Stripe service initialized (mock mode)');
        this.initialized = true;
        return true;
    }

    async createPaymentIntent(amount, currency = 'usd') {
        console.log('Mock payment intent created:', { amount, currency });
        return {
            clientSecret: 'mock_client_secret',
            id: 'mock_payment_intent_id'
        };
    }

    async confirmPayment(clientSecret, paymentMethod) {
        console.log('Mock payment confirmed');
        return {
            paymentIntent: {
                id: 'mock_payment_intent_id',
                status: 'succeeded'
            }
        };
    }
}

// Export con entrambi i nomi per compatibilità
const stripeService = new StripeService();
export { stripeService, StripeService };
export default stripeService;
