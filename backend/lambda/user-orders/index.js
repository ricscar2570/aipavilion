"use strict";

const { withObservability } = require("../common/observability");

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const { respond, preflight } = require("../common/cors");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ORDERS_TABLE = process.env.ORDERS_TABLE || "ai-pavilion-orders";
const USER_ORDERS_INDEX = process.env.USER_ORDERS_INDEX || "user-orders-index";
const MAX_LIMIT = 50;

function getUserId(event) {
    return event.requestContext?.authorizer?.claims?.sub || null;
}

function parseLimit(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return 10;
    }
    return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

function decodeCursor(cursor) {
    if (!cursor) {
        return undefined;
    }
    try {
        return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    } catch {
        return null;
    }
}

function encodeCursor(key) {
    if (!key) {
        return null;
    }
    return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return preflight(event);
    }

    const userId = getUserId(event);
    if (!userId) {
        return respond(
            401,
            { error: "UNAUTHORIZED", message: "Authentication required" },
            event,
        );
    }

    const params = event.queryStringParameters || {};
    const exclusiveStartKey = decodeCursor(params.cursor);
    if (params.cursor && exclusiveStartKey === null) {
        return respond(
            400,
            { error: "VALIDATION_ERROR", message: "Invalid cursor" },
            event,
        );
    }

    try {
        const result = await client.send(
            new QueryCommand({
                TableName: ORDERS_TABLE,
                IndexName: USER_ORDERS_INDEX,
                KeyConditionExpression: "userId = :userId",
                ExpressionAttributeValues: { ":userId": userId },
                Limit: parseLimit(params.limit),
                ScanIndexForward: false,
                ExclusiveStartKey: exclusiveStartKey,
            }),
        );

        const orders = (result.Items || []).map((item) => {
            const order = { ...item };
            delete order.paymentIntentId;
            delete order.customerEmail;
            delete order.clientSecret;
            delete order.cartFingerprint;
            delete order.checkoutRequestId;
            delete order.userId;
            return order;
        });
        return respond(
            200,
            {
                orders,
                count: orders.length,
                nextCursor: encodeCursor(result.LastEvaluatedKey),
            },
            event,
        );
    } catch (error) {
        console.error("Failed to list user orders:", error);
        return respond(
            500,
            { error: "INTERNAL_ERROR", message: "Failed to load orders" },
            event,
        );
    }
};

exports.handler = withObservability("user-orders", handler);
