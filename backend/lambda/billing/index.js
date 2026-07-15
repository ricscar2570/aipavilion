"use strict";

const { createHash } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
    SecretsManagerClient,
    GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const Stripe = require("stripe");
const { respond, preflight } = require("../common/cors");
const { withObservability } = require("../common/observability");
const { parseJsonBody, hasExactShape } = require("../common/validation");
const { cleanText, validId } = require("../common/domain");
const { authorizeOrganization } = require("../common/tenant");
const { writeAuditEvent } = require("../common/audit");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secrets = new SecretsManagerClient({});
const ORGANIZATIONS_TABLE = process.env.ORGANIZATIONS_TABLE;
const MEMBERSHIPS_TABLE = process.env.MEMBERSHIPS_TABLE;
const ENTITLEMENTS_TABLE = process.env.ENTITLEMENTS_TABLE;
const PAYMENT_EVENTS_TABLE = process.env.PAYMENT_EVENTS_TABLE;
const AUDIT_TABLE = process.env.AUDIT_TABLE;
const BILLING_MODE = process.env.BILLING_MODE || "disabled";
const PRICE_MAP = JSON.parse(process.env.STRIPE_PRICE_MAP || "{}");
const APP_URL = process.env.APP_URL || "http://127.0.0.1:3000";

const PLAN_LIMITS = {
    pilot: {
        maxActiveEvents: 1,
        maxStandsPerEvent: 20,
        features: {
            whiteLabel: false,
            advancedAnalytics: false,
            leadExport: true,
        },
    },
    starter: {
        maxActiveEvents: 3,
        maxStandsPerEvent: 50,
        features: {
            whiteLabel: false,
            advancedAnalytics: false,
            leadExport: true,
        },
    },
    professional: {
        maxActiveEvents: 10,
        maxStandsPerEvent: 250,
        features: {
            whiteLabel: true,
            advancedAnalytics: true,
            leadExport: true,
        },
    },
};

let stripeClient;
let stripeConfiguration;

function header(event, name) {
    const target = name.toLowerCase();
    const key = Object.keys(event.headers || {}).find(
        (candidate) => candidate.toLowerCase() === target,
    );
    return key ? event.headers[key] : undefined;
}

async function stripeConfig() {
    if (stripeConfiguration) {
        return stripeConfiguration;
    }
    const result = await secrets.send(
        new GetSecretValueCommand({
            SecretId: process.env.STRIPE_SECRET_KEY_ARN,
        }),
    );
    if (!result.SecretString) {
        throw new Error("Stripe secret is empty");
    }
    stripeConfiguration = JSON.parse(result.SecretString);
    return stripeConfiguration;
}

async function stripe() {
    if (!stripeClient) {
        const configuration = await stripeConfig();
        stripeClient = new Stripe(configuration.stripeSecretKey, {
            apiVersion: "2024-04-10",
        });
    }
    return stripeClient;
}

function publicEntitlement(item) {
    if (!item) {
        return null;
    }
    const {
        stripeCustomerId: _stripeCustomerId,
        stripeSubscriptionId: _stripeSubscriptionId,
        stripePriceId: _stripePriceId,
        ...safe
    } = item;
    return safe;
}

function validReturnUrl(value) {
    try {
        const candidate = new URL(value, APP_URL);
        const allowed = new URL(APP_URL);
        return candidate.origin === allowed.origin
            ? candidate.toString()
            : null;
    } catch {
        return null;
    }
}

async function authorize(event, organizationId) {
    return authorizeOrganization({
        event,
        client,
        membershipsTable: MEMBERSHIPS_TABLE,
        organizationId,
        roles: ["owner", "organizer"],
    });
}

async function loadOrganization(organizationId) {
    const result = await client.send(
        new GetCommand({
            TableName: ORGANIZATIONS_TABLE,
            Key: { organizationId },
            ConsistentRead: true,
        }),
    );
    return result.Item || null;
}

async function getBilling(event, organizationId) {
    const auth = await authorize(event, organizationId);
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const result = await client.send(
        new GetCommand({
            TableName: ENTITLEMENTS_TABLE,
            Key: { organizationId },
            ConsistentRead: true,
        }),
    );
    if (!result.Item) {
        return respond(404, { error: "ENTITLEMENT_NOT_FOUND" }, event);
    }
    return respond(200, { entitlement: publicEntitlement(result.Item) }, event);
}

