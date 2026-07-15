"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const { respond, preflight } = require("../common/cors");
const { withObservability } = require("../common/observability");
const { publicEvent } = require("../common/domain");
const { toPublicStand } = require("../common/catalog");
const {
    parseLimit,
    decodeCursor,
    encodeCursor,
} = require("../common/pagination");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const EVENTS_TABLE = process.env.EVENTS_TABLE;
const STANDS_TABLE = process.env.STANDS_TABLE;
const PUBLIC_EVENTS_INDEX =
    process.env.PUBLIC_EVENTS_INDEX || "public-events-index";
const EVENT_STANDS_INDEX =
    process.env.EVENT_STANDS_INDEX || "event-stands-index";

async function listEvents(event) {
    const params = event.queryStringParameters || {};
    const limit = parseLimit(params.limit, 20, 100);
    const cursor = decodeCursor(params.cursor);
    if (params.cursor && cursor === null) {
        return respond(400, { error: "INVALID_CURSOR" }, event);
    }
    const result = await client.send(
        new QueryCommand({
            TableName: EVENTS_TABLE,
            IndexName: PUBLIC_EVENTS_INDEX,
            KeyConditionExpression: "publicStatus = :published",
            ExpressionAttributeValues: { ":published": "published" },
            ScanIndexForward: true,
            Limit: limit,
            ExclusiveStartKey: cursor,
        }),
    );
    const events = (result.Items || []).map(publicEvent).filter(Boolean);
    return respond(
        200,
        {
            events,
            count: events.length,
            nextCursor: encodeCursor(result.LastEvaluatedKey),
        },
        event,
    );
}

async function getEvent(event, eventId) {
    const result = await client.send(
        new GetCommand({ TableName: EVENTS_TABLE, Key: { eventId } }),
    );
    const safe = publicEvent(result.Item);
    if (!safe) {
        return respond(404, { error: "EVENT_NOT_FOUND" }, event);
    }
    return respond(200, { event: safe }, event);
}

async function listEventStands(event, eventId) {
    const eventResult = await client.send(
        new GetCommand({ TableName: EVENTS_TABLE, Key: { eventId } }),
    );
    if (!publicEvent(eventResult.Item)) {
        return respond(404, { error: "EVENT_NOT_FOUND" }, event);
    }
    const params = event.queryStringParameters || {};
    const limit = parseLimit(params.limit, 30, 100);
    const cursor = decodeCursor(params.cursor);
    if (params.cursor && cursor === null) {
        return respond(400, { error: "INVALID_CURSOR" }, event);
    }
    const result = await client.send(
        new QueryCommand({
            TableName: STANDS_TABLE,
            IndexName: EVENT_STANDS_INDEX,
            KeyConditionExpression:
                "eventId = :eventId AND begins_with(publicationKey, :published)",
            ExpressionAttributeValues: {
                ":eventId": eventId,
                ":published": "published#",
            },
            ScanIndexForward: false,
            Limit: limit,
            ExclusiveStartKey: cursor,
        }),
    );
    const stands = (result.Items || []).map(toPublicStand).filter(Boolean);
    return respond(
        200,
        {
            event: publicEvent(eventResult.Item),
            stands,
            count: stands.length,
            nextCursor: encodeCursor(result.LastEvaluatedKey),
        },
        event,
    );
}

const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return preflight(event);
    }
    try {
        const path = event.path || "";
        if (path === "/events" && event.httpMethod === "GET") {
            return listEvents(event);
        }
        const stands = path.match(/^\/events\/([^/]+)\/stands$/);
        if (stands && event.httpMethod === "GET") {
            return listEventStands(event, decodeURIComponent(stands[1]));
        }
        const item = path.match(/^\/events\/([^/]+)$/);
        if (item && event.httpMethod === "GET") {
            return getEvent(event, decodeURIComponent(item[1]));
        }
        return respond(404, { error: "NOT_FOUND" }, event);
    } catch (error) {
        console.error("Public events API failed", error);
        return respond(500, { error: "INTERNAL_ERROR" }, event);
    }
};

exports.handler = withObservability("public-events", handler);
