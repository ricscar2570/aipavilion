"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const { respond, preflight } = require("../common/cors");
const { withObservability } = require("../common/observability");
const { identity, listMemberships } = require("../common/tenant");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const USERS_TABLE = process.env.USERS_TABLE;
const ORDERS_TABLE = process.env.ORDERS_TABLE;
const SAVED_STANDS_TABLE = process.env.SAVED_STANDS_TABLE;
const MEMBERSHIPS_TABLE = process.env.MEMBERSHIPS_TABLE;
const USER_ORDERS_INDEX = process.env.USER_ORDERS_INDEX || "user-orders-index";
const USER_SAVED_INDEX = process.env.USER_SAVED_INDEX || "user-saved-index";

async function queryAll(params) {
    const items = [];
    let lastKey;
    do {
        const result = await client.send(
            new QueryCommand({ ...params, ExclusiveStartKey: lastKey }),
        );
        items.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    return items;
}

function sanitizeOrder(order) {
    const {
        clientSecret: _clientSecret,
        paymentIntentId: _paymentIntentId,
        customerEmail: _customerEmail,
        cartFingerprint: _cartFingerprint,
        checkoutRequestId: _checkoutRequestId,
        ...safe
    } = order;
    return safe;
}

async function exportUserData(event) {
    const actor = identity(event);
    if (!actor.userId) {
        return respond(401, { error: "UNAUTHORIZED" }, event);
    }
    const [profile, orders, saved, memberships] = await Promise.all([
        client.send(
            new GetCommand({
                TableName: USERS_TABLE,
                Key: { userId: actor.userId },
            }),
        ),
        queryAll({
            TableName: ORDERS_TABLE,
            IndexName: USER_ORDERS_INDEX,
            KeyConditionExpression: "userId = :userId",
            ExpressionAttributeValues: { ":userId": actor.userId },
        }),
        queryAll({
            TableName: SAVED_STANDS_TABLE,
            IndexName: USER_SAVED_INDEX,
            KeyConditionExpression: "userId = :userId",
            ExpressionAttributeValues: { ":userId": actor.userId },
        }),
        listMemberships(client, MEMBERSHIPS_TABLE, actor.userId, {
            limit: 100,
        }),
    ]);
    return respond(
        200,
        {
            exportVersion: 1,
            generatedAt: new Date().toISOString(),
            profile: profile.Item || null,
            memberships: memberships.items,
            orders: orders.map(sanitizeOrder),
            savedStands: saved,
        },
        event,
    );
}

const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return preflight(event);
    }
    if (event.path === "/user/export" && event.httpMethod === "GET") {
        return exportUserData(event);
    }
    return respond(404, { error: "NOT_FOUND" }, event);
};

exports.handler = withObservability("data-export", handler);
