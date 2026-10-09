"use strict";

const { withObservability } = require("../common/observability");
const {
    DynamoDBClient,
    PutItemCommand,
    GetItemCommand,
    UpdateItemCommand,
    BatchGetItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const {
    SecretsManagerClient,
    GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const Stripe = require("stripe");
const { createHash, randomUUID } = require("crypto");
const { respond, preflight } = require("../common/cors");
const { isPublicStand } = require("../common/catalog");
const { isEventPublic } = require("../common/publication-state");
const { retryUnprocessedBatchGet } = require("../common/retry");
const {
    parseJsonBody,
    hasExactShape,
    isValidRequestId,
} = require("../common/validation");

const dynamo = new DynamoDBClient({});
const secretsManager = new SecretsManagerClient({});
const ORDERS_TABLE = process.env.ORDERS_TABLE || "ai-pavilion-orders";
const STANDS_TABLE = process.env.STANDS_TABLE || "ai-pavilion-stands";
const EVENTS_TABLE = process.env.EVENTS_TABLE || "ai-pavilion-events";
const PAYMENT_EVENTS_TABLE =
    process.env.PAYMENT_EVENTS_TABLE || "ai-pavilion-payment-events";
const CURRENCY = "eur";
const MAX_CART_ITEMS = 50;
const MAX_QUANTITY = 99;
const WEBHOOK_LEASE_SECONDS = 120;
const TERMINAL_STATUSES = new Set(["paid", "cancelled", "refunded"]);
const ALLOWED_TRANSITIONS = {
    creating: new Set(["pending", "paid", "failed", "cancelled"]),
    pending: new Set(["paid", "failed", "cancelled"]),
    failed: new Set(["pending", "paid", "cancelled"]),
    paid: new Set(["refunded"]),
    cancelled: new Set(),
    refunded: new Set(),
};

function paymentMode() {
    return process.env.PAYMENT_MODE || "stripe";
}

let stripeClient = null;
let stripeConfiguration = null;

async function getStripeConfiguration() {
    if (stripeConfiguration) {
        return stripeConfiguration;
    }
    const secret = await secretsManager.send(
        new GetSecretValueCommand({
            SecretId: process.env.STRIPE_SECRET_KEY_ARN || "ai-pavilion/stripe",
        }),
    );
    if (!secret.SecretString) {
        throw new Error("Stripe secret is empty");
    }
    const parsed = JSON.parse(secret.SecretString);
    if (!parsed.stripeSecretKey) {
        throw new Error("Stripe secret has an invalid shape");
    }
    stripeConfiguration = parsed;
    return stripeConfiguration;
}

async function getStripe() {
    if (!stripeClient) {
        const configuration = await getStripeConfiguration();
        stripeClient = new Stripe(configuration.stripeSecretKey, {
            apiVersion: "2024-04-10",
        });
    }
    return stripeClient;
}

function validationError(message, event) {
    return respond(400, { error: "VALIDATION_ERROR", message }, event);
}

function getUserId(event) {
    return event.requestContext?.authorizer?.claims?.sub || null;
}

function getHeader(event, name) {
    const entries = Object.entries(event.headers || {});
    return entries.find(
        ([key]) => key.toLowerCase() === name.toLowerCase(),
    )?.[1];
}

function validateRequestedItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return "Cart is empty";
    }
    if (items.length > MAX_CART_ITEMS) {
        return `Cart cannot contain more than ${MAX_CART_ITEMS} items`;
    }
    for (const item of items) {
        if (
            !item ||
            typeof item !== "object" ||
            Array.isArray(item) ||
            !hasExactShape(item, ["standId", "productId", "quantity"])
        ) {
            return "Invalid cart item shape";
        }
        if (!item.standId || typeof item.standId !== "string") {
            return "Invalid standId";
        }
        if (!item.productId || typeof item.productId !== "string") {
            return "Invalid productId";
        }
        if (
            !Number.isInteger(item.quantity) ||
            item.quantity < 1 ||
            item.quantity > MAX_QUANTITY
        ) {
            return `Quantity must be between 1 and ${MAX_QUANTITY}`;
        }
    }
    return null;
}

function productPriceInCents(product) {
    if (Number.isInteger(product.priceInCents)) {
        return product.priceInCents;
    }
    if (typeof product.price === "number" && Number.isFinite(product.price)) {
        return Math.round(product.price * 100);
    }
    return null;
}

