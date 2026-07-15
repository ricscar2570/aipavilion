"use strict";

const { randomUUID } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const { respond, preflight } = require("../common/cors");
const { withObservability } = require("../common/observability");
const { parseJsonBody, hasExactShape } = require("../common/validation");
const {
    cleanText,
    slugify,
    validIsoDate,
    validId,
} = require("../common/domain");
const { authorizeOrganization } = require("../common/tenant");
const { writeAuditEvent } = require("../common/audit");
const {
    parseLimit,
    decodeCursor,
    encodeCursor,
} = require("../common/pagination");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const EVENTS_TABLE = process.env.EVENTS_TABLE;
const STANDS_TABLE = process.env.STANDS_TABLE;
const MEMBERSHIPS_TABLE = process.env.MEMBERSHIPS_TABLE;
const ENTITLEMENTS_TABLE = process.env.ENTITLEMENTS_TABLE;
const AUDIT_TABLE = process.env.AUDIT_TABLE;
const ORGANIZATION_EVENTS_INDEX =
    process.env.ORGANIZATION_EVENTS_INDEX || "organization-events-index";
const EVENT_STANDS_INDEX =
    process.env.EVENT_STANDS_INDEX || "event-stands-index";

async function countActiveEvents(organizationId) {
    let count = 0;
    let lastKey;
    do {
        const result = await client.send(
            new QueryCommand({
                TableName: EVENTS_TABLE,
                IndexName: ORGANIZATION_EVENTS_INDEX,
                KeyConditionExpression: "organizationId = :organizationId",
                ExpressionAttributeValues: {
                    ":organizationId": organizationId,
                },
                ProjectionExpression: "eventId, #status",
                ExpressionAttributeNames: { "#status": "status" },
                ExclusiveStartKey: lastKey,
            }),
        );
        count += (result.Items || []).filter(
            (item) => item.status !== "archived",
        ).length;
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    return count;
}

async function ensureEventCapacity(organizationId) {
    const [entitlementResult, activeCount] = await Promise.all([
        client.send(
            new GetCommand({
                TableName: ENTITLEMENTS_TABLE,
                Key: { organizationId },
            }),
        ),
        countActiveEvents(organizationId),
    ]);
    const entitlement = entitlementResult.Item;
    if (!entitlement || entitlement.status !== "active") {
        return { ok: false, statusCode: 403, code: "ENTITLEMENT_REQUIRED" };
    }
    if (activeCount >= entitlement.maxActiveEvents) {
        return { ok: false, statusCode: 409, code: "EVENT_LIMIT_REACHED" };
    }
    return { ok: true, entitlement };
}

function eventIdFor() {
    return `evt_${randomUUID()}`;
}

function eventSummary(item) {
    if (!item) {
        return null;
    }
    const { internalNotes: _internalNotes, ...safe } = item;
    return safe;
}

async function authorize(
    event,
    organizationId,
    roles = ["owner", "organizer"],
) {
    return authorizeOrganization({
        event,
        client,
        membershipsTable: MEMBERSHIPS_TABLE,
        organizationId,
        roles,
    });
}

async function loadEvent(organizationId, eventId) {
    const result = await client.send(
        new GetCommand({
            TableName: EVENTS_TABLE,
            Key: { eventId },
            ConsistentRead: true,
        }),
    );
    if (!result.Item || result.Item.organizationId !== organizationId) {
        return null;
    }
    return result.Item;
}

async function createEvent(event, organizationId) {
    const auth = await authorize(event, organizationId);
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const parsed = parseJsonBody(event);
    if (
        parsed.error ||
        !hasExactShape(parsed.value, [
            "name",
            "slug",
            "description",
            "startsAt",
            "endsAt",
            "timezone",
            "visibility",
            "branding",
        ])
    ) {
        return respond(
            400,
            {
                error: "VALIDATION_ERROR",
                message: parsed.error || "Unexpected event fields",
            },
            event,
        );
    }
    const body = parsed.value;
    const name = cleanText(body.name, 160);
    const slug = cleanText(body.slug, 80) || slugify(name);
    const startsAt = cleanText(body.startsAt, 40);
    const endsAt = cleanText(body.endsAt, 40);
    const timezone = cleanText(body.timezone, 80) || "Europe/Rome";
    const visibility = body.visibility === "private" ? "private" : "public";
    if (
        !name ||
        !slug ||
        !validIsoDate(startsAt) ||
        !validIsoDate(endsAt) ||
        new Date(endsAt) <= new Date(startsAt)
    ) {
        return respond(
            400,
            {
                error: "VALIDATION_ERROR",
                message: "name and a valid start/end date range are required",
            },
            event,
        );
    }

    const capacity = await ensureEventCapacity(organizationId);
    if (!capacity.ok) {
        return respond(capacity.statusCode, { error: capacity.code }, event);
    }

    const now = new Date().toISOString();
    const item = {
        eventId: eventIdFor(),
        organizationId,
        name,
        slug,
        description: cleanText(body.description, 5000),
        startsAt,
        endsAt,
        timezone,
        visibility,
        status: "draft",
        publicStatus: "draft",
        branding:
            body.branding && typeof body.branding === "object"
                ? body.branding
                : {},
        createdBy: auth.actor.userId,
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
    };
    try {
        await client.send(
            new PutCommand({
                TableName: EVENTS_TABLE,
                Item: item,
                ConditionExpression: "attribute_not_exists(eventId)",
            }),
        );
        await writeAuditEvent(client, AUDIT_TABLE, {
            organizationId,
            actorUserId: auth.actor.userId,
            action: "event.created",
            resourceType: "event",
            resourceId: item.eventId,
            requestId: event.requestId,
        });
        return respond(201, { event: eventSummary(item) }, event);
    } catch (error) {
        if (error.name === "ConditionalCheckFailedException") {
            return respond(409, { error: "EVENT_CONFLICT" }, event);
        }
        throw error;
    }
}

async function listEvents(event, organizationId) {
    const auth = await authorize(event, organizationId, [
        "owner",
        "organizer",
        "exhibitor",
    ]);
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const params = event.queryStringParameters || {};
    const limit = parseLimit(params.limit, 25, 100);
    const cursor = decodeCursor(params.cursor);
    if (params.cursor && cursor === null) {
        return respond(400, { error: "INVALID_CURSOR" }, event);
    }
    const result = await client.send(
        new QueryCommand({
            TableName: EVENTS_TABLE,
            IndexName: ORGANIZATION_EVENTS_INDEX,
            KeyConditionExpression: "organizationId = :organizationId",
            ExpressionAttributeValues: {
                ":organizationId": organizationId,
            },
            ScanIndexForward: false,
            Limit: limit,
            ExclusiveStartKey: cursor,
        }),
    );
    return respond(
        200,
        {
            events: (result.Items || []).map(eventSummary),
            count: (result.Items || []).length,
            nextCursor: encodeCursor(result.LastEvaluatedKey),
        },
        event,
    );
}

async function getEvent(event, organizationId, eventId) {
    const auth = await authorize(event, organizationId, [
        "owner",
        "organizer",
        "exhibitor",
    ]);
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const item = await loadEvent(organizationId, eventId);
    if (!item) {
        return respond(404, { error: "EVENT_NOT_FOUND" }, event);
    }
    return respond(200, { event: eventSummary(item) }, event);
}

async function updateEvent(event, organizationId, eventId) {
    const auth = await authorize(event, organizationId);
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const existing = await loadEvent(organizationId, eventId);
    if (!existing) {
        return respond(404, { error: "EVENT_NOT_FOUND" }, event);
    }
    if (existing.status === "published") {
        return respond(
            409,
            {
                error: "PUBLISHED_EVENT_IMMUTABLE",
                message: "Published events cannot be moved back to draft",
            },
            event,
        );
    }
    const parsed = parseJsonBody(event);
    const allowed = [
        "name",
        "description",
        "startsAt",
        "endsAt",
        "timezone",
        "visibility",
        "branding",
    ];
    if (parsed.error || !hasExactShape(parsed.value, allowed)) {
        return respond(
            400,
            {
                error: "VALIDATION_ERROR",
                message: parsed.error || "Unexpected event fields",
            },
            event,
        );
    }
    const next = { ...existing };
    for (const key of allowed) {
        if (parsed.value[key] !== undefined) {
            next[key] = parsed.value[key];
        }
    }
    next.name = cleanText(next.name, 160);
    next.description = cleanText(next.description, 5000);
    next.timezone = cleanText(next.timezone, 80) || "Europe/Rome";
    next.visibility = next.visibility === "private" ? "private" : "public";
    if (
        !next.name ||
        !validIsoDate(next.startsAt) ||
        !validIsoDate(next.endsAt) ||
        new Date(next.endsAt) <= new Date(next.startsAt)
    ) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    next.updatedAt = new Date().toISOString();
    await client.send(
        new PutCommand({
            TableName: EVENTS_TABLE,
            Item: next,
            ConditionExpression:
                "organizationId = :organizationId AND #status = :expectedStatus",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
                ":organizationId": organizationId,
                ":expectedStatus": existing.status,
            },
        }),
    );
    await writeAuditEvent(client, AUDIT_TABLE, {
        organizationId,
        actorUserId: auth.actor.userId,
        action: "event.updated",
        resourceType: "event",
        resourceId: eventId,
        requestId: event.requestId,
    });
    return respond(200, { event: eventSummary(next) }, event);
}