async function ensureCustomer(organization, billingEmail) {
    if (organization.stripeCustomerId) {
        return organization.stripeCustomerId;
    }
    const sdk = await stripe();
    const customer = await sdk.customers.create(
        {
            email: billingEmail || organization.ownerEmail || undefined,
            name: organization.name,
            metadata: { organizationId: organization.organizationId },
        },
        { idempotencyKey: `customer-${organization.organizationId}` },
    );
    await client.send(
        new UpdateCommand({
            TableName: ORGANIZATIONS_TABLE,
            Key: { organizationId: organization.organizationId },
            UpdateExpression:
                "SET stripeCustomerId = if_not_exists(stripeCustomerId, :customer), billingEmail = if_not_exists(billingEmail, :email), updatedAt = :now",
            ExpressionAttributeValues: {
                ":customer": customer.id,
                ":email": billingEmail || organization.ownerEmail || null,
                ":now": new Date().toISOString(),
            },
        }),
    );
    return customer.id;
}

async function createCheckout(event, organizationId) {
    const auth = await authorize(event, organizationId);
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    if (BILLING_MODE === "disabled") {
        return respond(503, { error: "BILLING_DISABLED" }, event);
    }
    const parsed = parseJsonBody(event);
    if (
        parsed.error ||
        !hasExactShape(parsed.value, [
            "plan",
            "billingEmail",
            "successUrl",
            "cancelUrl",
        ])
    ) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const plan = cleanText(parsed.value.plan, 40);
    const billingEmail = cleanText(
        parsed.value.billingEmail,
        254,
    ).toLowerCase();
    const successUrl = validReturnUrl(parsed.value.successUrl);
    const cancelUrl = validReturnUrl(parsed.value.cancelUrl);
    if (!PLAN_LIMITS[plan] || !successUrl || !cancelUrl) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const organization = await loadOrganization(organizationId);
    if (!organization || organization.status !== "active") {
        return respond(404, { error: "ORGANIZATION_NOT_FOUND" }, event);
    }
    if (BILLING_MODE === "simulated") {
        const now = new Date().toISOString();
        await applyPlan({
            organizationId,
            plan,
            status: "active",
            validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
            source: "simulated",
            updatedAt: now,
        });
        await writeAuditEvent(client, AUDIT_TABLE, {
            organizationId,
            actorUserId: auth.actor.userId,
            action: "billing.simulated_checkout",
            resourceType: "entitlement",
            resourceId: organizationId,
            requestId: event.requestId,
            metadata: { plan },
        });
        return respond(
            201,
            {
                sessionId: `sim_${organizationId}_${plan}`,
                url: successUrl,
                simulated: true,
            },
            event,
        );
    }
    const priceId = PRICE_MAP[plan];
    if (!priceId) {
        return respond(409, { error: "PLAN_NOT_CONFIGURED" }, event);
    }
    const sdk = await stripe();
    const customerId = await ensureCustomer(organization, billingEmail);
    const idempotencyKey =
        header(event, "Idempotency-Key") ||
        createHash("sha256")
            .update(`${organizationId}:${plan}:${auth.actor.userId}`)
            .digest("hex");
    const session = await sdk.checkout.sessions.create(
        {
            mode: "subscription",
            customer: customerId,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: successUrl,
            cancel_url: cancelUrl,
            client_reference_id: organizationId,
            metadata: { organizationId, plan },
            subscription_data: { metadata: { organizationId, plan } },
            allow_promotion_codes: true,
        },
        { idempotencyKey: `billing-${idempotencyKey}` },
    );
    await writeAuditEvent(client, AUDIT_TABLE, {
        organizationId,
        actorUserId: auth.actor.userId,
        action: "billing.checkout_created",
        resourceType: "billing_session",
        resourceId: session.id,
        requestId: event.requestId,
        metadata: { plan },
    });
    return respond(201, { sessionId: session.id, url: session.url }, event);
}

async function createPortal(event, organizationId) {
    const auth = await authorize(event, organizationId);
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    if (BILLING_MODE !== "stripe") {
        return respond(503, { error: "BILLING_PORTAL_UNAVAILABLE" }, event);
    }
    const parsed = parseJsonBody(event);
    if (parsed.error || !hasExactShape(parsed.value, ["returnUrl"])) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const returnUrl = validReturnUrl(parsed.value.returnUrl);
    if (!returnUrl) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const organization = await loadOrganization(organizationId);
    if (!organization?.stripeCustomerId) {
        return respond(409, { error: "BILLING_CUSTOMER_NOT_FOUND" }, event);
    }
    const sdk = await stripe();
    const session = await sdk.billingPortal.sessions.create({
        customer: organization.stripeCustomerId,
        return_url: returnUrl,
    });
    return respond(201, { url: session.url }, event);
}