function deterministicOrderId(userId, checkoutRequestId) {
    return `ord_${createHash("sha256")
        .update(`${userId}:${checkoutRequestId}`)
        .digest("hex")
        .slice(0, 32)}`;
}

function cartFingerprint(items, amountInCents) {
    const normalized = [...items]
        .map(({ standId, productId, quantity, priceInCents }) => ({
            standId,
            productId,
            quantity,
            priceInCents,
        }))
        .sort((a, b) =>
            `${a.standId}:${a.productId}`.localeCompare(
                `${b.standId}:${b.productId}`,
            ),
        );
    return createHash("sha256")
        .update(
            JSON.stringify({ normalized, amountInCents, currency: CURRENCY }),
        )
        .digest("hex");
}

async function resolveCatalogueItems(requestedItems) {
    const standIds = [...new Set(requestedItems.map((item) => item.standId))];
    const responses = await retryUnprocessedBatchGet(
        dynamo,
        BatchGetItemCommand,
        {
            [STANDS_TABLE]: {
                Keys: standIds.map((standId) =>
                    marshall({ stand_id: standId }),
                ),
                ConsistentRead: true,
            },
        },
    );
    const stands = (responses[STANDS_TABLE] || []).map((item) =>
        unmarshall(item),
    );
    const eventIds = [
        ...new Set(stands.map((stand) => stand.eventId).filter(Boolean)),
    ];
    const eventResponses = eventIds.length
        ? await retryUnprocessedBatchGet(dynamo, BatchGetItemCommand, {
              [EVENTS_TABLE]: {
                  Keys: eventIds.map((eventId) => marshall({ eventId })),
                  ConsistentRead: true,
              },
          })
        : {};
    const publicEventIds = new Set(
        (eventResponses[EVENTS_TABLE] || [])
            .map((item) => unmarshall(item))
            .filter(isEventPublic)
            .map((item) => item.eventId),
    );
    const standsById = new Map(stands.map((stand) => [stand.stand_id, stand]));

    return requestedItems.map((requested) => {
        const stand = standsById.get(requested.standId);
        if (!isPublicStand(stand) || !publicEventIds.has(stand.eventId)) {
            throw Object.assign(new Error("Stand not found"), {
                code: "CATALOGUE_ITEM_NOT_FOUND",
            });
        }
        const product = (stand.products || []).find(
            (candidate) =>
                (candidate.productId ||
                    candidate.product_id ||
                    candidate.id) === requested.productId,
        );
        if (!product || product.status !== "active") {
            throw Object.assign(new Error("Product not found"), {
                code: "CATALOGUE_ITEM_NOT_FOUND",
            });
        }
        const priceInCents = productPriceInCents(product);
        if (!Number.isInteger(priceInCents) || priceInCents < 50) {
            throw Object.assign(new Error("Product is not purchasable"), {
                code: "PRODUCT_NOT_PURCHASABLE",
            });
        }
        return {
            standId: requested.standId,
            productId: requested.productId,
            name: String(product.name || "Product").slice(0, 200),
            quantity: requested.quantity,
            priceInCents,
        };
    });
}

async function loadOrder(orderId) {
    const result = await dynamo.send(
        new GetItemCommand({
            TableName: ORDERS_TABLE,
            Key: marshall({ orderId }),
            ConsistentRead: true,
        }),
    );
    return result.Item ? unmarshall(result.Item) : null;
}

function createIntentResponse(order, event) {
    return respond(
        200,
        {
            clientSecret: order.clientSecret || null,
            orderId: order.orderId,
            paymentIntentId: order.paymentIntentId || null,
            paymentMode: paymentMode(),
            amountInCents: order.amountInCents,
            currency: order.currency,
            status: order.status,
            idempotentReplay: Boolean(order.idempotentReplay),
        },
        event,
    );
}

async function reserveOrder(order) {
    try {
        await dynamo.send(
            new PutItemCommand({
                TableName: ORDERS_TABLE,
                Item: marshall(order, { removeUndefinedValues: true }),
                ConditionExpression: "attribute_not_exists(orderId)",
            }),
        );
        return { order, created: true };
    } catch (error) {
        if (error.name !== "ConditionalCheckFailedException") {
            throw error;
        }
        const existing = await loadOrder(order.orderId);
        if (
            !existing ||
            existing.userId !== order.userId ||
            existing.checkoutRequestId !== order.checkoutRequestId ||
            existing.cartFingerprint !== order.cartFingerprint
        ) {
            throw Object.assign(new Error("Idempotency key conflict"), {
                code: "IDEMPOTENCY_CONFLICT",
            });
        }
        return {
            order: { ...existing, idempotentReplay: true },
            created: false,
        };
    }
}

