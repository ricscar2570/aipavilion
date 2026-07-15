"use strict";

const { withObservability } = require("../common/observability");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    QueryCommand,
    GetCommand,
    PutCommand,
    DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { respond, preflight } = require("../common/cors");
const { isPublicStand } = require("../common/catalog");
const { parseJsonBody, hasExactShape } = require("../common/validation");
const {
    parseLimit,
    decodeCursor,
    encodeCursor,
} = require("../common/pagination");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.SAVED_STANDS_TABLE || "ai-pavilion-saved-stands";
const STANDS_TABLE = process.env.STANDS_TABLE || "ai-pavilion-stands";
const SAVED_AT_INDEX = process.env.SAVED_AT_INDEX || "user-saved-at-index";

function getUserId(event) {
    return event.requestContext?.authorizer?.claims?.sub || null;
}

async function listSavedStands(userId, event) {
    const params = event.queryStringParameters || {};
    const limit = parseLimit(params.limit, 25, 100);
    const cursor = decodeCursor(params.cursor);
    if (params.cursor && cursor === null) {
        return respond(400, { error: "INVALID_CURSOR" }, event);
    }

    const result = await docClient.send(
        new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: SAVED_AT_INDEX,
            KeyConditionExpression: "userId = :uid",
            ExpressionAttributeValues: { ":uid": userId },
            ScanIndexForward: false,
            Limit: limit,
            ExclusiveStartKey: cursor,
        }),
    );

    const stands = (result.Items || []).map(
        ({ userId: _userId, ...item }) => item,
    );
    return respond(
        200,
        {
            stands,
            count: stands.length,
            nextCursor: encodeCursor(result.LastEvaluatedKey),
        },
        event,
    );
}

async function saveStand(userId, body, event) {
    const parsedBody = parseJsonBody({ body });
    if (parsedBody.error || !hasExactShape(parsedBody.value, ["standId"])) {
        return respond(
            400,
            {
                error: "VALIDATION_ERROR",
                message: parsedBody.error || "Unexpected saved-stand fields",
            },
            event,
        );
    }
    const parsed = parsedBody.value;

    const standId = String(parsed.standId || "")
        .trim()
        .slice(0, 120);
    if (!standId) {
        return respond(
            400,
            { error: "VALIDATION_ERROR", message: "standId is required" },
            event,
        );
    }

    const standResult = await docClient.send(
        new GetCommand({
            TableName: STANDS_TABLE,
            Key: { stand_id: standId },
        }),
    );
    if (!isPublicStand(standResult.Item)) {
        return respond(404, { error: "STAND_NOT_FOUND" }, event);
    }

    const savedAt = new Date().toISOString();
    const item = {
        userId,
        standId,
        name: String(standResult.Item.name || "").slice(0, 200),
        imageUrl: String(standResult.Item.image_url || "").slice(0, 2048),
        savedAt,
        schemaVersion: 2,
    };
    await docClient.send(
        new PutCommand({
            TableName: TABLE_NAME,
            Item: item,
        }),
    );
    const { userId: _userId, ...publicItem } = item;
    return respond(201, { saved: true, stand: publicItem }, event);
}

async function deleteSavedStand(userId, standId, event) {
    if (!standId) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    await docClient.send(
        new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { userId, standId },
        }),
    );
    return respond(200, { deleted: true, standId }, event);
}

const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return preflight(event);
    }
    const userId = getUserId(event);
    if (!userId) {
        return respond(401, { error: "UNAUTHORIZED" }, event);
    }
    const method = event.httpMethod;
    const path = event.path || "";
    const deleteMatch = path.match(/\/user\/saved-stands\/([^/]+)$/);
    if (deleteMatch && method === "DELETE") {
        return deleteSavedStand(
            userId,
            decodeURIComponent(deleteMatch[1]),
            event,
        );
    }
    if (path === "/user/saved-stands" && method === "GET") {
        return listSavedStands(userId, event);
    }
    if (path === "/user/saved-stands" && method === "POST") {
        return saveStand(userId, event.body, event);
    }
    return respond(404, { error: "NOT_FOUND" }, event);
};

exports.handler = withObservability("user-saved-stands", handler);