async function publishEvent(event, organizationId, eventId) {
    const auth = await authorize(event, organizationId);
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const existing = await loadEvent(organizationId, eventId);
    if (!existing) {
        return respond(404, { error: "EVENT_NOT_FOUND" }, event);
    }
    const now = new Date().toISOString();
    const result = await client.send(
        new UpdateCommand({
            TableName: EVENTS_TABLE,
            Key: { eventId },
            UpdateExpression:
                "SET #status = :published, publicStatus = :publicStatus, publishedAt = if_not_exists(publishedAt, :now), updatedAt = :now",
            ConditionExpression:
                "organizationId = :organizationId AND #status IN (:draft, :published)",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
                ":published": "published",
                ":publicStatus":
                    existing.visibility === "public" ? "published" : "private",
                ":now": now,
                ":organizationId": organizationId,
                ":draft": "draft",
            },
            ReturnValues: "ALL_NEW",
        }),
    );
    await writeAuditEvent(client, AUDIT_TABLE, {
        organizationId,
        actorUserId: auth.actor.userId,
        action: "event.published",
        resourceType: "event",
        resourceId: eventId,
        requestId: event.requestId,
    });
    return respond(200, { event: eventSummary(result.Attributes) }, event);
}

async function duplicateEvent(event, organizationId, eventId) {
    const auth = await authorize(event, organizationId);
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const existing = await loadEvent(organizationId, eventId);
    if (!existing) {
        return respond(404, { error: "EVENT_NOT_FOUND" }, event);
    }
    const capacity = await ensureEventCapacity(organizationId);
    if (!capacity.ok) {
        return respond(capacity.statusCode, { error: capacity.code }, event);
    }
    const parsed = parseJsonBody(event);
    if (
        parsed.error ||
        !hasExactShape(parsed.value, ["name", "startsAt", "endsAt", "timezone"])
    ) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const name = cleanText(parsed.value.name, 160) || `${existing.name} copy`;
    const startsAt = cleanText(parsed.value.startsAt, 40);
    const endsAt = cleanText(parsed.value.endsAt, 40);
    const timezone =
        cleanText(parsed.value.timezone, 80) ||
        existing.timezone ||
        "Europe/Rome";
    if (
        !validIsoDate(startsAt) ||
        !validIsoDate(endsAt) ||
        new Date(endsAt) <= new Date(startsAt)
    ) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const now = new Date().toISOString();
    const copy = {
        eventId: eventIdFor(),
        organizationId,
        name,
        slug: slugify(name),
        description: existing.description || "",
        startsAt,
        endsAt,
        timezone,
        visibility: existing.visibility || "public",
        status: "draft",
        publicStatus: "draft",
        branding: existing.branding || {},
        duplicatedFrom: eventId,
        createdBy: auth.actor.userId,
        createdAt: now,
        updatedAt: now,
        schemaVersion: 2,
    };
    await client.send(
        new PutCommand({
            TableName: EVENTS_TABLE,
            Item: copy,
            ConditionExpression: "attribute_not_exists(eventId)",
        }),
    );
    await writeAuditEvent(client, AUDIT_TABLE, {
        organizationId,
        actorUserId: auth.actor.userId,
        action: "event.duplicated",
        resourceType: "event",
        resourceId: copy.eventId,
        requestId: event.requestId,
        metadata: { sourceEventId: eventId },
    });
    return respond(201, { event: eventSummary(copy) }, event);
}