async function attachPaymentIntent(
    orderId,
    paymentIntent,
    expectedStatus = "creating",
) {
    await dynamo.send(
        new UpdateItemCommand({
            TableName: ORDERS_TABLE,
            Key: marshall({ orderId }),
            UpdateExpression:
                "SET paymentIntentId = :paymentIntentId, clientSecret = :clientSecret, #status = :pending, updatedAt = :updatedAt",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: marshall(
                {
                    ":paymentIntentId": paymentIntent.id,
                    ":clientSecret": paymentIntent.client_secret || null,
                    ":pending": "pending",
                    ":updatedAt": new Date().toISOString(),
                    ":expected": expectedStatus,
                    ":failed": "failed",
                },
                { removeUndefinedValues: true },
            ),
            ConditionExpression: "#status IN (:expected, :failed)",
        }),
    );
}

async function createPaymentIntent(body, userId, event) {
    if (!hasExactShape(body, ["items", "customerEmail", "checkoutRequestId"])) {
        return validationError("Unexpected checkout fields", event);
    }
    const { items, customerEmail } = body;
    const headerRequestId = getHeader(event, "Idempotency-Key");
    const checkoutRequestId = body.checkoutRequestId;
    if (
        !headerRequestId ||
        !checkoutRequestId ||
        headerRequestId !== checkoutRequestId ||
        !isValidRequestId(checkoutRequestId)
    ) {
        return validationError(
            "A valid matching idempotency key is required",
            event,
        );
    }
    const itemError = validateRequestedItems(items);
    if (itemError) {
        return validationError(itemError, event);
    }
    if (!userId) {
        return respond(
            401,
            { error: "UNAUTHORIZED", message: "Authentication required" },
            event,
        );
    }
    if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
        return validationError("Invalid customer email", event);
    }
    if (paymentMode() === "disabled") {
        return respond(
            503,
            {
                error: "PAYMENTS_DISABLED",
                message: "Payments are disabled in this environment",
            },
            event,
        );
    }

    let catalogueItems;
    try {
        catalogueItems = await resolveCatalogueItems(items);
    } catch (error) {
        if (
            error.code === "CATALOGUE_ITEM_NOT_FOUND" ||
            error.code === "PRODUCT_NOT_PURCHASABLE"
        ) {
            return respond(
                409,
                { error: error.code, message: error.message },
                event,
            );
        }
        throw error;
    }

    const amountInCents = catalogueItems.reduce(
        (sum, item) => sum + item.priceInCents * item.quantity,
        0,
    );
    if (amountInCents < 50) {
        return validationError("Order total too low", event);
    }

    const orderId = deterministicOrderId(userId, checkoutRequestId);
    const now = new Date().toISOString();
    const draft = {
        orderId,
        checkoutRequestId,
        cartFingerprint: cartFingerprint(catalogueItems, amountInCents),
        userId,
        customerEmail: customerEmail.toLowerCase(),
        items: catalogueItems,
        amountInCents,
        currency: CURRENCY,
        status: "creating",
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now,
    };

    let reservation;
    try {
        reservation = await reserveOrder(draft);
    } catch (error) {
        if (error.code === "IDEMPOTENCY_CONFLICT") {
            return respond(
                409,
                {
                    error: "IDEMPOTENCY_CONFLICT",
                    message:
                        "The idempotency key was already used for another cart",
                },
                event,
            );
        }
        throw error;
    }

    if (!reservation.created && reservation.order.paymentIntentId) {
        return createIntentResponse(reservation.order, event);
    }
    if (
        !reservation.created &&
        TERMINAL_STATUSES.has(reservation.order.status)
    ) {
        return createIntentResponse(reservation.order, event);
    }

    const paymentIntent =
        paymentMode() === "simulated"
            ? { id: `pi_sim_${orderId}`, client_secret: null }
            : await (
                  await getStripe()
              ).paymentIntents.create(
                  {
                      amount: amountInCents,
                      currency: CURRENCY,
                      metadata: { orderId, userId, checkoutRequestId },
                      receipt_email: customerEmail,
                      automatic_payment_methods: { enabled: true },
                  },
                  {
                      idempotencyKey: `ai-pavilion-${userId}-${checkoutRequestId}`,
                  },
              );

    await attachPaymentIntent(orderId, paymentIntent);
    return createIntentResponse(
        {
            ...draft,
            paymentIntentId: paymentIntent.id,
            clientSecret: paymentIntent.client_secret || null,
            status: "pending",
        },
        event,
    );
}

