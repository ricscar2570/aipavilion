"use strict";

const { randomUUID } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
    UpdateCommand,
    TransactWriteCommand,
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
const { authorizeOrganization, getMembership } = require("../common/tenant");
const { buildAuditEvent, transactWithAudit } = require("../common/audit");
const {
    parseLimit,
    decodeCursor,
    encodeCursor,
} = require("../common/pagination");
const {
    expectedRevision,
    revisionOf,
    revisionHeaders,
    revisionCondition,
    nextRevision,
    isConditionalConflict,
} = require("../common/concurrency");
const { deriveStandPublication } = require("../common/stand-domain");
const {
    beginPublishing,
    completePublishing,
    failPublishing,
    resumePublishing,
} = require("../common/publication-state");

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
const PUBLISH_PAGE_SIZE = Math.min(
    Math.max(Number.parseInt(process.env.PUBLISH_PAGE_SIZE || "25", 10), 1),
    100,
);

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
        publicationState: "draft",
        branding:
            body.branding && typeof body.branding === "object"
                ? body.branding
                : {},
        createdBy: auth.actor.userId,
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
        revision: 1,
    };
    try {
        await transactWithAudit(
            client,
            [
                {
                    Put: {
                        TableName: EVENTS_TABLE,
                        Item: item,
                        ConditionExpression: "attribute_not_exists(eventId)",
                    },
                },
            ],
            AUDIT_TABLE,
            {
                organizationId,
                actorUserId: auth.actor.userId,
                action: "event.created",
                resourceType: "event",
                resourceId: item.eventId,
                requestId: event.requestId,
            },
        );
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
    const precondition = expectedRevision(event);
    if (!precondition.ok) {
        return respond(
            precondition.missing ? 428 : 400,
            { error: precondition.code },
            event,
        );
    }
    const current = await loadEvent(organizationId, eventId);
    if (!current) {
        return respond(404, { error: "EVENT_NOT_FOUND" }, event);
    }
    if (
        ["publishing", "publish_failed", "archiving", "archived"].includes(
            current.status,
        )
    ) {
        return respond(409, { error: "EVENT_NOT_EDITABLE" }, event);
    }
    const parsed = parseJsonBody(event);
    const allowed = [
        "name",
        "description",
        "startsAt",
        "endsAt",
        "timezone",
        "visibility",
    ];
    if (
        parsed.error ||
        !hasExactShape(parsed.value, allowed) ||
        Object.keys(parsed.value || {}).length === 0
    ) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const values = { ...current };
    if (parsed.value.name !== undefined) {
        values.name = cleanText(parsed.value.name, 180);
        if (!values.name) {
            return respond(400, { error: "VALIDATION_ERROR" }, event);
        }
    }
    if (parsed.value.description !== undefined) {
        values.description = cleanText(parsed.value.description, 5000);
    }
    if (parsed.value.startsAt !== undefined) {
        values.startsAt = parsed.value.startsAt;
    }
    if (parsed.value.endsAt !== undefined) {
        values.endsAt = parsed.value.endsAt;
    }
    if (parsed.value.timezone !== undefined) {
        values.timezone = cleanText(parsed.value.timezone, 80);
    }
    if (parsed.value.visibility !== undefined) {
        if (!["public", "private"].includes(parsed.value.visibility)) {
            return respond(400, { error: "INVALID_VISIBILITY" }, event);
        }
        values.visibility = parsed.value.visibility;
    }
    if (
        values.startsAt &&
        values.endsAt &&
        new Date(values.endsAt).getTime() <= new Date(values.startsAt).getTime()
    ) {
        return respond(400, { error: "INVALID_EVENT_DATES" }, event);
    }

    const now = new Date().toISOString();
    const newRevision = nextRevision(precondition.revision);
    const assignments = [];
    const names = { "#revision": "revision" };
    const expressionValues = {
        ":updatedAt": now,
        ":schemaVersion": 4,
        ":nextRevision": newRevision,
    };
    let index = 0;
    for (const field of allowed) {
        if (parsed.value[field] === undefined) {
            continue;
        }
        const name = `#field${index}`;
        const token = `:value${index}`;
        names[name] = field;
        expressionValues[token] = values[field];
        assignments.push(`${name} = ${token}`);
        index += 1;
    }
    const wasPublished = current.status === "published";
    if (wasPublished) {
        names["#status"] = "status";
        expressionValues[":draft"] = "draft";
        expressionValues[":hidden"] = "hidden";
        assignments.push(
            "#status = :draft",
            "publicationState = :draft",
            "publicStatus = :hidden",
        );
        if (current.publishedAt) {
            expressionValues[":lastPublishedAt"] = current.publishedAt;
            assignments.push("lastPublishedAt = :lastPublishedAt");
        }
    }
    assignments.push(
        "updatedAt = :updatedAt",
        "schemaVersion = :schemaVersion",
        "#revision = :nextRevision",
    );
    const revision = revisionCondition({ expected: precondition.revision });
    Object.assign(names, revision.names);
    Object.assign(expressionValues, revision.values);
    try {
        await transactWithAudit(
            client,
            [
                {
                    Update: {
                        TableName: EVENTS_TABLE,
                        Key: { eventId },
                        UpdateExpression: `SET ${assignments.join(", ")}${
                            wasPublished
                                ? " REMOVE publishedAt, publishCompletedAt, publishCheckpoint, publishFailure"
                                : ""
                        }`,
                        ConditionExpression: `organizationId = :organizationId AND ${revision.expression}`,
                        ExpressionAttributeNames: names,
                        ExpressionAttributeValues: {
                            ...expressionValues,
                            ":organizationId": organizationId,
                        },
                    },
                },
            ],
            AUDIT_TABLE,
            {
                organizationId,
                actorUserId: auth.actor.userId,
                action: "event.updated",
                resourceType: "event",
                resourceId: eventId,
                requestId: event.requestId,
                metadata: {
                    fields: Object.keys(parsed.value),
                    expectedRevision: precondition.revision,
                    revision: newRevision,
                },
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
    const updated = {
        ...current,
        ...Object.fromEntries(
            allowed
                .filter((field) => parsed.value[field] !== undefined)
                .map((field) => [field, values[field]]),
        ),
        ...(wasPublished
            ? {
                  status: "draft",
                  publicationState: "draft",
                  publicStatus: "hidden",
                  lastPublishedAt: current.publishedAt,
                  publishedAt: undefined,
                  publishCompletedAt: undefined,
                  publishCheckpoint: undefined,
                  publishFailure: undefined,
              }
            : {}),
        updatedAt: now,
        schemaVersion: 4,
        revision: newRevision,
    };
    return respond(
        200,
        { event: eventSummary(updated) },
        event,
        revisionHeaders(newRevision),
    );
}

async function updateStandPublicationSnapshot({
    stand,
    eventId,
    eventStatus,
    eventPublicStatus,
}) {
    const currentRevision = revisionOf(stand);
    const newRevision = nextRevision(currentRevision);
    const now = new Date().toISOString();
    const publication = deriveStandPublication({
        status: stand.status,
        moderationStatus: stand.moderationStatus,
        visibility: stand.visibility,
        eventStatus,
        eventPublicStatus,
        now,
    });
    const revision = revisionCondition({ expected: currentRevision });
    await client.send(
        new UpdateCommand({
            TableName: STANDS_TABLE,
            Key: { stand_id: stand.stand_id },
            UpdateExpression:
                "SET eventStatus = :eventStatus, publicStatus = :publicStatus, publicationKey = :publicationKey, updatedAt = :now, updated_at = :now, #revision = :nextRevision",
            ConditionExpression: `eventId = :eventId AND ${revision.expression}`,
            ExpressionAttributeNames: revision.names,
            ExpressionAttributeValues: {
                ...revision.values,
                ":eventStatus": eventStatus,
                ":publicStatus": publication.publicStatus,
                ":publicationKey": publication.publicationKey,
                ":now": now,
                ":eventId": eventId,
                ":nextRevision": newRevision,
            },
        }),
    );
}

async function synchronizeEventStandPublicationPage({
    eventId,
    eventPublicStatus,
    exclusiveStartKey,
}) {
    const page = await client.send(
        new QueryCommand({
            TableName: STANDS_TABLE,
            IndexName: EVENT_STANDS_INDEX,
            KeyConditionExpression: "eventId = :eventId",
            ExpressionAttributeValues: { ":eventId": eventId },
            ExclusiveStartKey: exclusiveStartKey || undefined,
            Limit: PUBLISH_PAGE_SIZE,
        }),
    );
    let updated = 0;
    for (const stand of page.Items || []) {
        try {
            await updateStandPublicationSnapshot({
                stand,
                eventId,
                eventStatus: "published",
                eventPublicStatus,
            });
        } catch (error) {
            if (!isConditionalConflict(error)) {
                throw error;
            }
            const latest = await client.send(
                new GetCommand({
                    TableName: STANDS_TABLE,
                    Key: { stand_id: stand.stand_id },
                    ConsistentRead: true,
                }),
            );
            if (!latest.Item || latest.Item.eventId !== eventId) {
                continue;
            }
            await updateStandPublicationSnapshot({
                stand: latest.Item,
                eventId,
                eventStatus: "published",
                eventPublicStatus,
            });
        }
        updated += 1;
    }
    return {
        updated,
        nextKey: page.LastEvaluatedKey || null,
    };
}

async function transitionToPublishing({
    event,
    organizationId,
    existing,
    actor,
}) {
    if (existing.publicationState === "publishing") {
        return existing;
    }
    const now = new Date().toISOString();
    const operationId =
        existing.publicationState === "publish_failed" &&
        existing.publishOperationId
            ? existing.publishOperationId
            : `publish_${randomUUID()}`;
    const currentRevision = revisionOf(existing);
    const newRevision = nextRevision(currentRevision);
    const revision = revisionCondition({ expected: currentRevision });
    const next =
        existing.publicationState === "publish_failed"
            ? resumePublishing(existing, now)
            : beginPublishing(existing, operationId, now);
    try {
        await transactWithAudit(
            client,
            [
                {
                    Update: {
                        TableName: EVENTS_TABLE,
                        Key: { eventId: existing.eventId },
                        UpdateExpression:
                            "SET #status = :publishing, publicationState = :publishing, publicStatus = :hidden, publishOperationId = :operationId, publishStartedAt = if_not_exists(publishStartedAt, :now), publishUpdatedAt = :now, #revision = :nextRevision REMOVE publishFailure",
                        ConditionExpression: `organizationId = :organizationId AND #status <> :archived AND #status <> :archiving AND ${revision.expression}`,
                        ExpressionAttributeNames: {
                            "#status": "status",
                            ...revision.names,
                        },
                        ExpressionAttributeValues: {
                            ...revision.values,
                            ":publishing": "publishing",
                            ":hidden": "hidden",
                            ":operationId": operationId,
                            ":now": now,
                            ":organizationId": organizationId,
                            ":archived": "archived",
                            ":archiving": "archiving",
                            ":nextRevision": newRevision,
                        },
                    },
                },
            ],
            AUDIT_TABLE,
            {
                organizationId,
                actorUserId: actor.userId,
                action:
                    existing.publicationState === "publish_failed"
                        ? "event.publish_resumed"
                        : "event.publish_started",
                resourceType: "event",
                resourceId: existing.eventId,
                requestId: event.requestId,
                metadata: {
                    publishOperationId: operationId,
                    expectedRevision: currentRevision,
                    revision: newRevision,
                },
            },
        );
    } catch (error) {
        if (isConditionalConflict(error)) {
            return { conflict: true };
        }
        throw error;
    }
    return {
        ...next,
        publishOperationId: operationId,
        revision: newRevision,
    };
}

async function savePublishCheckpoint({ current, organizationId, page, now }) {
    const currentRevision = revisionOf(current);
    const newRevision = nextRevision(currentRevision);
    const revision = revisionCondition({ expected: currentRevision });
    const checkpoint = {
        lastEvaluatedKey: page.nextKey,
        processedStands:
            Number(current.publishCheckpoint?.processedStands || 0) +
            page.updated,
        pages: Number(current.publishCheckpoint?.pages || 0) + 1,
        updatedAt: now,
    };
    await client.send(
        new UpdateCommand({
            TableName: EVENTS_TABLE,
            Key: { eventId: current.eventId },
            UpdateExpression:
                "SET publishCheckpoint = :checkpoint, publishUpdatedAt = :now, #revision = :nextRevision",
            ConditionExpression: `organizationId = :organizationId AND publicationState = :publishing AND publishOperationId = :operationId AND ${revision.expression}`,
            ExpressionAttributeNames: revision.names,
            ExpressionAttributeValues: {
                ...revision.values,
                ":checkpoint": checkpoint,
                ":now": now,
                ":nextRevision": newRevision,
                ":organizationId": organizationId,
                ":publishing": "publishing",
                ":operationId": current.publishOperationId,
            },
        }),
    );
    return {
        ...current,
        publishCheckpoint: checkpoint,
        publishUpdatedAt: now,
        revision: newRevision,
    };
}

async function finalizePublishing({
    event,
    organizationId,
    current,
    actor,
    page,
    now,
}) {
    const currentRevision = revisionOf(current);
    const newRevision = nextRevision(currentRevision);
    const revision = revisionCondition({ expected: currentRevision });
    const completed = completePublishing(current, now);
    const synchronizedStands =
        Number(current.publishCheckpoint?.processedStands || 0) + page.updated;
    try {
        await transactWithAudit(
            client,
            [
                {
                    Update: {
                        TableName: EVENTS_TABLE,
                        Key: { eventId: current.eventId },
                        UpdateExpression:
                            "SET #status = :published, publicStatus = :publicStatus, publicationState = :published, publishedAt = if_not_exists(publishedAt, :now), publishUpdatedAt = :now, publishCompletedAt = :now, #revision = :nextRevision REMOVE publishCheckpoint, publishFailure",
                        ConditionExpression: `organizationId = :organizationId AND publicationState = :publishing AND publishOperationId = :operationId AND ${revision.expression}`,
                        ExpressionAttributeNames: {
                            "#status": "status",
                            ...revision.names,
                        },
                        ExpressionAttributeValues: {
                            ...revision.values,
                            ":published": "published",
                            ":publicStatus": completed.publicStatus,
                            ":now": now,
                            ":nextRevision": newRevision,
                            ":organizationId": organizationId,
                            ":publishing": "publishing",
                            ":operationId": current.publishOperationId,
                        },
                    },
                },
            ],
            AUDIT_TABLE,
            {
                organizationId,
                actorUserId: actor.userId,
                action: "event.published",
                resourceType: "event",
                resourceId: current.eventId,
                requestId: event.requestId,
                metadata: {
                    publishOperationId: current.publishOperationId,
                    synchronizedStands,
                    expectedRevision: currentRevision,
                    revision: newRevision,
                },
            },
        );
    } catch (error) {
        if (isConditionalConflict(error)) {
            return { conflict: true };
        }
        throw error;
    }
    return {
        event: {
            ...completed,
            revision: newRevision,
        },
        synchronizedStands,
    };
}

async function markPublishingFailed({ current, organizationId, error, event }) {
    const now = new Date().toISOString();
    const currentRevision = revisionOf(current);
    const newRevision = nextRevision(currentRevision);
    const revision = revisionCondition({ expected: currentRevision });
    const failed = failPublishing(
        current,
        {
            code: error?.code || error?.name || "PUBLISH_FAILED",
            requestId: event.requestId,
        },
        now,
    );
    try {
        await client.send(
            new UpdateCommand({
                TableName: EVENTS_TABLE,
                Key: { eventId: current.eventId },
                UpdateExpression:
                    "SET #status = :failed, publicationState = :failed, publicStatus = :hidden, publishUpdatedAt = :now, publishFailure = :failure, #revision = :nextRevision",
                ConditionExpression: `organizationId = :organizationId AND publicationState = :publishing AND publishOperationId = :operationId AND ${revision.expression}`,
                ExpressionAttributeNames: {
                    "#status": "status",
                    ...revision.names,
                },
                ExpressionAttributeValues: {
                    ...revision.values,
                    ":failed": "publish_failed",
                    ":hidden": "hidden",
                    ":now": now,
                    ":failure": failed.publishFailure,
                    ":nextRevision": newRevision,
                    ":organizationId": organizationId,
                    ":publishing": "publishing",
                    ":operationId": current.publishOperationId,
                },
            }),
        );
    } catch (markError) {
        if (!isConditionalConflict(markError)) {
            throw markError;
        }
    }
}

async function publishEvent(event, organizationId, eventId, context = {}) {
    const auth = await authorize(event, organizationId);
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const existing = await loadEvent(organizationId, eventId);
    if (!existing) {
        return respond(404, { error: "EVENT_NOT_FOUND" }, event);
    }
    if (["archiving", "archived"].includes(existing.status)) {
        return respond(409, { error: "EVENT_NOT_PUBLISHABLE" }, event);
    }

    const current = await transitionToPublishing({
        event,
        organizationId,
        existing,
        actor: auth.actor,
    });
    if (current.conflict) {
        return respond(
            409,
            { error: "CONCURRENT_UPDATE", reloadRequired: true },
            event,
        );
    }

    const targetPublicStatus =
        current.visibility === "public" ? "published" : "private";
    const remainingTimeMs =
        typeof context.getRemainingTimeInMillis === "function"
            ? context.getRemainingTimeInMillis()
            : null;
    try {
        const page = await synchronizeEventStandPublicationPage({
            eventId,
            eventPublicStatus: targetPublicStatus,
            exclusiveStartKey:
                current.publishCheckpoint?.lastEvaluatedKey || undefined,
        });
        const now = new Date().toISOString();
        if (page.nextKey) {
            const pending = await savePublishCheckpoint({
                current,
                organizationId,
                page,
                now,
            });
            return respond(
                202,
                {
                    status: "publishing",
                    event: eventSummary(pending),
                    publishOperationId: pending.publishOperationId,
                    processedStands: pending.publishCheckpoint.processedStands,
                    retryAfterSeconds: 2,
                    remainingTimeMs,
                },
                event,
                {
                    ...revisionHeaders(pending),
                    "Retry-After": "2",
                },
            );
        }
        const result = await finalizePublishing({
            event,
            organizationId,
            current,
            actor: auth.actor,
            page,
            now,
        });
        if (result.conflict) {
            return respond(
                409,
                { error: "CONCURRENT_UPDATE", reloadRequired: true },
                event,
            );
        }
        return respond(
            200,
            {
                event: eventSummary(result.event),
                synchronizedStands: result.synchronizedStands,
            },
            event,
            revisionHeaders(result.event),
        );
    } catch (error) {
        if (isConditionalConflict(error)) {
            return respond(
                409,
                { error: "CONCURRENT_UPDATE", reloadRequired: true },
                event,
            );
        }
        await markPublishingFailed({
            current,
            organizationId,
            error,
            event,
        });
        return respond(
            503,
            {
                error: "PUBLISH_FAILED",
                message: "Publication did not complete and can be resumed.",
                retryable: true,
                details: { publishOperationId: current.publishOperationId },
            },
            event,
        );
    }
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
    if (
        ["publishing", "publish_failed", "archiving"].includes(existing.status)
    ) {
        return respond(409, { error: "EVENT_NOT_DUPLICABLE" }, event);
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
        publicationState: "draft",
        branding: existing.branding || {},
        duplicatedFrom: eventId,
        createdBy: auth.actor.userId,
        createdAt: now,
        updatedAt: now,
        schemaVersion: 2,
        revision: 1,
    };
    await transactWithAudit(
        client,
        [
            {
                Put: {
                    TableName: EVENTS_TABLE,
                    Item: copy,
                    ConditionExpression: "attribute_not_exists(eventId)",
                },
            },
        ],
        AUDIT_TABLE,
        {
            organizationId,
            actorUserId: auth.actor.userId,
            action: "event.duplicated",
            resourceType: "event",
            resourceId: copy.eventId,
            requestId: event.requestId,
            metadata: { sourceEventId: eventId },
        },
    );
    return respond(
        201,
        { event: eventSummary(copy) },
        event,
        revisionHeaders(copy),
    );
}

async function archiveStandSnapshot({ stand, organizationId, eventId, now }) {
    const currentRevision = revisionOf(stand);
    const newRevision = nextRevision(currentRevision);
    const revision = revisionCondition({ expected: currentRevision });
    await client.send(
        new UpdateCommand({
            TableName: STANDS_TABLE,
            Key: { stand_id: stand.stand_id },
            UpdateExpression:
                "SET eventStatus = :archived, publicStatus = :draft, publicationKey = :key, updatedAt = :now, updated_at = :now, #revision = :nextRevision",
            ConditionExpression: `organizationId = :organizationId AND eventId = :eventId AND ${revision.expression}`,
            ExpressionAttributeNames: revision.names,
            ExpressionAttributeValues: {
                ...revision.values,
                ":archived": "archived",
                ":draft": "draft",
                ":key": `archived#${now}`,
                ":now": now,
                ":organizationId": organizationId,
                ":eventId": eventId,
                ":nextRevision": newRevision,
            },
        }),
    );
}

async function archiveEvent(event, organizationId, eventId) {
    const auth = await authorize(event, organizationId);
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    let existing = await loadEvent(organizationId, eventId);
    if (!existing) {
        return respond(404, { error: "EVENT_NOT_FOUND" }, event);
    }
    if (existing.status === "archived") {
        return respond(
            200,
            { event: eventSummary(existing), duplicate: true },
            event,
            revisionHeaders(existing),
        );
    }
    const now = new Date().toISOString();
    if (existing.status !== "archiving") {
        const currentRevision = revisionOf(existing);
        const newRevision = nextRevision(currentRevision);
        const revision = revisionCondition({ expected: currentRevision });
        try {
            await transactWithAudit(
                client,
                [
                    {
                        Update: {
                            TableName: EVENTS_TABLE,
                            Key: { eventId },
                            UpdateExpression:
                                "SET #status = :archiving, publicationState = :archiving, publicStatus = :hidden, archiveStartedAt = :now, archivedBy = :actor, updatedAt = :now, #revision = :nextRevision",
                            ConditionExpression: `organizationId = :organizationId AND #status <> :archived AND ${revision.expression}`,
                            ExpressionAttributeNames: {
                                "#status": "status",
                                ...revision.names,
                            },
                            ExpressionAttributeValues: {
                                ...revision.values,
                                ":archiving": "archiving",
                                ":hidden": "hidden",
                                ":archived": "archived",
                                ":now": now,
                                ":actor": auth.actor.userId,
                                ":organizationId": organizationId,
                                ":nextRevision": newRevision,
                            },
                        },
                    },
                ],
                AUDIT_TABLE,
                {
                    organizationId,
                    actorUserId: auth.actor.userId,
                    action: "event.archive_started",
                    resourceType: "event",
                    resourceId: eventId,
                    requestId: event.requestId,
                    metadata: {
                        expectedRevision: currentRevision,
                        revision: newRevision,
                    },
                },
            );
        } catch (error) {
            if (isConditionalConflict(error)) {
                return respond(
                    409,
                    { error: "CONCURRENT_UPDATE", reloadRequired: true },
                    event,
                );
            }
            throw error;
        }
        existing = {
            ...existing,
            status: "archiving",
            publicationState: "archiving",
            publicStatus: "hidden",
            archiveStartedAt: now,
            archivedBy: auth.actor.userId,
            updatedAt: now,
            revision: newRevision,
        };
    }

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
            try {
                await archiveStandSnapshot({
                    stand,
                    organizationId,
                    eventId,
                    now,
                });
            } catch (error) {
                if (!isConditionalConflict(error)) {
                    throw error;
                }
                const latest = await client.send(
                    new GetCommand({
                        TableName: STANDS_TABLE,
                        Key: { stand_id: stand.stand_id },
                        ConsistentRead: true,
                    }),
                );
                if (
                    !latest.Item ||
                    latest.Item.organizationId !== organizationId ||
                    latest.Item.eventId !== eventId
                ) {
                    continue;
                }
                await archiveStandSnapshot({
                    stand: latest.Item,
                    organizationId,
                    eventId,
                    now,
                });
            }
        }
        lastKey = stands.LastEvaluatedKey;
    } while (lastKey);

    const completedAt = new Date().toISOString();
    const currentRevision = revisionOf(existing);
    const finalRevision = nextRevision(currentRevision);
    const revision = revisionCondition({ expected: currentRevision });
    try {
        await transactWithAudit(
            client,
            [
                {
                    Update: {
                        TableName: EVENTS_TABLE,
                        Key: { eventId },
                        UpdateExpression:
                            "SET #status = :archived, publicationState = :archived, publicStatus = :archived, archivedAt = :now, updatedAt = :now, #revision = :nextRevision",
                        ConditionExpression: `organizationId = :organizationId AND #status = :archiving AND ${revision.expression}`,
                        ExpressionAttributeNames: {
                            "#status": "status",
                            ...revision.names,
                        },
                        ExpressionAttributeValues: {
                            ...revision.values,
                            ":archived": "archived",
                            ":archiving": "archiving",
                            ":now": completedAt,
                            ":organizationId": organizationId,
                            ":nextRevision": finalRevision,
                        },
                    },
                },
            ],
            AUDIT_TABLE,
            {
                organizationId,
                actorUserId: auth.actor.userId,
                action: "event.archived",
                resourceType: "event",
                resourceId: eventId,
                requestId: event.requestId,
                metadata: {
                    expectedRevision: currentRevision,
                    revision: finalRevision,
                },
            },
        );
    } catch (error) {
        if (isConditionalConflict(error)) {
            return respond(
                409,
                { error: "CONCURRENT_UPDATE", reloadRequired: true },
                event,
            );
        }
        throw error;
    }
    const archived = {
        ...existing,
        status: "archived",
        publicationState: "archived",
        publicStatus: "archived",
        archivedAt: completedAt,
        updatedAt: completedAt,
        revision: finalRevision,
    };
    return respond(
        200,
        { event: eventSummary(archived) },
        event,
        revisionHeaders(finalRevision),
    );
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

async function reassignStand(event, organizationId, eventId, standId) {
    const auth = await authorize(event, organizationId);
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    if (!validId(standId)) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const parsed = parseJsonBody(event);
    if (parsed.error || !hasExactShape(parsed.value, ["newOwnerUserId"])) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const newOwnerUserId = cleanText(parsed.value.newOwnerUserId, 120);
    if (!validId(newOwnerUserId)) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }

    const [eventItem, standResult, targetMembership] = await Promise.all([
        loadEvent(organizationId, eventId),
        client.send(
            new GetCommand({
                TableName: STANDS_TABLE,
                Key: { stand_id: standId },
                ConsistentRead: true,
            }),
        ),
        getMembership(
            client,
            MEMBERSHIPS_TABLE,
            newOwnerUserId,
            organizationId,
        ),
    ]);
    if (!eventItem) {
        return respond(404, { error: "EVENT_NOT_FOUND" }, event);
    }
    const stand = standResult.Item;
    if (
        !stand ||
        stand.organizationId !== organizationId ||
        stand.eventId !== eventId
    ) {
        return respond(404, { error: "STAND_NOT_FOUND" }, event);
    }
    if (
        !targetMembership ||
        targetMembership.status !== "active" ||
        !["owner", "organizer", "exhibitor"].includes(targetMembership.role)
    ) {
        return respond(409, { error: "ACTIVE_MEMBER_REQUIRED" }, event);
    }
    if (stand.ownerUserId === newOwnerUserId) {
        return respond(
            200,
            { stand, reassigned: false },
            event,
            revisionHeaders(stand),
        );
    }

    const now = new Date();
    const currentRevision = revisionOf(stand);
    const newRevision = nextRevision(currentRevision);
    const revision = revisionCondition({ expected: currentRevision });
    const audit = buildAuditEvent(
        {
            organizationId,
            actorUserId: auth.actor.userId,
            action: "stand.reassigned",
            resourceType: "stand",
            resourceId: standId,
            requestId: event.requestId,
            metadata: {
                eventId,
                previousOwnerUserId: stand.ownerUserId || null,
                newOwnerUserId,
                expectedRevision: currentRevision,
                revision: newRevision,
            },
        },
        now,
    );
    try {
        await client.send(
            new TransactWriteCommand({
                TransactItems: [
                    {
                        Update: {
                            TableName: STANDS_TABLE,
                            Key: { stand_id: standId },
                            UpdateExpression:
                                "SET ownerUserId = :newOwner, exhibitorUserId = :newOwner, assignedAt = :now, updatedAt = :now, updated_at = :now, schemaVersion = :schemaVersion, #revision = :nextRevision",
                            ConditionExpression: `organizationId = :organizationId AND eventId = :eventId AND ownerUserId = :previousOwner AND ${revision.expression}`,
                            ExpressionAttributeNames: revision.names,
                            ExpressionAttributeValues: {
                                ...revision.values,
                                ":newOwner": newOwnerUserId,
                                ":now": now.toISOString(),
                                ":schemaVersion": 4,
                                ":organizationId": organizationId,
                                ":eventId": eventId,
                                ":previousOwner": stand.ownerUserId,
                                ":nextRevision": newRevision,
                            },
                        },
                    },
                    {
                        Put: {
                            TableName: AUDIT_TABLE,
                            Item: audit,
                            ConditionExpression:
                                "attribute_not_exists(auditId)",
                        },
                    },
                ],
            }),
        );
    } catch (error) {
        if (isConditionalConflict(error)) {
            return respond(
                409,
                { error: "STAND_ASSIGNMENT_CHANGED", reloadRequired: true },
                event,
            );
        }
        throw error;
    }
    const reassigned = {
        ...stand,
        ownerUserId: newOwnerUserId,
        exhibitorUserId: newOwnerUserId,
        assignedAt: now.toISOString(),
        updatedAt: now.toISOString(),
        updated_at: now.toISOString(),
        schemaVersion: 4,
        revision: newRevision,
    };
    return respond(
        200,
        { reassigned: true, stand: reassigned },
        event,
        revisionHeaders(newRevision),
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
    const moderationStatus = status === "published" ? "approved" : "rejected";
    const publication = deriveStandPublication({
        status,
        moderationStatus,
        visibility: stand.visibility,
        eventStatus: eventItem.status,
        eventPublicStatus: eventItem.publicStatus,
        now,
    });
    const moderationNote = cleanText(parsed.value.moderationNote, 2000);
    const currentRevision = revisionOf(stand);
    const newRevision = nextRevision(currentRevision);
    const revision = revisionCondition({ expected: currentRevision });
    try {
        await transactWithAudit(
            client,
            [
                {
                    Update: {
                        TableName: STANDS_TABLE,
                        Key: { stand_id: standId },
                        UpdateExpression:
                            "SET #status = :status, moderationStatus = :moderationStatus, publicStatus = :publicStatus, eventStatus = :eventStatus, publicationKey = :publicationKey, moderationNote = :moderationNote, updatedAt = :now, updated_at = :now, #revision = :nextRevision",
                        ConditionExpression: `organizationId = :organizationId AND eventId = :eventId AND #status = :pendingReview AND ${revision.expression}`,
                        ExpressionAttributeNames: {
                            "#status": "status",
                            ...revision.names,
                        },
                        ExpressionAttributeValues: {
                            ...revision.values,
                            ":status": status,
                            ":moderationStatus": moderationStatus,
                            ":publicStatus": publication.publicStatus,
                            ":eventStatus": eventItem.status,
                            ":publicationKey": publication.publicationKey,
                            ":moderationNote": moderationNote,
                            ":now": now,
                            ":organizationId": organizationId,
                            ":eventId": eventId,
                            ":pendingReview": "pending_review",
                            ":nextRevision": newRevision,
                        },
                    },
                },
            ],
            AUDIT_TABLE,
            {
                organizationId,
                actorUserId: auth.actor.userId,
                action: `stand.${status}`,
                resourceType: "stand",
                resourceId: standId,
                requestId: event.requestId,
                metadata: {
                    eventId,
                    expectedRevision: currentRevision,
                    revision: newRevision,
                },
            },
        );
    } catch (error) {
        if (isConditionalConflict(error)) {
            return respond(
                409,
                { error: "CONCURRENT_UPDATE", reloadRequired: true },
                event,
            );
        }
        throw error;
    }
    const moderated = {
        ...stand,
        status,
        moderationStatus,
        publicStatus: publication.publicStatus,
        eventStatus: eventItem.status,
        publicationKey: publication.publicationKey,
        moderationNote,
        updatedAt: now,
        updated_at: now,
        revision: newRevision,
    };
    return respond(
        200,
        { stand: moderated },
        event,
        revisionHeaders(newRevision),
    );
}

const handler = async (event, context) => {
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
                context,
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
        const assignment = path.match(
            /^\/organizations\/([^/]+)\/events\/([^/]+)\/stands\/([^/]+)\/assignment$/,
        );
        if (assignment && method === "PATCH") {
            return reassignStand(
                event,
                decodeURIComponent(assignment[1]),
                decodeURIComponent(assignment[2]),
                decodeURIComponent(assignment[3]),
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

// AI_PAVILION_QUOTA_01_WRAPPER
const __baseHandler_AI_PAVILION_QUOTA_01_WRAPPER = module.exports.handler;
module.exports.handler = require("./quota-wrapper").wrap(
    __baseHandler_AI_PAVILION_QUOTA_01_WRAPPER,
);