async function archiveEvent(event, organizationId, eventId) {
    const auth = await authorize(event, organizationId);
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const existing = await loadEvent(organizationId, eventId);
    if (!existing) {
        return respond(404, { error: "EVENT_NOT_FOUND" }, event);
    }
    if (existing.status === "archived") {
        return respond(
            200,
            { event: eventSummary(existing), duplicate: true },
            event,
        );
    }
    const now = new Date().toISOString();
    const result = await client.send(
        new UpdateCommand({
            TableName: EVENTS_TABLE,
            Key: { eventId },
            UpdateExpression:
                "SET #status = :archived, publicStatus = :archived, archivedAt = :now, archivedBy = :actor, updatedAt = :now",
            ConditionExpression:
                "organizationId = :organizationId AND #status <> :archived",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
                ":archived": "archived",
                ":now": now,
                ":actor": auth.actor.userId,
                ":organizationId": organizationId,
            },
            ReturnValues: "ALL_NEW",
        }),
    );
    let lastKey;
    do {
        const stands = await client.send(
            new QueryCommand({
                TableName: STANDS_TABLE,
                IndexName: EVENT_STANDS_INDEX,
                KeyConditionExpression: "eventId = :eventId",
                ExpressionAttributeValues: { ":eventId": eventId },
                ExclusiveStartKey: lastKey,
            }),
        );
        for (const stand of stands.Items || []) {
            await client.send(
                new UpdateCommand({
                    TableName: STANDS_TABLE,
                    Key: { stand_id: stand.stand_id },
                    UpdateExpression:
                        "SET eventStatus = :archived, publicStatus = :draft, publicationKey = :key, updatedAt = :now, updated_at = :now",
                    ExpressionAttributeValues: {
                        ":archived": "archived",
                        ":draft": "draft",
                        ":key": `archived#${now}`,
                        ":now": now,
                    },
                }),
            );
        }
        lastKey = stands.LastEvaluatedKey;
    } while (lastKey);
    await writeAuditEvent(client, AUDIT_TABLE, {
        organizationId,
        actorUserId: auth.actor.userId,
        action: "event.archived",
        resourceType: "event",
        resourceId: eventId,
        requestId: event.requestId,
    });
    return respond(200, { event: eventSummary(result.Attributes) }, event);
}

