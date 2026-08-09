"use strict";

const { withObservability } = require("../common/observability");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { respond, preflight } = require("../common/cors");
const { isPublicStand, toPublicStand, searchableText } = require("../common/catalog");
const { parseLimit, decodeCursor, encodeCursor } = require("../common/pagination");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const STANDS_TABLE = process.env.STANDS_TABLE || "ai-pavilion-stands";
const PUBLIC_STANDS_INDEX = process.env.PUBLIC_STANDS_INDEX || "public-stands-index";
const EVENT_STANDS_INDEX = process.env.EVENT_STANDS_INDEX || "event-stands-index";
const MAX_QUERY_LENGTH = 200;
const QUERY_PAGE_SIZE = 100;

function exclusiveKeyFor(item, eventId) {
    const key = {
        stand_id: item.stand_id,
        publicationKey: item.publicationKey,
    };
    if (eventId) {
        key.eventId = item.eventId;
    } else {
        key.publicStatus = item.publicStatus;
    }
    return key;
}

async function searchPages({ eventId, queryText, limit, cursor }) {
    const matches = [];
    let exclusiveStartKey = cursor || undefined;
    let scannedCount = 0;

    while (matches.length < limit) {
        const query = eventId
            ? {
                  TableName: STANDS_TABLE,
                  IndexName: EVENT_STANDS_INDEX,
                  KeyConditionExpression:
                      "eventId = :eventId AND begins_with(publicationKey, :published)",
                  ExpressionAttributeValues: {
                      ":eventId": eventId,
                      ":published": "published#",
                  },
              }
            : {
                  TableName: STANDS_TABLE,
                  IndexName: PUBLIC_STANDS_INDEX,
                  KeyConditionExpression: "publicStatus = :published",
                  ExpressionAttributeValues: { ":published": "published" },
              };
        const result = await docClient.send(
            new QueryCommand({
                ...query,
                ScanIndexForward: false,
                Limit: QUERY_PAGE_SIZE,
                ExclusiveStartKey: exclusiveStartKey,
            }),
        );
        const items = result.Items || [];
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            scannedCount += 1;
            if (isPublicStand(item) && searchableText(item).includes(queryText)) {
                matches.push(toPublicStand(item));
                if (matches.length === limit) {
                    const hasMore =
                        index < items.length - 1 || Boolean(result.LastEvaluatedKey);
                    return {
                        matches,
                        scannedCount,
                        nextCursor: hasMore
                            ? encodeCursor(exclusiveKeyFor(item, eventId))
                            : null,
                    };
                }
            }
        }
        if (!result.LastEvaluatedKey) {
            return { matches, scannedCount, nextCursor: null };
        }
        exclusiveStartKey = result.LastEvaluatedKey;
    }
    return { matches, scannedCount, nextCursor: encodeCursor(exclusiveStartKey) };
}

const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") return preflight(event);
    const params = event.queryStringParameters || {};
    const rawQuery = String(params.q || "").trim();
    if (!rawQuery) {
        return respond(400, { error: "VALIDATION_ERROR", message: "Missing search query parameter: q" }, event);
    }
    const queryText = rawQuery.slice(0, MAX_QUERY_LENGTH).toLocaleLowerCase("en");
    const eventId = String(params.eventId || "").trim().slice(0, 120);
    const limit = parseLimit(params.limit, 30, 100);
    const cursor = decodeCursor(params.cursor);
    if (params.cursor && cursor === null) return respond(400, { error: "INVALID_CURSOR" }, event);
    try {
        const result = await searchPages({ eventId, queryText, limit, cursor });
        return respond(200, {
            stands: result.matches,
            count: result.matches.length,
            scannedCount: result.scannedCount,
            query: rawQuery,
            nextCursor: result.nextCursor,
        }, event);
    } catch (error) {
        console.error("Error searching stands:", error);
        return respond(500, { error: "INTERNAL_ERROR" }, event);
    }
};

exports.handler = withObservability("search-stands", handler);
exports.searchPages = searchPages;
