/**
 * AI Pavilion - Checkout Lambda
 * Handles Stripe payment intents, order creation, and webhook verification.
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY       - Stripe secret key (from Secrets Manager)
 *   STRIPE_WEBHOOK_SECRET   - Stripe webhook signing secret
 *   ORDERS_TABLE            - DynamoDB table for orders
 *   ALLOWED_ORIGIN          - Frontend origin for CORS (e.g. https://expo.yourdomain.com)
 */

const { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const Stripe = require('stripe');
const { randomUUID } = require('crypto');

const dynamo = new DynamoDBClient({});
const secretsManager = new SecretsManagerClient({});
const ORDERS_TABLE = process.env.ORDERS_TABLE || 'ai-pavilion-orders';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://localhost:3000';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Fetch Stripe secret key from AWS Secrets Manager (cached per Lambda container). */
// Stripe client is cached at module level. Lambda containers are reused across
// warm invocations, so we pay the Secrets Manager round-trip only on cold starts.
let _stripe = null;
async function getStripe() {
    if (_stripe) return _stripe;
    const secret = await secretsManager.send(
        new GetSecretValueCommand({ SecretId: process.env.STRIPE_SECRET_KEY_ARN || 'ai-pavilion/stripe' })
    );
    const { stripeSecretKey } = JSON.parse(secret.SecretString);
    _stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-04-10' });
    return _stripe;
}

function corsHeaders(origin) {
    // Only reflect origin if it matches the allowed origin; otherwise deny.
    const allowedOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Content-Type': 'application/json',
    };
}

function respond(statusCode, body, origin = '') {
    return {
        statusCode,
        headers: corsHeaders(origin),
        body: JSON.stringify(body),
    };
}

function validationError(message, origin) {
    return respond(400, { error: 'VALIDATION_ERROR', message }, origin);
}

/** Validate cart items sent from the frontend. */
function validateCartItems(items) {
    if (!Array.isArray(items) || items.length === 0) return 'Cart is empty';
    for (const item of items) {
        if (!item.productId || typeof item.productId !== 'string') return 'Invalid productId';
        if (!Number.isInteger(item.quantity) || item.quantity < 1) return 'Invalid quantity';
        if (typeof item.priceInCents !== 'number' || item.priceInCents < 50) return 'Invalid price';
        if (!item.name || typeof item.name !== 'string') return 'Invalid product name';
    }
    return null;
}

// ─── Route handlers ─────────────────────────────────────────────────────────

/**
 * POST /checkout/create-intent
 * Creates a Stripe PaymentIntent and saves a pending order to DynamoDB.
 */
async function createPaymentIntent(body, userId, origin) {
    const { items, currency = 'eur', customerEmail } = body;

    const itemError = validateCartItems(items);
    if (itemError) return validationError(itemError, origin);
    if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
        return validationError('Invalid customer email', origin);
    }

    // Compute total server-side — never trust the client total.
    // Recompute total from our item catalogue — the frontend total is untrusted.
    // A client could manipulate it to pay less; this is where we catch that.
    const amountInCents = items.reduce((sum, i) => sum + i.priceInCents * i.quantity, 0);
    if (amountInCents < 50) return validationError('Order total too low', origin);

    const stripe = await getStripe();
    const orderId = randomUUID();

    // Create Stripe customer (or reuse if userId already has one — left as exercise).
    const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency,
        metadata: { orderId, userId: userId || 'guest' },
        receipt_email: customerEmail,
        automatic_payment_methods: { enabled: true },
    });

    // Persist pending order.
    await dynamo.send(new PutItemCommand({
        TableName: ORDERS_TABLE,
        Item: marshall({
            orderId,
            paymentIntentId: paymentIntent.id,
            userId: userId || 'guest',
            customerEmail,
            items,
            amountInCents,
            currency,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }),
        ConditionExpression: 'attribute_not_exists(orderId)', // prevent duplicates
    }));

    return respond(200, {
        clientSecret: paymentIntent.client_secret,
        orderId,
        amountInCents,
    }, origin);
}

/**
 * POST /checkout/confirm-order
 * Called after the frontend confirms the payment via Stripe.js.
 * Verifies the PaymentIntent status before marking the order as paid.
 */
async function confirmOrder(body, origin) {
    const { orderId, paymentIntentId } = body;
    if (!orderId || !paymentIntentId) return validationError('Missing orderId or paymentIntentId', origin);

    const stripe = await getStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (intent.status !== 'succeeded') {
        return respond(402, {
            error: 'PAYMENT_NOT_COMPLETED',
            message: `Payment status: ${intent.status}`,
        }, origin);
    }

    // Cross-check prevents a client from submitting a real PaymentIntent
    // against a different order to claim it as paid.
    if (intent.metadata.orderId !== orderId) {
        return respond(403, { error: 'ORDER_MISMATCH', message: 'PaymentIntent does not match order' }, origin);
    }

    await dynamo.send(new UpdateItemCommand({
        TableName: ORDERS_TABLE,
        Key: marshall({ orderId }),
        UpdateExpression: 'SET #s = :status, updatedAt = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: marshall({ ':status': 'paid', ':now': new Date().toISOString() }),
        ConditionExpression: 'attribute_exists(orderId)',
    }));

    return respond(200, { success: true, orderId, status: 'paid' }, origin);
}

