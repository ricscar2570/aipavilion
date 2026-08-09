"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    ScanCommand,
    UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
    SecretsManagerClient,
    GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const Stripe = require("stripe");
const { withObservability } = require("../common/observability");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secrets = new SecretsManagerClient({});
const PAYMENT_EVENTS_TABLE = process.env.PAYMENT_EVENTS_TABLE;
const ORDERS_TABLE = process.env.ORDERS_TABLE;
const ENTITLEMENTS_TABLE = process.env.ENTITLEMENTS_TABLE;
const PAYMENT_MODE = process.env.PAYMENT_MODE || "disabled";
const BILLING_MODE = process.env.BILLING_MODE || "disabled";
const MAX_ITEMS = Math.min(
    Math.max(Number.parseInt(process.env.RECONCILIATION_MAX_ITEMS || "100", 10), 1),
    500,
);
const STALE_ORDER_MINUTES = Math.min(
    Math.max(Number.parseInt(process.env.STALE_ORDER_MINUTES || "15", 10), 5),
    1440,
);
const MAX_SCAN_PAGES = Math.min(
    Math.max(Number.parseInt(process.env.RECONCILIATION_MAX_SCAN_PAGES || "20", 10), 1),
    100,
);

let stripeClient;

async function stripe() {
    if (stripeClient) return stripeClient;
    const secret = await secrets.send(
        new GetSecretValueCommand({
            SecretId: process.env.STRIPE_SECRET_KEY_ARN,
        }),
    );
    if (!secret.SecretString) throw new Error("Stripe secret is empty");
    const configuration = JSON.parse(secret.SecretString);
    if (!configuration.stripeSecretKey) {
        throw new Error("Stripe secret has an invalid shape");
    }
    stripeClient = new Stripe(configuration.stripeSecretKey, {
        apiVersion: "2024-04-10",
    });
    return stripeClient;
}

function subscriptionStatus(status) {
    if (["active", "trialing"].includes(status)) return "active";
    if (["past_due", "unpaid", "incomplete"].includes(status)) {
        return "past_due";
    }
    return "suspended";
}


async function scanCandidates(params) {
    const items = [];
    let lastKey;
    let pages = 0;
    do {
        const result = await client.send(
            new ScanCommand({
                ...params,
                Limit: MAX_ITEMS,
                ExclusiveStartKey: lastKey,
            }),
        );
        items.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
        pages += 1;
    } while (
        lastKey &&
        items.length < MAX_ITEMS &&
        pages < MAX_SCAN_PAGES
    );
    return items.slice(0, MAX_ITEMS);
}
function paymentIntentTarget(status) {
    if (status === "succeeded") return "paid";
    if (status === "canceled") return "cancelled";
    if (["requires_payment_method", "requires_action"].includes(status)) {
        return "failed";
    }
    return null;
}

async function expireAbandonedEventLeases(nowEpoch = Math.floor(Date.now() / 1000)) {
    const items = await scanCandidates({
        TableName: PAYMENT_EVENTS_TABLE,
        FilterExpression:
            "#status = :processing AND leaseExpiresAt < :nowEpoch",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
            ":processing": "processing",
            ":nowEpoch": nowEpoch,
        },
    });
    let expired = 0;
    for (const item of items) {
        try {
            await client.send(
                new UpdateCommand({
                    TableName: PAYMENT_EVENTS_TABLE,
                    Key: { eventId: item.eventId },
                    UpdateExpression:
                        "SET #status = :failed, failedAt = :failedAt, failureReason = :reason REMOVE leaseToken, leaseExpiresAt",
                    ConditionExpression:
                        "#status = :processing AND leaseExpiresAt < :nowEpoch",
                    ExpressionAttributeNames: { "#status": "status" },
                    ExpressionAttributeValues: {
                        ":processing": "processing",
                        ":failed": "failed",
                        ":failedAt": new Date().toISOString(),
                        ":reason": "LEASE_EXPIRED",
                        ":nowEpoch": nowEpoch,
                    },
                }),
            );
            expired += 1;
        } catch (error) {
            if (error.name !== "ConditionalCheckFailedException") throw error;
        }
    }
    return expired;
}

