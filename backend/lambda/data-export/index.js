"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const { respond, preflight } = require("../common/cors");
const { withObservability } = require("../common/observability");
const { identity } = require("../common/tenant");
const {
    ExportLimitError,
    positiveInteger,
    queryAllPages,
    approximateJsonBytes,
} = require("../common/export-utils");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const USERS_TABLE = process.env.USERS_TABLE;
const ORDERS_TABLE = process.env.ORDERS_TABLE;
const SAVED_STANDS_TABLE = process.env.SAVED_STANDS_TABLE;
const MEMBERSHIPS_TABLE = process.env.MEMBERSHIPS_TABLE;
const USER_ORDERS_INDEX = process.env.USER_ORDERS_INDEX || "user-orders-index";
const USER_SAVED_INDEX = process.env.USER_SAVED_INDEX || "user-saved-at-index";
const USER_EXPORT_MAX_ITEMS = positiveInteger(
    process.env.USER_EXPORT_MAX_ITEMS,
    25000,
    100,
    100000,
);
const USER_EXPORT_MAX_BYTES = positiveInteger(
    process.env.USER_EXPORT_MAX_BYTES,
    5 * 1024 * 1024,
    256 * 1024,
    8 * 1024 * 1024,
);
const USER_EXPORT_QUERY_PAGE_SIZE = positiveInteger(
    process.env.USER_EXPORT_QUERY_PAGE_SIZE,
    250,
    25,
    1000,
);

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

function exportTooLarge(event, error, extra = {}) {
    return respond(
        413,
        {
            error: error.code || "EXPORT_TOO_LARGE",
            message:
                "The personal data export exceeds the synchronous export threshold.",
            maxItems: error.maxItems || USER_EXPORT_MAX_ITEMS,
            observedItems: error.observedItems || null,
            maxBytes: USER_EXPORT_MAX_BYTES,
            asyncRequired: true,
            ...extra,
        },
        event,
        { "Cache-Control": "private, no-store" },
    );
}

async function exportUserData(event) {
    const actor = identity(event);
    if (!actor.userId) {
        return respond(401, { error: "UNAUTHORIZED" }, event);
    }

    try {
        const profilePromise = client.send(
            new GetCommand({
                TableName: USERS_TABLE,
                Key: { userId: actor.userId },
                ConsistentRead: true,
            }),
        );
        const query = (input, select = (item) => item) =>
            queryAllPages({
                client,
                QueryCommand,
                input,
                select,
                maxItems: USER_EXPORT_MAX_ITEMS,
                pageLimit: USER_EXPORT_QUERY_PAGE_SIZE,
            });
        const [profile, orders, saved, memberships] = await Promise.all([
            profilePromise,
            query(
                {
                    TableName: ORDERS_TABLE,
                    IndexName: USER_ORDERS_INDEX,
                    KeyConditionExpression: "userId = :userId",
                    ExpressionAttributeValues: { ":userId": actor.userId },
                },
                sanitizeOrder,
            ),
            query({
                TableName: SAVED_STANDS_TABLE,
                IndexName: USER_SAVED_INDEX,
                KeyConditionExpression: "userId = :userId",
                ExpressionAttributeValues: { ":userId": actor.userId },
            }),
            query({
                TableName: MEMBERSHIPS_TABLE,
                KeyConditionExpression: "userId = :userId",
                ExpressionAttributeValues: { ":userId": actor.userId },
            }),
        ]);

        const totalItems =
            orders.items.length + saved.items.length + memberships.items.length;
        if (totalItems > USER_EXPORT_MAX_ITEMS) {
            throw new ExportLimitError({
                maxItems: USER_EXPORT_MAX_ITEMS,
                observedItems: totalItems,
            });
        }

        const document = {
            exportVersion: 2,
            generatedAt: new Date().toISOString(),
            complete: true,
            profile: profile.Item || null,
            memberships: memberships.items,
            orders: orders.items,
            savedStands: saved.items,
            datasetCounts: {
                memberships: memberships.items.length,
                orders: orders.items.length,
                savedStands: saved.items.length,
                totalItems,
            },
            sourcePages: {
                memberships: memberships.pages,
                orders: orders.pages,
                savedStands: saved.pages,
            },
        };
        const bytes = approximateJsonBytes(document);
        if (bytes > USER_EXPORT_MAX_BYTES) {
            return exportTooLarge(
                event,
                new ExportLimitError({
                    code: "EXPORT_BYTE_LIMIT_EXCEEDED",
                    maxItems: USER_EXPORT_MAX_ITEMS,
                    observedItems: totalItems,
                }),
                { observedBytes: bytes },
            );
        }

        return respond(200, document, event, {
            "Cache-Control": "private, no-store",
            "Content-Disposition": `attachment; filename="ai-pavilion-user-${actor.userId}.json"`,
            "X-Export-Row-Count": String(totalItems),
        });
    } catch (error) {
        if (error instanceof ExportLimitError) {
            return exportTooLarge(event, error);
        }
        throw error;
    }
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
