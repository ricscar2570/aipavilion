"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const { respond, preflight, corsHeaders } = require("../common/cors");
const { withObservability } = require("../common/observability");
const { parseJsonBody, hasExactShape } = require("../common/validation");
const { cleanText } = require("../common/domain");
const { identity, getMembership, hasRole } = require("../common/tenant");
const { transactWithAudit } = require("../common/audit");
const {
    parseLimit,
    decodeCursor,
    encodeCursor,
} = require("../common/pagination");
const {
    ExportLimitError,
    positiveInteger,
    csvDocument,
    queryAllPages,
    queryMatchingPage,
} = require("../common/export-utils");
const {
    expectedRevision,
    revisionOf,
    revisionHeaders,
    revisionCondition,
    nextRevision,
    isConditionalConflict,
} = require("../common/concurrency");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const STANDS_TABLE = process.env.STANDS_TABLE;
const LEADS_TABLE = process.env.LEADS_TABLE;
const MEMBERSHIPS_TABLE = process.env.MEMBERSHIPS_TABLE;
const AUDIT_TABLE = process.env.AUDIT_TABLE;
const STAND_LEADS_INDEX = process.env.STAND_LEADS_INDEX || "stand-leads-index";
const STATUSES = new Set(["new", "contacted", "qualified", "closed", "spam"]);
const SYNC_EXPORT_MAX_ROWS = positiveInteger(
    process.env.SYNC_EXPORT_MAX_ROWS,
    10000,
    1,
    50000,
);
const EXPORT_QUERY_PAGE_SIZE = positiveInteger(
    process.env.EXPORT_QUERY_PAGE_SIZE,
    250,
    25,
    1000,
);
const LIST_MAX_QUERY_PAGES = positiveInteger(
    process.env.LIST_MAX_QUERY_PAGES,
    100,
    1,
    1000,
);

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
    return { ...safe, revision: revisionOf(item) };
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

    const status = cleanText(params.status, 40);
    if (status && !STATUSES.has(status)) {
        return respond(400, { error: "INVALID_LEAD_STATUS" }, event);
    }
    const predicate = status ? (lead) => lead.status === status : () => true;
    const baseQuery = {
        TableName: LEADS_TABLE,
        IndexName: STAND_LEADS_INDEX,
        KeyConditionExpression: "standId = :standId",
        ExpressionAttributeValues: { ":standId": standId },
        ScanIndexForward: false,
    };

    if (asCsv) {
        try {
            const result = await queryAllPages({
                client,
                QueryCommand,
                input: baseQuery,
                predicate,
                select: safeLead,
                maxItems: SYNC_EXPORT_MAX_ROWS,
                pageLimit: EXPORT_QUERY_PAGE_SIZE,
            });
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
                ...result.items.map((lead) => [
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
                    "X-Export-Row-Count": String(result.items.length),
                    "Cache-Control": "private, no-store",
                },
                body: csvDocument(rows),
            };
        } catch (error) {
            if (error instanceof ExportLimitError) {
                return respond(
                    413,
                    {
                        error: error.code,
                        message:
                            "The export exceeds the synchronous export threshold.",
                        maxRows: error.maxItems,
                        observedRows: error.observedItems,
                        asyncRequired: true,
                    },
                    event,
                );
            }
            throw error;
        }
    }

    const limit = parseLimit(params.limit, 50, 100);
    const cursor = decodeCursor(params.cursor);
    if (params.cursor && cursor === null) {
        return respond(400, { error: "INVALID_CURSOR" }, event);
    }
    const result = await queryMatchingPage({
        client,
        QueryCommand,
        input: { ...baseQuery, ExclusiveStartKey: cursor },
        predicate,
        select: safeLead,
        requestedLimit: limit,
        pageLimit: limit,
        maxPagesPerRequest: LIST_MAX_QUERY_PAGES,
    });
    return respond(
        200,
        {
            leads: result.items,
            count: result.items.length,
            requestedLimit: limit,
            nextCursor: encodeCursor(result.nextKey),
            pageCapReached: result.pageCapReached,
        },
        event,
    );
}

async function updateLead(event, actor, leadId) {
    const precondition = expectedRevision(event);
    if (!precondition.ok) {
        return respond(
            precondition.missing ? 428 : 400,
            { error: precondition.code },
            event,
        );
    }
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
    const notes = cleanText(parsed.value.notes ?? lead.notes, 5000);
    const newRevision = nextRevision(precondition.revision);
    const revision = revisionCondition({ expected: precondition.revision });
    try {
        await transactWithAudit(
            client,
            [
                {
                    Update: {
                        TableName: LEADS_TABLE,
                        Key: { leadId },
                        UpdateExpression:
                            "SET #status = :status, notes = :notes, assignedTo = :assignedTo, updatedAt = :now, #revision = :nextRevision",
                        ConditionExpression: `organizationId = :organizationId AND standId = :standId AND ${revision.expression}`,
                        ExpressionAttributeNames: {
                            "#status": "status",
                            "#revision": "revision",
                            ...revision.names,
                        },
                        ExpressionAttributeValues: {
                            ":status": status,
                            ":nextRevision": newRevision,
                            ...revision.values,
                            ":notes": notes,
                            ":assignedTo": assignedTo,
                            ":now": now,
                            ":organizationId": lead.organizationId,
                            ":standId": lead.standId,
                        },
                    },
                },
            ],
            AUDIT_TABLE,
            {
                organizationId: lead.organizationId,
                actorUserId: actor.userId,
                action: "lead.updated",
                resourceType: "lead",
                resourceId: leadId,
                requestId: event.requestId,
                metadata: { standId: lead.standId, status },
            },
        );
    } catch (error) {
        if (isConditionalConflict(error)) {
            return respond(
                409,
                {
                    error: "CONCURRENT_UPDATE",
                    expectedRevision: precondition.revision,
                    reloadRequired: true,
                },
                event,
            );
        }
        throw error;
    }
    return respond(
        200,
        {
            lead: safeLead({
                ...lead,
                revision: newRevision,
                status,
                notes,
                assignedTo,
                updatedAt: now,
            }),
        },
        event,
        revisionHeaders(newRevision),
    );
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
        if (isConditionalConflict(error)) {
            return respond(409, { error: "CONCURRENT_UPDATE" }, event);
        }
        console.error("Exhibitor leads API failed", error);
        return respond(500, { error: "INTERNAL_ERROR" }, event);
    }
};

exports.handler = withObservability("exhibitor-leads", handler);
