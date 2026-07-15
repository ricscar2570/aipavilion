"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
    UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const { respond, preflight, corsHeaders } = require("../common/cors");
const { withObservability } = require("../common/observability");
const { parseJsonBody, hasExactShape } = require("../common/validation");
const { cleanText } = require("../common/domain");
const { identity, getMembership, hasRole } = require("../common/tenant");
const { writeAuditEvent } = require("../common/audit");
const {
    parseLimit,
    decodeCursor,
    encodeCursor,
} = require("../common/pagination");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const STANDS_TABLE = process.env.STANDS_TABLE;
const LEADS_TABLE = process.env.LEADS_TABLE;
const MEMBERSHIPS_TABLE = process.env.MEMBERSHIPS_TABLE;
const AUDIT_TABLE = process.env.AUDIT_TABLE;
const STAND_LEADS_INDEX = process.env.STAND_LEADS_INDEX || "stand-leads-index";
const STATUSES = new Set(["new", "contacted", "qualified", "closed", "spam"]);

async function loadAccessibleStand(actor, standId) {
    const result = await client.send(
        new GetCommand({ TableName: STANDS_TABLE, Key: { stand_id: standId } }),
    );
    const stand = result.Item;
    if (!stand) {
        return null;
    }
    if (stand.ownerUserId === actor.userId) {
        return stand;
    }
    const membership = await getMembership(
        client,
        MEMBERSHIPS_TABLE,
        actor.userId,
        stand.organizationId,
    );
    return hasRole(membership, ["owner", "organizer"]) ? stand : null;
}

function safeLead(item) {
    if (!item) {
        return null;
    }
    const { sourceHash: _sourceHash, ttl: _ttl, ...safe } = item;
    return safe;
}

async function queryLeads(event, actor, asCsv = false) {
    const params = event.queryStringParameters || {};
    const standId = cleanText(params.standId, 120);
    if (!standId) {
        return respond(400, { error: "STAND_ID_REQUIRED" }, event);
    }
    const stand = await loadAccessibleStand(actor, standId);
    if (!stand) {
        return respond(404, { error: "STAND_NOT_FOUND" }, event);
    }
    const limit = asCsv ? 1000 : parseLimit(params.limit, 50, 100);
    const cursor = asCsv ? undefined : decodeCursor(params.cursor);
    if (!asCsv && params.cursor && cursor === null) {
        return respond(400, { error: "INVALID_CURSOR" }, event);
    }
    const result = await client.send(
        new QueryCommand({
            TableName: LEADS_TABLE,
            IndexName: STAND_LEADS_INDEX,
            KeyConditionExpression: "standId = :standId",
            ExpressionAttributeValues: { ":standId": standId },
            ScanIndexForward: false,
            Limit: limit,
            ExclusiveStartKey: cursor,
        }),
    );
    const status = cleanText(params.status, 40);
    const leads = (result.Items || [])
        .filter((lead) => !status || lead.status === status)
        .map(safeLead);
    if (asCsv) {
        const quote = (value) =>
            `"${String(value ?? "")
                .replace(/"/g, '""')
                .replace(/\r?\n/g, " ")}"`;
        const rows = [
            [
                "leadId",
                "createdAt",
                "name",
                "email",
                "status",
                "assignedTo",
                "message",
            ],
            ...leads.map((lead) => [
                lead.leadId,
                lead.createdAt,
                lead.name,
                lead.email,
                lead.status,
                lead.assignedTo,
                lead.message,
            ]),
        ];
        return {
            statusCode: 200,
            headers: {
                ...corsHeaders(event),
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="leads-${standId}.csv"`,
            },
            body: rows.map((row) => row.map(quote).join(",")).join("\n"),
        };
    }
    return respond(
        200,
        {
            leads,
            count: leads.length,
            nextCursor: encodeCursor(result.LastEvaluatedKey),
        },
        event,
    );
}

async function updateLead(event, actor, leadId) {
    const leadResult = await client.send(
        new GetCommand({
            TableName: LEADS_TABLE,
            Key: { leadId },
            ConsistentRead: true,
        }),
    );
    const lead = leadResult.Item;
    if (!lead) {
        return respond(404, { error: "LEAD_NOT_FOUND" }, event);
    }
    const stand = await loadAccessibleStand(actor, lead.standId);
    if (!stand || stand.organizationId !== lead.organizationId) {
        return respond(404, { error: "LEAD_NOT_FOUND" }, event);
    }
    const parsed = parseJsonBody(event);
    if (
        parsed.error ||
        !hasExactShape(parsed.value, ["status", "notes", "assignedTo"])
    ) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const status = parsed.value.status || lead.status || "new";
    if (!STATUSES.has(status)) {
        return respond(400, { error: "INVALID_LEAD_STATUS" }, event);
    }
    let assignedTo = parsed.value.assignedTo ?? lead.assignedTo ?? null;
    if (assignedTo) {
        assignedTo = cleanText(assignedTo, 120);
        const assignee = await getMembership(
            client,
            MEMBERSHIPS_TABLE,
            assignedTo,
            lead.organizationId,
        );
        if (!hasRole(assignee, ["owner", "organizer", "exhibitor"])) {
            return respond(400, { error: "INVALID_ASSIGNEE" }, event);
        }
    }
    const now = new Date().toISOString();
    const result = await client.send(
        new UpdateCommand({
            TableName: LEADS_TABLE,
            Key: { leadId },
            UpdateExpression:
                "SET #status = :status, notes = :notes, assignedTo = :assignedTo, updatedAt = :now",
            ConditionExpression:
                "organizationId = :organizationId AND standId = :standId",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
                ":status": status,
                ":notes": cleanText(parsed.value.notes ?? lead.notes, 5000),
                ":assignedTo": assignedTo,
                ":now": now,
                ":organizationId": lead.organizationId,
                ":standId": lead.standId,
            },
            ReturnValues: "ALL_NEW",
        }),
    );
    await writeAuditEvent(client, AUDIT_TABLE, {
        organizationId: lead.organizationId,
        actorUserId: actor.userId,
        action: "lead.updated",
        resourceType: "lead",
        resourceId: leadId,
        requestId: event.requestId,
        metadata: { standId: lead.standId, status },
    });
    return respond(200, { lead: safeLead(result.Attributes) }, event);
}

const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return preflight(event);
    }
    const actor = identity(event);
    if (!actor.userId) {
        return respond(401, { error: "UNAUTHORIZED" }, event);
    }
    try {
        const path = event.path || "";
        if (path === "/exhibitor/leads" && event.httpMethod === "GET") {
            return queryLeads(event, actor, false);
        }
        if (path === "/exhibitor/leads/export" && event.httpMethod === "GET") {
            return queryLeads(event, actor, true);
        }
        const item = path.match(/^\/exhibitor\/leads\/([^/]+)$/);
        if (item && event.httpMethod === "PATCH") {
            return updateLead(event, actor, decodeURIComponent(item[1]));
        }
        return respond(404, { error: "NOT_FOUND" }, event);
    } catch (error) {
        if (error.name === "ConditionalCheckFailedException") {
            return respond(409, { error: "CONCURRENT_UPDATE" }, event);
        }
        console.error("Exhibitor leads API failed", error);
        return respond(500, { error: "INTERNAL_ERROR" }, event);
    }
};

exports.handler = withObservability("exhibitor-leads", handler);