async function transitionOrder(orderId, targetStatus, extra = {}) {
    const order = await loadOrder(orderId);
    if (!order) {
        return { applied: false, reason: "missing" };
    }
    const eventCreatedAt = Number.isFinite(extra.eventCreatedAt)
        ? extra.eventCreatedAt
        : Math.floor(Date.now() / 1000);
    if (
        Number.isFinite(order.lastPaymentEventCreatedAt) &&
        eventCreatedAt < order.lastPaymentEventCreatedAt
    ) {
        return { applied: false, reason: "out_of_order", order };
    }
    if (order.status === targetStatus) {
        return { applied: false, reason: "duplicate", order };
    }
    if (!ALLOWED_TRANSITIONS[order.status]?.has(targetStatus)) {
        return { applied: false, reason: "stale", order };
    }
    try {
        await dynamo.send(
            new UpdateItemCommand({
                TableName: ORDERS_TABLE,
                Key: marshall({ orderId }),
                UpdateExpression:
                    "SET #status = :target, updatedAt = :updatedAt, lastPaymentEventId = :eventId, lastPaymentEventCreatedAt = :eventCreatedAt",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: marshall(
                    {
                        ":target": targetStatus,
                        ":current": order.status,
                        ":updatedAt": new Date().toISOString(),
                        ":eventId": extra.eventId || "manual-confirmation",
                        ":eventCreatedAt": eventCreatedAt,
                    },
                    { removeUndefinedValues: true },
                ),
                ConditionExpression:
                    "#status = :current AND (attribute_not_exists(lastPaymentEventCreatedAt) OR lastPaymentEventCreatedAt <= :eventCreatedAt)",
            }),
        );
        return {
            applied: true,
            order: {
                ...order,
                status: targetStatus,
                lastPaymentEventId: extra.eventId || "manual-confirmation",
                lastPaymentEventCreatedAt: eventCreatedAt,
            },
        };
    } catch (error) {
        if (error.name === "ConditionalCheckFailedException") {
            return { applied: false, reason: "concurrent" };
        }
        throw error;
    }
}

async function confirmOrder(body, userId, event) {
    if (!hasExactShape(body, ["orderId", "paymentIntentId"])) {
        return validationError("Unexpected confirmation fields", event);
    }
    const { orderId, paymentIntentId } = body;
    if (!orderId || !paymentIntentId) {
        return validationError("Missing orderId or paymentIntentId", event);
    }
    if (!userId) {
        return respond(
            401,
            { error: "UNAUTHORIZED", message: "Authentication required" },
            event,
        );
    }
    const order = await loadOrder(orderId);
    if (!order) {
        return respond(
            404,
            { error: "ORDER_NOT_FOUND", message: "Order not found" },
            event,
        );
    }
    if (order.userId !== userId) {
        return respond(
            403,
            { error: "FORBIDDEN", message: "Order access denied" },
            event,
        );
    }
    if (order.paymentIntentId !== paymentIntentId) {
        return respond(
            403,
            {
                error: "ORDER_MISMATCH",
                message: "Payment does not match order",
            },
            event,
        );
    }
    if (order.status === "paid") {
        return respond(200, { success: true, orderId, status: "paid" }, event);
    }
    if (paymentMode() === "disabled") {
        return respond(503, { error: "PAYMENTS_DISABLED" }, event);
    }
    if (paymentMode() === "stripe") {
        const intent = await (
            await getStripe()
        ).paymentIntents.retrieve(paymentIntentId);
        if (intent.status !== "succeeded") {
            return respond(
                402,
                {
                    error: "PAYMENT_NOT_COMPLETED",
                    message: `Payment status: ${intent.status}`,
                },
                event,
            );
        }
        if (
            intent.metadata.orderId !== orderId ||
            intent.metadata.userId !== userId
        ) {
            return respond(403, { error: "ORDER_MISMATCH" }, event);
        }
    }
    const result = await transitionOrder(orderId, "paid");
    if (result.reason === "stale") {
        return respond(409, { error: "INVALID_ORDER_STATE" }, event);
    }
    return respond(200, { success: true, orderId, status: "paid" }, event);
}