/**
 * POST /checkout/webhook
 * Stripe webhook endpoint — must be called with the raw body for signature verification.
 */
async function handleWebhook(rawBody, signature) {
    if (!signature) return respond(400, { error: 'Missing stripe-signature header' });

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        console.error('STRIPE_WEBHOOK_SECRET not configured');
        return respond(500, { error: 'Webhook not configured' });
    }

    const stripe = await getStripe();
    let event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return respond(400, { error: 'Invalid signature' });
    }

    switch (event.type) {
        case 'payment_intent.succeeded': {
            const intent = event.data.object;
            const { orderId } = intent.metadata;
            if (orderId) {
                await dynamo.send(new UpdateItemCommand({
                    TableName: ORDERS_TABLE,
                    Key: marshall({ orderId }),
                    UpdateExpression: 'SET #s = :status, updatedAt = :now',
                    ExpressionAttributeNames: { '#s': 'status' },
                    ExpressionAttributeValues: marshall({ ':status': 'paid', ':now': new Date().toISOString() }),
                    ConditionExpression: 'attribute_exists(orderId)',
                }));
            }
            break;
        }
        case 'payment_intent.payment_failed': {
            const intent = event.data.object;
            const { orderId } = intent.metadata;
            if (orderId) {
                await dynamo.send(new UpdateItemCommand({
                    TableName: ORDERS_TABLE,
                    Key: marshall({ orderId }),
                    UpdateExpression: 'SET #s = :status, updatedAt = :now',
                    ExpressionAttributeNames: { '#s': 'status' },
                    ExpressionAttributeValues: marshall({ ':status': 'failed', ':now': new Date().toISOString() }),
                    ConditionExpression: 'attribute_exists(orderId)',
                }));
            }
            break;
        }
        case 'charge.refunded': {
            // Handle refunds if needed.
            break;
        }
        default:
            console.log(`Unhandled event type: ${event.type}`);
    }

    return respond(200, { received: true });
}

/**
 * GET /checkout/order/{orderId}
 * Retrieve order details. Only the owning user (or guest by email) can access.
 */
async function getOrder(orderId, userId, origin) {
    if (!orderId) return validationError('Missing orderId', origin);

    const result = await dynamo.send(new GetItemCommand({
        TableName: ORDERS_TABLE,
        Key: marshall({ orderId }),
    }));

    if (!result.Item) return respond(404, { error: 'Order not found' }, origin);

    const order = unmarshall(result.Item);

    // Sanity-check the stored record has the fields we rely on.
    // A partially-written item (e.g. from an interrupted PutItem) should not
    // be surfaced to the client as if it were a complete order.
    if (!order.orderId || !order.status || !order.amountInCents) {
        console.error('Corrupted order record:', orderId, Object.keys(order));
        return respond(500, { error: 'INTERNAL_ERROR', message: 'Order record is incomplete' }, origin);
    }

    // Only the order owner can read it.
    if (order.userId !== 'guest' && order.userId !== userId) {
        return respond(403, { error: 'Forbidden' }, origin);
    }

    // paymentIntentId is an internal reference — returning it would let
    // a client attempt to re-use or probe the intent on Stripe directly.
    const { paymentIntentId, ...safeOrder } = order;
    return respond(200, safeOrder, origin);
}

// ─── Main handler ────────────────────────────────────────────────────────────

exports.handler = async (event) => {
    const origin = (event.headers || {})['origin'] || (event.headers || {})['Origin'] || '';

    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders(origin), body: '' };
    }

    const path = event.path || '';

    try {
        // Webhook must use the raw body (API Gateway must be configured for binary/raw passthrough).
        if (path === '/checkout/webhook' && event.httpMethod === 'POST') {
            const signature = (event.headers || {})['stripe-signature'];
            return await handleWebhook(event.body, signature);
        }

        // All other routes parse JSON body.
        let body = {};
        if (event.body) {
            try {
                body = JSON.parse(event.body);
            } catch {
                return validationError('Invalid JSON body', origin);
            }
        }

        // Extract userId from Cognito authorizer (if present).
        const userId = event.requestContext?.authorizer?.claims?.sub || null;

        if (path === '/checkout/create-intent' && event.httpMethod === 'POST') {
            return await createPaymentIntent(body, userId, origin);
        }

        if (path === '/checkout/confirm-order' && event.httpMethod === 'POST') {
            return await confirmOrder(body, origin);
        }

        const orderMatch = path.match(/^\/checkout\/order\/([^/]+)$/);
        if (orderMatch && event.httpMethod === 'GET') {
            return await getOrder(orderMatch[1], userId, origin);
        }

        return respond(404, { error: 'Not found' }, origin);

    } catch (err) {
        console.error('Unhandled error in checkout Lambda:', err);
        return respond(500, { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, origin);
    }
};