async function reconcileOrders() {
    if (PAYMENT_MODE !== "stripe") return { checked: 0, updated: 0, failed: 0 };
    const cutoff = new Date(
        Date.now() - STALE_ORDER_MINUTES * 60 * 1000,
    ).toISOString();
    const items = await scanCandidates({
        TableName: ORDERS_TABLE,
        FilterExpression:
            "#status IN (:creating, :pending) AND updatedAt < :cutoff",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
            ":creating": "creating",
            ":pending": "pending",
            ":cutoff": cutoff,
        },
    });
    const sdk = await stripe();
    let updated = 0;
    let failed = 0;
    for (const order of items) {
        if (!order.paymentIntentId) {
            if (order.status !== "creating") continue;
            try {
                await client.send(
                    new UpdateCommand({
                        TableName: ORDERS_TABLE,
                        Key: { orderId: order.orderId },
                        UpdateExpression:
                            "SET #status = :failed, updatedAt = :now, reconciliationReason = :reason",
                        ConditionExpression:
                            "#status = :creating AND updatedAt = :previousUpdatedAt",
                        ExpressionAttributeNames: { "#status": "status" },
                        ExpressionAttributeValues: {
                            ":creating": "creating",
                            ":failed": "failed",
                            ":previousUpdatedAt": order.updatedAt,
                            ":now": new Date().toISOString(),
                            ":reason": "PAYMENT_INTENT_NOT_ATTACHED",
                        },
                    }),
                );
                updated += 1;
            } catch (error) {
                if (error.name !== "ConditionalCheckFailedException") throw error;
            }
            continue;
        }
        let intent;
        try {
            intent = await sdk.paymentIntents.retrieve(order.paymentIntentId);
        } catch {
            failed += 1;
            continue;
        }
        const target = paymentIntentTarget(intent.status);
        if (!target || target === order.status) continue;
        try {
            await client.send(
                new UpdateCommand({
                    TableName: ORDERS_TABLE,
                    Key: { orderId: order.orderId },
                    UpdateExpression:
                        "SET #status = :target, updatedAt = :now, lastPaymentEventId = :eventId, lastPaymentEventCreatedAt = :eventCreatedAt, lastReconciledAt = :now",
                    ConditionExpression: "#status = :current",
                    ExpressionAttributeNames: { "#status": "status" },
                    ExpressionAttributeValues: {
                        ":target": target,
                        ":current": order.status,
                        ":now": new Date().toISOString(),
                        ":eventId": `reconcile:${intent.id}`,
                        ":eventCreatedAt": Math.floor(Date.now() / 1000),
                    },
                }),
            );
            updated += 1;
        } catch (error) {
            if (error.name !== "ConditionalCheckFailedException") throw error;
        }
    }
    return { checked: items.length, updated, failed };
}

async function reconcileEntitlements() {
    if (BILLING_MODE !== "stripe") return { checked: 0, updated: 0, failed: 0 };
    const items = await scanCandidates({
        TableName: ENTITLEMENTS_TABLE,
        FilterExpression:
            "billingSource = :stripe AND attribute_exists(stripeSubscriptionId)",
        ExpressionAttributeValues: { ":stripe": "stripe" },
    });
    const sdk = await stripe();
    let updated = 0;
    let failed = 0;
    for (const entitlement of items) {
        let subscription;
        try {
            subscription = await sdk.subscriptions.retrieve(
                entitlement.stripeSubscriptionId,
            );
        } catch {
            failed += 1;
            continue;
        }
        const status = subscriptionStatus(subscription.status);
        const validUntil = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null;
        const reconciledAt = new Date().toISOString();
        const reconciliationEpoch = Math.floor(Date.now() / 1000);
        try {
            await client.send(
                new UpdateCommand({
                    TableName: ENTITLEMENTS_TABLE,
                    Key: { organizationId: entitlement.organizationId },
                    UpdateExpression:
                        "SET #status = :status, validUntil = :validUntil, lastReconciledAt = :now, lastStripeEventId = :eventId, lastStripeEventCreatedAt = :eventCreatedAt",
                    ConditionExpression:
                        "stripeSubscriptionId = :subscriptionId",
                    ExpressionAttributeNames: { "#status": "status" },
                    ExpressionAttributeValues: {
                        ":status": status,
                        ":validUntil": validUntil,
                        ":now": reconciledAt,
                        ":eventId": `reconcile:${subscription.id}`,
                        ":eventCreatedAt": reconciliationEpoch,
                        ":subscriptionId": entitlement.stripeSubscriptionId,
                    },
                }),
            );
            updated += 1;
        } catch (error) {
            if (error.name !== "ConditionalCheckFailedException") throw error;
        }
    }
    return { checked: items.length, updated, failed };
}

const run = async () => {
    const expiredEventLeases = await expireAbandonedEventLeases();
    const orders = await reconcileOrders();
    const entitlements = await reconcileEntitlements();
    return { expiredEventLeases, orders, entitlements };
};

exports.handler = withObservability("payment-reconciliation", run);
exports.__private = {
    paymentIntentTarget,
    subscriptionStatus,
    expireAbandonedEventLeases,
    reconcileOrders,
    reconcileEntitlements,
    scanCandidates,
};
