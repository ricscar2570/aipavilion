"use strict";

const { withObservability } = require("../common/observability");

const {
    CognitoIdentityProviderClient,
    AdminDeleteUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    QueryCommand,
    BatchWriteCommand,
    UpdateCommand,
    DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { respond, preflight } = require("../common/cors");

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const USERS_TABLE = process.env.USERS_TABLE || "ai-pavilion-users";
const ORDERS_TABLE = process.env.ORDERS_TABLE || "ai-pavilion-orders";
const SAVED_STANDS_TABLE =
    process.env.SAVED_STANDS_TABLE || "ai-pavilion-saved-stands";

function authIdentity(event) {
    const claims = event.requestContext?.authorizer?.claims || {};
    return {
        userId: claims.sub || null,
        username: claims["cognito:username"] || claims.username || null,
    };
}

async function queryAll(params) {
    const items = [];
    let cursor;
    do {
        const result = await dynamo.send(
            new QueryCommand({
                ...params,
                ExclusiveStartKey: cursor,
            }),
        );
        items.push(...(result.Items || []));
        cursor = result.LastEvaluatedKey;
    } while (cursor);
    return items;
}

async function deleteSavedStands(userId) {
    const items = await queryAll({
        TableName: SAVED_STANDS_TABLE,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
        ProjectionExpression: "userId, standId",
    });

    for (let index = 0; index < items.length; index += 25) {
        const batch = items.slice(index, index + 25);
        let requestItems = {
            [SAVED_STANDS_TABLE]: batch.map((item) => ({
                DeleteRequest: {
                    Key: { userId: item.userId, standId: item.standId },
                },
            })),
        };

        for (
            let attempt = 0;
            attempt < 5 && requestItems[SAVED_STANDS_TABLE]?.length;
            attempt += 1
        ) {
            const result = await dynamo.send(
                new BatchWriteCommand({ RequestItems: requestItems }),
            );
            requestItems = result.UnprocessedItems || {};
        }

        if (requestItems[SAVED_STANDS_TABLE]?.length) {
            throw new Error("Unable to delete all saved stands");
        }
    }
}

async function anonymizeOrders(userId) {
    const orders = await queryAll({
        TableName: ORDERS_TABLE,
        IndexName: "user-orders-index",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
        ProjectionExpression: "orderId",
    });

    for (const order of orders) {
        await dynamo.send(
            new UpdateCommand({
                TableName: ORDERS_TABLE,
                Key: { orderId: order.orderId },
                UpdateExpression:
                    "SET userId = :anonymousUserId, updatedAt = :updatedAt REMOVE customerEmail",
                ExpressionAttributeValues: {
                    ":anonymousUserId": `deleted#${order.orderId}`,
                    ":updatedAt": new Date().toISOString(),
                },
                ConditionExpression: "attribute_exists(orderId)",
            }),
        );
    }
}

const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return preflight(event);
    }
    if (event.httpMethod !== "DELETE") {
        return respond(
            405,
            { error: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
            event,
        );
    }

    const { userId, username } = authIdentity(event);
    if (!userId || !username) {
        return respond(
            401,
            { error: "UNAUTHORIZED", message: "Authentication required" },
            event,
        );
    }
    if (!USER_POOL_ID) {
        console.error("COGNITO_USER_POOL_ID is not configured");
        return respond(
            503,
            {
                error: "SERVICE_NOT_CONFIGURED",
                message: "Account service unavailable",
            },
            event,
        );
    }

    try {
        // Execute cleanup in a deterministic, retry-safe order. A retry can safely
        // repeat each step because deletes and order anonymisation are idempotent.
        await deleteSavedStands(userId);
        await anonymizeOrders(userId);
        await dynamo.send(
            new DeleteCommand({ TableName: USERS_TABLE, Key: { userId } }),
        );

        try {
            await cognito.send(
                new AdminDeleteUserCommand({
                    UserPoolId: USER_POOL_ID,
                    Username: username,
                }),
            );
        } catch (error) {
            if (error?.name !== "UserNotFoundException") {
                throw error;
            }
        }

        return {
            statusCode: 204,
            headers: { ...respond(200, {}, event).headers },
            body: "",
        };
    } catch (error) {
        console.error("Account deletion failed:", error);
        return respond(
            500,
            {
                error: "ACCOUNT_DELETION_FAILED",
                message: "Account deletion could not be completed",
            },
            event,
        );
    }
};

exports.handler = withObservability("user-account", handler);
