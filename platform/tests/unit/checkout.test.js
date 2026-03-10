/**
 * Unit tests — Checkout Lambda
 *
 * We mock AWS SDK and Stripe entirely so these tests run with zero
 * external dependencies (no AWS account, no Stripe account needed).
 */

'use strict';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockDynamoSend = jest.fn();
const mockSecretSend = jest.fn();
const mockStripePaymentIntentsCreate = jest.fn();
const mockStripePaymentIntentsRetrieve = jest.fn();
const mockStripeWebhooksConstructEvent = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn(() => ({ send: mockDynamoSend })),
    PutItemCommand: jest.fn(input => ({ type: 'PutItem', input })),
    GetItemCommand: jest.fn(input => ({ type: 'GetItem', input })),
    UpdateItemCommand: jest.fn(input => ({ type: 'UpdateItem', input })),
}));

jest.mock('@aws-sdk/util-dynamodb', () => ({
    marshall: jest.fn(obj => obj),
    unmarshall: jest.fn(obj => obj),
}));

jest.mock('@aws-sdk/client-secrets-manager', () => ({
    SecretsManagerClient: jest.fn(() => ({ send: mockSecretSend })),
    GetSecretValueCommand: jest.fn(),
}));

jest.mock('stripe', () => {
    return jest.fn(() => ({
        paymentIntents: {
            create: mockStripePaymentIntentsCreate,
            retrieve: mockStripePaymentIntentsRetrieve,
        },
        webhooks: {
            constructEvent: mockStripeWebhooksConstructEvent,
        },
    }));
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(overrides = {}) {
    return {
        httpMethod: 'POST',
        path: '/checkout/create-intent',
        headers: { origin: 'https://test.cloudfront.net' },
        body: null,
        requestContext: { authorizer: { claims: { sub: 'user-123' } } },
        ...overrides,
    };
}

const VALID_ITEMS = [
    { productId: 'prod-1', name: 'Cyberpunk 2077', quantity: 1, priceInCents: 5999 },
    { productId: 'prod-2', name: 'Steam Controller', quantity: 2, priceInCents: 3499 },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Checkout Lambda', () => {
    let handler;

    beforeAll(() => {
        process.env.ALLOWED_ORIGIN = 'https://test.cloudfront.net';
        process.env.ORDERS_TABLE = 'ai-pavilion-orders-test';
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

        // Secrets Manager returns a Stripe key
        mockSecretSend.mockResolvedValue({
            SecretString: JSON.stringify({ stripeSecretKey: 'sk_test_fake' }),
        });

        handler = require('../../backend/lambda/checkout/index').handler;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockSecretSend.mockResolvedValue({
            SecretString: JSON.stringify({ stripeSecretKey: 'sk_test_fake' }),
        });
    });

    // ── CORS preflight ──────────────────────────────────────────────────────

    test('OPTIONS returns 204 with CORS headers', async () => {
        const event = makeEvent({ httpMethod: 'OPTIONS' });
        const res = await handler(event);

        expect(res.statusCode).toBe(204);
        expect(res.headers['Access-Control-Allow-Origin']).toBe('https://test.cloudfront.net');
    });

    test('Unknown origin gets the configured ALLOWED_ORIGIN', async () => {
        const event = makeEvent({ httpMethod: 'OPTIONS', headers: { origin: 'https://evil.com' } });
        const res = await handler(event);

        expect(res.headers['Access-Control-Allow-Origin']).toBe('https://test.cloudfront.net');
    });

    // ── create-intent ───────────────────────────────────────────────────────

    describe('POST /checkout/create-intent', () => {
        test('returns 200 with clientSecret on valid input', async () => {
            mockStripePaymentIntentsCreate.mockResolvedValue({
                id: 'pi_test_123',
                client_secret: 'pi_test_123_secret_abc',
            });
            mockDynamoSend.mockResolvedValue({});

            const event = makeEvent({
                body: JSON.stringify({ items: VALID_ITEMS, customerEmail: 'buyer@test.com' }),
            });
            const res = await handler(event);
            const body = JSON.parse(res.body);

            expect(res.statusCode).toBe(200);
            expect(body.clientSecret).toBe('pi_test_123_secret_abc');
            expect(body.orderId).toBeDefined();
            expect(body.amountInCents).toBe(5999 + 3499 * 2); // 12997
        });

        test('computes total server-side (ignores any client total field)', async () => {
            mockStripePaymentIntentsCreate.mockResolvedValue({
                id: 'pi_test_456',
                client_secret: 'secret_456',
            });
            mockDynamoSend.mockResolvedValue({});

            const items = [{ productId: 'p1', name: 'Game', quantity: 1, priceInCents: 1000 }];
            const event = makeEvent({
                body: JSON.stringify({ items, customerEmail: 'buyer@test.com', totalOverride: 1 }),
            });
            const res = await handler(event);
            const body = JSON.parse(res.body);

            expect(res.statusCode).toBe(200);
            expect(body.amountInCents).toBe(1000);

            const stripeCall = mockStripePaymentIntentsCreate.mock.calls[0][0];
            expect(stripeCall.amount).toBe(1000);
        });

        test('returns 400 on empty cart', async () => {
            const event = makeEvent({
                body: JSON.stringify({ items: [], customerEmail: 'buyer@test.com' }),
            });
            const res = await handler(event);
            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body).error).toBe('VALIDATION_ERROR');
        });

        test('returns 400 on invalid email', async () => {
            const event = makeEvent({
                body: JSON.stringify({ items: VALID_ITEMS, customerEmail: 'not-an-email' }),
            });
            const res = await handler(event);
            expect(res.statusCode).toBe(400);
        });

        test('returns 400 on invalid quantity', async () => {
            const badItems = [{ productId: 'p1', name: 'Game', quantity: 0, priceInCents: 1000 }];
            const event = makeEvent({
                body: JSON.stringify({ items: badItems, customerEmail: 'b@test.com' }),
            });
            const res = await handler(event);
            expect(res.statusCode).toBe(400);
        });

        test('returns 400 on malformed JSON', async () => {
            const event = makeEvent({ body: 'not json{{{' });
            const res = await handler(event);
            expect(res.statusCode).toBe(400);
        });

        test('returns 500 when Stripe throws', async () => {
            mockStripePaymentIntentsCreate.mockRejectedValue(new Error('Stripe API unreachable'));
            const event = makeEvent({
                body: JSON.stringify({ items: VALID_ITEMS, customerEmail: 'buyer@test.com' }),
            });
            const res = await handler(event);
            expect(res.statusCode).toBe(500);
            expect(JSON.parse(res.body).error).toBe('INTERNAL_ERROR');
        });
    });

    // ── confirm-order ───────────────────────────────────────────────────────

    describe('POST /checkout/confirm-order', () => {
        test('returns 200 when PaymentIntent succeeded', async () => {
            mockStripePaymentIntentsRetrieve.mockResolvedValue({
                status: 'succeeded',
                metadata: { orderId: 'order-abc' },
            });
            mockDynamoSend.mockResolvedValue({});

            const event = makeEvent({
                path: '/checkout/confirm-order',
                body: JSON.stringify({ orderId: 'order-abc', paymentIntentId: 'pi_test_abc' }),
            });
            const res = await handler(event);
            const body = JSON.parse(res.body);

            expect(res.statusCode).toBe(200);
            expect(body.status).toBe('paid');
        });

        test('returns 402 when payment not completed', async () => {
            mockStripePaymentIntentsRetrieve.mockResolvedValue({
                status: 'requires_payment_method',
                metadata: { orderId: 'order-abc' },
            });
            const event = makeEvent({
                path: '/checkout/confirm-order',
                body: JSON.stringify({ orderId: 'order-abc', paymentIntentId: 'pi_test_abc' }),
            });
            const res = await handler(event);
            expect(res.statusCode).toBe(402);
        });

        test('returns 403 when orderId does not match PaymentIntent metadata', async () => {
            mockStripePaymentIntentsRetrieve.mockResolvedValue({
                status: 'succeeded',
                metadata: { orderId: 'DIFFERENT-ORDER' },
            });
            const event = makeEvent({
                path: '/checkout/confirm-order',
                body: JSON.stringify({ orderId: 'order-abc', paymentIntentId: 'pi_test_abc' }),
            });
            const res = await handler(event);
            expect(res.statusCode).toBe(403);
        });

        test('returns 400 when body is missing orderId', async () => {
            const event = makeEvent({
                path: '/checkout/confirm-order',
                body: JSON.stringify({ paymentIntentId: 'pi_test_abc' }),
            });
            const res = await handler(event);
            expect(res.statusCode).toBe(400);
        });
    });

    // ── webhook ─────────────────────────────────────────────────────────────

    describe('POST /checkout/webhook', () => {
        test('returns 400 when signature header is missing', async () => {
            const event = makeEvent({
                path: '/checkout/webhook',
                headers: {},
                body: '{}',
            });
            const res = await handler(event);
            expect(res.statusCode).toBe(400);
        });

        test('returns 400 when signature verification fails', async () => {
            mockStripeWebhooksConstructEvent.mockImplementation(() => {
                throw new Error('No signatures found matching the expected signature');
            });
            const event = makeEvent({
                path: '/checkout/webhook',
                headers: { 'stripe-signature': 'bad_sig' },
                body: '{"type":"payment_intent.succeeded"}',
            });
            const res = await handler(event);
            expect(res.statusCode).toBe(400);
        });

        test('handles payment_intent.succeeded and updates DynamoDB', async () => {
            mockStripeWebhooksConstructEvent.mockReturnValue({
                type: 'payment_intent.succeeded',
                data: { object: { metadata: { orderId: 'order-xyz' } } },
            });
            mockDynamoSend.mockResolvedValue({});

            const event = makeEvent({
                path: '/checkout/webhook',
                headers: { 'stripe-signature': 'valid_sig' },
                body: '{"type":"payment_intent.succeeded"}',
            });
            const res = await handler(event);

            expect(res.statusCode).toBe(200);
            expect(mockDynamoSend).toHaveBeenCalledTimes(1);
        });

        test('handles unknown event types gracefully', async () => {
            mockStripeWebhooksConstructEvent.mockReturnValue({
                type: 'customer.subscription.updated',
                data: { object: {} },
            });
            const event = makeEvent({
                path: '/checkout/webhook',
                headers: { 'stripe-signature': 'valid_sig' },
                body: '{}',
            });
            const res = await handler(event);

            expect(res.statusCode).toBe(200);
            expect(mockDynamoSend).not.toHaveBeenCalled();
        });
    });

    // ── get order ───────────────────────────────────────────────────────────

    describe('GET /checkout/order/:id', () => {
        test('returns order for the owning user', async () => {
            mockDynamoSend.mockResolvedValue({
                Item: {
                    orderId: 'order-123',
                    userId: 'user-123',
                    status: 'paid',
                    amountInCents: 5999,
                    paymentIntentId: 'pi_secret', // should be stripped
                },
            });

            const event = makeEvent({
                httpMethod: 'GET',
                path: '/checkout/order/order-123',
                body: null,
            });
            const res = await handler(event);
            const body = JSON.parse(res.body);

            expect(res.statusCode).toBe(200);
            expect(body.orderId).toBe('order-123');
            expect(body.paymentIntentId).toBeUndefined(); // sensitive field stripped
        });

        test('returns 403 for a different user', async () => {
            mockDynamoSend.mockResolvedValue({
                Item: { orderId: 'order-123', userId: 'other-user', status: 'paid', amountInCents: 999, paymentIntentId: 'x' },
            });
            const event = makeEvent({
                httpMethod: 'GET',
                path: '/checkout/order/order-123',
                body: null,
            });
            const res = await handler(event);
            expect(res.statusCode).toBe(403);
        });

        test('returns 404 for a non-existent order', async () => {
            mockDynamoSend.mockResolvedValue({ Item: null });
            const event = makeEvent({
                httpMethod: 'GET',
                path: '/checkout/order/ghost-order',
                body: null,
            });
            const res = await handler(event);
            expect(res.statusCode).toBe(404);
        });
    });

    // ── unknown routes ──────────────────────────────────────────────────────

    test('returns 404 for unrecognised path', async () => {
        const event = makeEvent({ path: '/checkout/nonexistent' });
        const res = await handler(event);
        expect(res.statusCode).toBe(404);
    });
});