async function claimWebhookEvent(stripeEvent) {
    const nowEpoch = Math.floor(Date.now() / 1000);
    const leaseToken = randomUUID();
    const leaseExpiresAt = nowEpoch + WEBHOOK_LEASE_SECONDS;
    const item = {
        eventId: stripeEvent.id,
        eventType: stripeEvent.type,
        status: "processing",
        attempts: 1,
        claimedAt: new Date().toISOString(),
        leaseToken,
        leaseExpiresAt,
        stripeCreatedAt: stripeEvent.created || nowEpoch,
        createdAt: new Date().toISOString(),
        ttl: nowEpoch + 30 * 24 * 60 * 60,
    };
    try {
        await dynamo.send(
            new PutItemCommand({
                TableName: PAYMENT_EVENTS_TABLE,
                Item: marshall(item),
                ConditionExpression: "attribute_not_exists(eventId)",
            }),
        );
        return { claimed: true, leaseToken };
    } catch (error) {
        if (error.name !== "ConditionalCheckFailedException") {
            throw error;
        }
    }

    const existingResult = await dynamo.send(
        new GetItemCommand({
            TableName: PAYMENT_EVENTS_TABLE,
            Key: marshall({ eventId: stripeEvent.id }),
            ConsistentRead: true,
        }),
    );
    const existing = existingResult.Item
        ? unmarshall(existingResult.Item)
        : null;
    if (!existing || existing.status === "processed") {
        return { claimed: false, reason: "duplicate" };
    }
    const expired =
        existing.status === "processing" &&
        Number(existing.leaseExpiresAt || 0) < nowEpoch;
    if (existing.status !== "failed" && !expired) {
        return { claimed: false, reason: "in_flight" };
    }

    try {
        await dynamo.send(
            new UpdateItemCommand({
                TableName: PAYMENT_EVENTS_TABLE,
                Key: marshall({ eventId: stripeEvent.id }),
                UpdateExpression:
                    "SET #status = :processing, eventType = :eventType, claimedAt = :claimedAt, leaseToken = :leaseToken, leaseExpiresAt = :leaseExpiresAt, stripeCreatedAt = :stripeCreatedAt ADD attempts :one REMOVE failedAt, failureReason, processedAt",
                ConditionExpression:
                    "#status = :failed OR (#status = :processing AND leaseExpiresAt < :nowEpoch)",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: marshall({
                    ":processing": "processing",
                    ":failed": "failed",
                    ":eventType": stripeEvent.type,
                    ":claimedAt": new Date().toISOString(),
                    ":leaseToken": leaseToken,
                    ":leaseExpiresAt": leaseExpiresAt,
                    ":stripeCreatedAt": stripeEvent.created || nowEpoch,
                    ":nowEpoch": nowEpoch,
                    ":one": 1,
                }),
            }),
        );
        return { claimed: true, leaseToken, reclaimed: true };
    } catch (error) {
        if (error.name === "ConditionalCheckFailedException") {
            return { claimed: false, reason: "concurrent" };
        }
        throw error;
    }
}

async function markWebhookEventProcessed(
    eventId,
    leaseToken,
    transitionResult,
) {
    await dynamo.send(
        new UpdateItemCommand({
            TableName: PAYMENT_EVENTS_TABLE,
            Key: marshall({ eventId }),
            UpdateExpression:
                "SET #status = :processed, processedAt = :processedAt, transitionResult = :transitionResult REMOVE leaseToken, leaseExpiresAt",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: marshall({
                ":processed": "processed",
                ":processedAt": new Date().toISOString(),
                ":transitionResult": transitionResult || "ignored",
                ":processing": "processing",
                ":leaseToken": leaseToken,
            }),
            ConditionExpression:
                "#status = :processing AND leaseToken = :leaseToken",
        }),
    );
}

async function failWebhookEvent(eventId, leaseToken, error) {
    await dynamo.send(
        new UpdateItemCommand({
            TableName: PAYMENT_EVENTS_TABLE,
            Key: marshall({ eventId }),
            UpdateExpression:
                "SET #status = :failed, failedAt = :failedAt, failureReason = :failureReason REMOVE leaseToken, leaseExpiresAt",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: marshall({
                ":failed": "failed",
                ":failedAt": new Date().toISOString(),
                ":failureReason": String(
                    error?.message || "Webhook processing failed",
                ).slice(0, 500),
                ":processing": "processing",
                ":leaseToken": leaseToken,
            }),
            ConditionExpression:
                "#status = :processing AND leaseToken = :leaseToken",
        }),
    );
}