async function listEventStands(event, organizationId, eventId) {
    const auth = await authorize(event, organizationId);
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const item = await loadEvent(organizationId, eventId);
    if (!item) {
        return respond(404, { error: "EVENT_NOT_FOUND" }, event);
    }
    const params = event.queryStringParameters || {};
    const limit = parseLimit(params.limit, 50, 100);
    const cursor = decodeCursor(params.cursor);
    if (params.cursor && cursor === null) {
        return respond(400, { error: "INVALID_CURSOR" }, event);
    }
    const result = await client.send(
        new QueryCommand({
            TableName: STANDS_TABLE,
            IndexName: EVENT_STANDS_INDEX,
            KeyConditionExpression: "eventId = :eventId",
            ExpressionAttributeValues: { ":eventId": eventId },
            ScanIndexForward: false,
            Limit: limit,
            ExclusiveStartKey: cursor,
        }),
    );
    return respond(
        200,
        {
            stands: result.Items || [],
            count: (result.Items || []).length,
            nextCursor: encodeCursor(result.LastEvaluatedKey),
        },
        event,
    );
}

async function moderateStand(event, organizationId, eventId, standId) {
    const auth = await authorize(event, organizationId);
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    if (!validId(standId)) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const eventItem = await loadEvent(organizationId, eventId);
    if (!eventItem) {
        return respond(404, { error: "EVENT_NOT_FOUND" }, event);
    }
    const parsed = parseJsonBody(event);
    if (
        parsed.error ||
        !hasExactShape(parsed.value, ["status", "moderationNote"])
    ) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const status = parsed.value.status;
    if (!["published", "rejected"].includes(status)) {
        return respond(400, { error: "INVALID_STAND_STATUS" }, event);
    }
    if (status === "published" && eventItem.status !== "published") {
        return respond(409, { error: "EVENT_NOT_PUBLISHED" }, event);
    }
    const standResult = await client.send(
        new GetCommand({
            TableName: STANDS_TABLE,
            Key: { stand_id: standId },
            ConsistentRead: true,
        }),
    );
    const stand = standResult.Item;
    if (
        !stand ||
        stand.organizationId !== organizationId ||
        stand.eventId !== eventId
    ) {
        return respond(404, { error: "STAND_NOT_FOUND" }, event);
    }
    if (stand.status !== "pending_review") {
        return respond(409, { error: "STAND_NOT_PENDING_REVIEW" }, event);
    }
    const now = new Date().toISOString();
    const publicStatus =
        status === "published" && stand.visibility === "public"
            ? "published"
            : "draft";
    try {
        const result = await client.send(
            new UpdateCommand({
                TableName: STANDS_TABLE,
                Key: { stand_id: standId },
                UpdateExpression:
                    "SET #status = :status, publicStatus = :publicStatus, eventStatus = :eventStatus, publicationKey = :publicationKey, moderationNote = :moderationNote, updatedAt = :now, updated_at = :now",
                ConditionExpression:
                    "organizationId = :organizationId AND eventId = :eventId AND #status = :pendingReview",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                    ":status": status,
                    ":publicStatus": publicStatus,
                    ":eventStatus": eventItem.status,
                    ":publicationKey": `${publicStatus === "published" ? "published" : status}#${now}`,
                    ":moderationNote": cleanText(
                        parsed.value.moderationNote,
                        2000,
                    ),
                    ":now": now,
                    ":organizationId": organizationId,
                    ":eventId": eventId,
                    ":pendingReview": "pending_review",
                },
                ReturnValues: "ALL_NEW",
            }),
        );
        await writeAuditEvent(client, AUDIT_TABLE, {
            organizationId,
            actorUserId: auth.actor.userId,
            action: `stand.${status}`,
            resourceType: "stand",
            resourceId: standId,
            requestId: event.requestId,
            metadata: { eventId },
        });
        return respond(200, { stand: result.Attributes }, event);
    } catch (error) {
        if (error.name === "ConditionalCheckFailedException") {
            return respond(404, { error: "STAND_NOT_FOUND" }, event);
        }
        throw error;
    }
}

