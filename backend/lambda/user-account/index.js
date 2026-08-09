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
const MEMBERSHIPS_TABLE =
    process.env.MEMBERSHIPS_TABLE || "ai-pavilion-memberships";
const STANDS_TABLE = process.env.STANDS_TABLE || "ai-pavilion-stands";
const OWNER_STANDS_INDEX = process.env.OWNER_STANDS_INDEX || "owner-stands-index";

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
            new QueryCommand({ ...params, ExclusiveStartKey: cursor }),
        );
        items.push(...(result.Items || []));
        cursor = result.LastEvaluatedKey;
    } while (cursor);
    return items;
}

async function deletionReadiness(userId) {
    const [memberships, ownedStands] = await Promise.all([
        queryAll({
            TableName: MEMBERSHIPS_TABLE,
            KeyConditionExpression: "userId = :userId",
            ExpressionAttributeValues: { ":userId": userId },
            ProjectionExpression:
                "userId, organizationId, #role, #status",
            ExpressionAttributeNames: { "#role": "role", "#status": "status" },
        }),
        queryAll({
            TableName: STANDS_TABLE,
            IndexName: OWNER_STANDS_INDEX,
            KeyConditionExpression: "ownerUserId = :userId",
            ExpressionAttributeValues: { ":userId": userId },
            ProjectionExpression: "stand_id, organizationId, eventId, #name",
            ExpressionAttributeNames: { "#name": "name" },
        }),
    ]);

    const ownedOrganizations = memberships
        .filter((item) => item.role === "owner")
        .map((item) => item.organizationId);
    const blockers = [];
    if (ownedOrganizations.length) {
        blockers.push({
            code: "OWNERSHIP_TRANSFER_REQUIRED",
            organizationIds: ownedOrganizations,
        });
    }
    if (ownedStands.length) {
        blockers.push({
            code: "STAND_REASSIGNMENT_REQUIRED",
            stands: ownedStands.map((item) => ({
                standId: item.stand_id,
                organizationId: item.organizationId,
                eventId: item.eventId,
                name: item.name,
            })),
        });
    }
    return { ready: blockers.length === 0, blockers, memberships };
}

async function batchDelete(tableName, keys) {
    for (let index = 0; index < keys.length; index += 25) {
        const batch = keys.slice(index, index + 25);
        let requestItems = {
            [tableName]: batch.map((Key) => ({ DeleteRequest: { Key } })),
        };
        for (
            let attempt = 0;
            attempt < 6 && requestItems[tableName]?.length;
            attempt += 1
        ) {
            const result = await dynamo.send(
                new BatchWriteCommand({ RequestItems: requestItems }),
            );
            requestItems = result.UnprocessedItems || {};
            if (requestItems[tableName]?.length) {
                await new Promise((resolve) =>
                    setTimeout(resolve, Math.min(50 * 2 ** attempt, 1000)),
                );
            }
        }
        if (requestItems[tableName]?.length) {
            throw new Error(`Unable to delete all items from ${tableName}`);
        }
    }
}

async function deleteSavedStands(userId) {
    const items = await queryAll({
        TableName: SAVED_STANDS_TABLE,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
        ProjectionExpression: "userId, standId",
    });
    await batchDelete(
        SAVED_STANDS_TABLE,
        items.map((item) => ({ userId: item.userId, standId: item.standId })),
    );
}

async function deleteMemberships(memberships) {
    await batchDelete(
        MEMBERSHIPS_TABLE,
        memberships.map((item) => ({
            userId: item.userId,
            organizationId: item.organizationId,
        })),
    );
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
    if (event.httpMethod === "OPTIONS") return preflight(event);
    if (!["GET", "DELETE"].includes(event.httpMethod)) {
        return respond(405, { error: "METHOD_NOT_ALLOWED" }, event);
    }

    const { userId, username } = authIdentity(event);
    if (!userId || !username) {
        return respond(401, { error: "UNAUTHORIZED" }, event);
    }
    if (!USER_POOL_ID) {
        return respond(503, { error: "SERVICE_NOT_CONFIGURED" }, event);
    }

    try {
        const readiness = await deletionReadiness(userId);
        if (event.httpMethod === "GET") {
            return respond(
                200,
                { ready: readiness.ready, blockers: readiness.blockers },
                event,
            );
        }
        if (!readiness.ready) {
            return respond(
                409,
                {
                    error: "ACCOUNT_DELETION_BLOCKED",
                    blockers: readiness.blockers,
                },
                event,
            );
        }

        await deleteSavedStands(userId);
        await anonymizeOrders(userId);
        await deleteMemberships(readiness.memberships);
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
            if (error?.name !== "UserNotFoundException") throw error;
        }
        return {
            statusCode: 204,
            headers: { ...respond(200, {}, event).headers },
            body: "",
        };
    } catch (error) {
        console.error("Account deletion failed:", error);
        return respond(500, { error: "ACCOUNT_DELETION_FAILED" }, event);
    }
};

exports.handler = withObservability("user-account", handler);