async function handleWebhook(event) {
    if (paymentMode() !== "stripe") {
        return respond(503, { error: "WEBHOOKS_DISABLED" }, event);
    }
    const signature = getHeader(event, "stripe-signature");
    if (!signature) {
        return respond(400, { error: "MISSING_SIGNATURE" }, event);
    }
    let webhookSecret;
    try {
        webhookSecret = (await getStripeConfiguration()).stripeWebhookSecret;
    } catch (error) {
        console.error("Stripe configuration could not be loaded", error?.name);
        return respond(503, { error: "SERVICE_NOT_CONFIGURED" }, event);
    }
    if (!webhookSecret) {
        return respond(503, { error: "SERVICE_NOT_CONFIGURED" }, event);
    }
    const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body || "", "base64").toString("utf8")
        : event.body || "";
    let stripeEvent;
    try {
        stripeEvent = (await getStripe()).webhooks.constructEvent(
            rawBody,
            signature,
            webhookSecret,
        );
    } catch {
        return respond(400, { error: "INVALID_SIGNATURE" }, event);
    }
    const claim = await claimWebhookEvent(stripeEvent);
    if (!claim.claimed) {
        return respond(
            200,
            { received: true, duplicate: true, reason: claim.reason },
            event,
        );
    }

    try {
        const orderId = stripeEvent.data?.object?.metadata?.orderId;
        const targetByType = {
            "payment_intent.succeeded": "paid",
            "payment_intent.payment_failed": "failed",
            "payment_intent.canceled": "cancelled",
        };
        const target = targetByType[stripeEvent.type];
        let transitionResult = "ignored";
        if (orderId && target) {
            const result = await transitionOrder(orderId, target, {
                eventId: stripeEvent.id,
                eventCreatedAt: stripeEvent.created,
            });
            transitionResult = result.applied ? "applied" : result.reason;
        }
        await markWebhookEventProcessed(
            stripeEvent.id,
            claim.leaseToken,
            transitionResult,
        );
        return respond(200, { received: true }, event);
    } catch (error) {
        await failWebhookEvent(stripeEvent.id, claim.leaseToken, error).catch(
            () => undefined,
        );
        throw error;
    }
}

async function getOrder(orderId, userId, event) {
    if (!orderId) {
        return validationError("Missing orderId", event);
    }
    if (!userId) {
        return respond(401, { error: "UNAUTHORIZED" }, event);
    }
    const order = await loadOrder(orderId);
    if (!order) {
        return respond(404, { error: "ORDER_NOT_FOUND" }, event);
    }
    if (order.userId !== userId) {
        return respond(403, { error: "FORBIDDEN" }, event);
    }
    const safeOrder = { ...order };
    delete safeOrder.paymentIntentId;
    delete safeOrder.customerEmail;
    delete safeOrder.clientSecret;
    delete safeOrder.cartFingerprint;
    delete safeOrder.checkoutRequestId;
    return respond(200, safeOrder, event);
}

const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return preflight(event);
    }
    const path = event.path || event.rawPath || "";
    try {
        if (path === "/checkout/webhook" && event.httpMethod === "POST") {
            return await handleWebhook(event);
        }
        const parsed = parseJsonBody(event);
        if (parsed.error) {
            return validationError(parsed.error, event);
        }
        const body = parsed.value;
        const userId = getUserId(event);
        if (path === "/checkout/create-intent" && event.httpMethod === "POST") {
            return await createPaymentIntent(body, userId, event);
        }
        if (path === "/checkout/confirm-order" && event.httpMethod === "POST") {
            return await confirmOrder(body, userId, event);
        }
        const orderMatch = path.match(/^\/checkout\/order\/([^/]+)$/);
        if (orderMatch && event.httpMethod === "GET") {
            return await getOrder(
                decodeURIComponent(orderMatch[1]),
                userId,
                event,
            );
        }
        return respond(
            404,
            { error: "NOT_FOUND", message: "Route not found" },
            event,
        );
    } catch (error) {
        console.error("Unhandled checkout error:", error);
        return respond(
            500,
            {
                error: "INTERNAL_ERROR",
                message: "An unexpected error occurred",
            },
            event,
        );
    }
};

exports.handler = withObservability("checkout", handler);
exports.__private = {
    validateRequestedItems,
    productPriceInCents,
    resolveCatalogueItems,
    deterministicOrderId,
    cartFingerprint,
    transitionOrder,
    claimWebhookEvent,
    markWebhookEventProcessed,
    failWebhookEvent,
};
