"use strict";

const { withObservability } = require("../common/observability");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const { respond, preflight } = require("../common/cors");
const { isPublicStand, toPublicStand } = require("../common/catalog");
const {
    parseLimit,
    decodeCursor,
    encodeCursor,
} = require("../common/pagination");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const STANDS_TABLE = process.env.STANDS_TABLE || "ai-pavilion-stands";
const PUBLIC_STANDS_INDEX =
    process.env.PUBLIC_STANDS_INDEX || "public-stands-index";
const EVENT_STANDS_INDEX =
    process.env.EVENT_STANDS_INDEX || "event-stands-index";

const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return preflight(event);
    }
    const params = event.queryStringParameters || {};
    const limit = parseLimit(params.limit, 30, 100);
    const cursor = decodeCursor(params.cursor);
    if (params.cursor && cursor === null) {
        return respond(400, { error: "INVALID_CURSOR" }, event);
    }
    const eventId = String(params.eventId || "")
        .trim()
        .slice(0, 120);
    try {
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
                Limit: limit,
                ExclusiveStartKey: cursor,
            }),
        );
        let items = (result.Items || [])
            .filter(isPublicStand)
            .map(toPublicStand);
        if ((event.path || "").includes("/sponsored")) {
            items = items.filter((stand) => stand.is_sponsored === true);
        }
        return respond(
            200,
            {
                stands: items,
                count: items.length,
                nextCursor: encodeCursor(result.LastEvaluatedKey),
            },
            event,
        );
    } catch (error) {
        console.error("Error fetching stands:", error);
        return respond(500, { error: "INTERNAL_ERROR" }, event);
    }
};

exports.handler = withObservability("get-stands", handler);