const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return preflight(event);
    }
    try {
        const path = event.path || "";
        const method = event.httpMethod;
        const collection = path.match(/^\/organizations\/([^/]+)\/events$/);
        if (collection) {
            const organizationId = decodeURIComponent(collection[1]);
            if (method === "POST") {
                return createEvent(event, organizationId);
            }
            if (method === "GET") {
                return listEvents(event, organizationId);
            }
        }
        const item = path.match(/^\/organizations\/([^/]+)\/events\/([^/]+)$/);
        if (item) {
            const organizationId = decodeURIComponent(item[1]);
            const eventId = decodeURIComponent(item[2]);
            if (method === "GET") {
                return getEvent(event, organizationId, eventId);
            }
            if (method === "PUT") {
                return updateEvent(event, organizationId, eventId);
            }
        }
        const duplicate = path.match(
            /^\/organizations\/([^/]+)\/events\/([^/]+)\/duplicate$/,
        );
        if (duplicate && method === "POST") {
            return duplicateEvent(
                event,
                decodeURIComponent(duplicate[1]),
                decodeURIComponent(duplicate[2]),
            );
        }
        const archive = path.match(
            /^\/organizations\/([^/]+)\/events\/([^/]+)\/archive$/,
        );
        if (archive && method === "POST") {
            return archiveEvent(
                event,
                decodeURIComponent(archive[1]),
                decodeURIComponent(archive[2]),
            );
        }
        const publish = path.match(
            /^\/organizations\/([^/]+)\/events\/([^/]+)\/publish$/,
        );
        if (publish && method === "POST") {
            return publishEvent(
                event,
                decodeURIComponent(publish[1]),
                decodeURIComponent(publish[2]),
            );
        }
        const stands = path.match(
            /^\/organizations\/([^/]+)\/events\/([^/]+)\/stands$/,
        );
        if (stands && method === "GET") {
            return listEventStands(
                event,
                decodeURIComponent(stands[1]),
                decodeURIComponent(stands[2]),
            );
        }
        const moderation = path.match(
            /^\/organizations\/([^/]+)\/events\/([^/]+)\/stands\/([^/]+)\/moderation$/,
        );
        if (moderation && method === "PATCH") {
            return moderateStand(
                event,
                decodeURIComponent(moderation[1]),
                decodeURIComponent(moderation[2]),
                decodeURIComponent(moderation[3]),
            );
        }
        return respond(404, { error: "NOT_FOUND" }, event);
    } catch (error) {
        console.error("Events API failed", error);
        return respond(500, { error: "INTERNAL_ERROR" }, event);
    }
};

exports.handler = withObservability("events", handler);
