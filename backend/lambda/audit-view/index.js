"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const { respond, preflight } = require("../common/cors");
const { withObservability } = require("../common/observability");
const { authorizeOrganization } = require("../common/tenant");
const {
    parseLimit,
    decodeCursor,
    encodeCursor,
} = require("../common/pagination");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const MEMBERSHIPS_TABLE = process.env.MEMBERSHIPS_TABLE;
const AUDIT_TABLE = process.env.AUDIT_TABLE;
const ORGANIZATION_AUDIT_INDEX =
    process.env.ORGANIZATION_AUDIT_INDEX || "organization-audit-index";

function safeAudit(item) {
    if (!item) {
        return null;
    }
    const { ttl: _ttl, ...safe } = item;
    return safe;
}

async function listAudit(event, organizationId) {
    const auth = await authorizeOrganization({
        event,
        client,
        membershipsTable: MEMBERSHIPS_TABLE,
        organizationId,
        roles: ["owner", "organizer"],
    });
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const params = event.queryStringParameters || {};
    const limit = parseLimit(params.limit, 50, 100);
    const cursor = decodeCursor(params.cursor);
    if (params.cursor && cursor === null) {
        return respond(400, { error: "INVALID_CURSOR" }, event);
    }
    const values = { ":organizationId": organizationId };
    let keyCondition = "organizationId = :organizationId";
    if (params.before) {
        const before = new Date(params.before);
        if (Number.isNaN(before.getTime())) {
            return respond(400, { error: "INVALID_BEFORE" }, event);
        }
        values[":before"] = before.toISOString();
        keyCondition += " AND createdAt < :before";
    }
    const result = await client.send(
        new QueryCommand({
            TableName: AUDIT_TABLE,
            IndexName: ORGANIZATION_AUDIT_INDEX,
            KeyConditionExpression: keyCondition,
            ExpressionAttributeValues: values,
            ScanIndexForward: false,
            Limit: limit,
            ExclusiveStartKey: cursor,
        }),
    );
    const action = String(params.action || "").trim();
    const events = (result.Items || [])
        .filter((item) => !action || item.action === action)
        .map(safeAudit);
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

const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return preflight(event);
    }
    const match = (event.path || "").match(/^\/organizations\/([^/]+)\/audit$/);
    if (match && event.httpMethod === "GET") {
        return listAudit(event, decodeURIComponent(match[1]));
    }
    return respond(404, { error: "NOT_FOUND" }, event);
};

exports.handler = withObservability("audit-view", handler);