async function claimEvent(eventId, type) {
    const key = { eventId: `billing#${eventId}` };
    try {
        await client.send(
            new PutCommand({
                TableName: PAYMENT_EVENTS_TABLE,
                Item: {
                    ...key,
                    type,
                    status: "processing",
                    attempts: 1,
                    createdAt: new Date().toISOString(),
                    ttl: Math.floor(Date.now() / 1000) + 90 * 86400,
                },
                ConditionExpression: "attribute_not_exists(eventId)",
            }),
        );
        return true;
    } catch (error) {
        if (error.name !== "ConditionalCheckFailedException") {
            throw error;
        }
    }

    const existing = await client.send(
        new GetCommand({
            TableName: PAYMENT_EVENTS_TABLE,
            Key: key,
            ConsistentRead: true,
        }),
    );
    if (existing.Item?.status !== "failed") {
        return false;
    }

    try {
        await client.send(
            new UpdateCommand({
                TableName: PAYMENT_EVENTS_TABLE,
                Key: key,
                UpdateExpression:
                    "SET #status = :processing, #type = :type, lastAttemptAt = :now ADD attempts :one REMOVE failureReason, failedAt",
                ConditionExpression: "#status = :failed",
                ExpressionAttributeNames: {
                    "#status": "status",
                    "#type": "type",
                },
                ExpressionAttributeValues: {
                    ":processing": "processing",
                    ":failed": "failed",
                    ":type": type,
                    ":now": new Date().toISOString(),
                    ":one": 1,
                },
            }),
        );
        return true;
    } catch (error) {
        if (error.name === "ConditionalCheckFailedException") {
            return false;
        }
        throw error;
    }
}

async function completeEvent(eventId) {
    await client.send(
        new UpdateCommand({
            TableName: PAYMENT_EVENTS_TABLE,
            Key: { eventId: `billing#${eventId}` },
            UpdateExpression: "SET #status = :processed, processedAt = :now",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
                ":processed": "processed",
                ":now": new Date().toISOString(),
            },
        }),
    );
}

async function failEvent(eventId, error) {
    const reason = cleanText(
        error?.message || "Webhook processing failed",
        500,
    );
    await client.send(
        new UpdateCommand({
            TableName: PAYMENT_EVENTS_TABLE,
            Key: { eventId: `billing#${eventId}` },
            UpdateExpression:
                "SET #status = :failed, failedAt = :now, failureReason = :reason",
            ConditionExpression: "#status = :processing",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
                ":processing": "processing",
                ":failed": "failed",
                ":now": new Date().toISOString(),
                ":reason": reason,
            },
        }),
    );
}

async function applyPlan({
    organizationId,
    plan,
    status,
    validUntil,
    source,
    customerId,
    subscriptionId,
    priceId,
    updatedAt,
}) {
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.pilot;
    await client.send(
        new UpdateCommand({
            TableName: ENTITLEMENTS_TABLE,
            Key: { organizationId },
            UpdateExpression:
                "SET #plan = :plan, #status = :status, maxActiveEvents = :maxEvents, maxStandsPerEvent = :maxStands, features = :features, validFrom = if_not_exists(validFrom, :now), validUntil = :validUntil, billingSource = :source, stripeCustomerId = :customerId, stripeSubscriptionId = :subscriptionId, stripePriceId = :priceId, updatedAt = :now, schemaVersion = :schemaVersion",
            ExpressionAttributeNames: { "#plan": "plan", "#status": "status" },
            ExpressionAttributeValues: {
                ":plan": plan,
                ":status": status,
                ":maxEvents": limits.maxActiveEvents,
                ":maxStands": limits.maxStandsPerEvent,
                ":features": limits.features,
                ":validUntil": validUntil || null,
                ":source": source,
                ":customerId": customerId || null,
                ":subscriptionId": subscriptionId || null,
                ":priceId": priceId || null,
                ":now": updatedAt || new Date().toISOString(),
                ":schemaVersion": 2,
            },
        }),
    );
}

function planFromSubscription(subscription) {
    return (
        subscription.metadata?.plan ||
        Object.entries(PRICE_MAP).find(
            ([, id]) => id === subscription.items?.data?.[0]?.price?.id,
        )?.[0] ||
        "pilot"
    );
}

function entitlementStatus(stripeStatus) {
    if (["active", "trialing"].includes(stripeStatus)) {
        return "active";
    }
    if (["past_due", "unpaid", "incomplete"].includes(stripeStatus)) {
        return "past_due";
    }
    return "suspended";
}

async function processStripeEvent(stripeEvent) {
    const object = stripeEvent.data.object;
    if (stripeEvent.type === "checkout.session.completed") {
        const organizationId =
            object.metadata?.organizationId || object.client_reference_id;
        if (!validId(organizationId)) {
            return;
        }
        const plan = object.metadata?.plan || "pilot";
        await applyPlan({
            organizationId,
            plan,
            status: "active",
            validUntil: null,
            source: "stripe",
            customerId: object.customer,
            subscriptionId: object.subscription,
            updatedAt: new Date().toISOString(),
        });
        return;
    }
    if (
        stripeEvent.type === "customer.subscription.created" ||
        stripeEvent.type === "customer.subscription.updated" ||
        stripeEvent.type === "customer.subscription.deleted"
    ) {
        const organizationId = object.metadata?.organizationId;
        if (!validId(organizationId)) {
            return;
        }
        const plan = planFromSubscription(object);
        await applyPlan({
            organizationId,
            plan,
            status: entitlementStatus(object.status),
            validUntil: object.current_period_end
                ? new Date(object.current_period_end * 1000).toISOString()
                : null,
            source: "stripe",
            customerId: object.customer,
            subscriptionId: object.id,
            priceId: object.items?.data?.[0]?.price?.id,
            updatedAt: new Date().toISOString(),
        });
    }
}

async function webhook(event) {
    if (BILLING_MODE !== "stripe") {
        return respond(503, { error: "BILLING_DISABLED" }, event);
    }
    const configuration = await stripeConfig();
    const signature = header(event, "Stripe-Signature");
    if (!signature || !configuration.stripeBillingWebhookSecret) {
        return respond(400, { error: "INVALID_SIGNATURE" }, event);
    }
    const sdk = await stripe();
    let stripeEvent;
    try {
        stripeEvent = sdk.webhooks.constructEvent(
            event.isBase64Encoded
                ? Buffer.from(event.body || "", "base64")
                : event.body || "",
            signature,
            configuration.stripeBillingWebhookSecret,
        );
    } catch {
        return respond(400, { error: "INVALID_SIGNATURE" }, event);
    }
    const claimed = await claimEvent(stripeEvent.id, stripeEvent.type);
    if (!claimed) {
        return respond(200, { received: true, duplicate: true }, event);
    }
    try {
        await processStripeEvent(stripeEvent);
        await completeEvent(stripeEvent.id);
        return respond(200, { received: true }, event);
    } catch (error) {
        try {
            await failEvent(stripeEvent.id, error);
        } catch (stateError) {
            console.error("Could not mark billing event as failed", stateError);
        }
        throw error;
    }
}

const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return preflight(event);
    }
    try {
        if (event.path === "/billing/webhook" && event.httpMethod === "POST") {
            return webhook(event);
        }
        const checkoutMatch = (event.path || "").match(
            /^\/organizations\/([^/]+)\/billing\/checkout$/,
        );
        if (checkoutMatch && event.httpMethod === "POST") {
            return createCheckout(event, decodeURIComponent(checkoutMatch[1]));
        }
        const portalMatch = (event.path || "").match(
            /^\/organizations\/([^/]+)\/billing\/portal$/,
        );
        if (portalMatch && event.httpMethod === "POST") {
            return createPortal(event, decodeURIComponent(portalMatch[1]));
        }
        const billingMatch = (event.path || "").match(
            /^\/organizations\/([^/]+)\/billing$/,
        );
        if (billingMatch && event.httpMethod === "GET") {
            return getBilling(event, decodeURIComponent(billingMatch[1]));
        }
        return respond(404, { error: "NOT_FOUND" }, event);
    } catch (error) {
        console.error("Billing API failed", error);
        return respond(500, { error: "INTERNAL_ERROR" }, event);
    }
};

exports.handler = withObservability("billing", handler);
exports.PLAN_LIMITS = PLAN_LIMITS;
exports.applyPlan = applyPlan;
exports.processStripeEvent = processStripeEvent;
exports.claimEvent = claimEvent;
exports.failEvent = failEvent;
