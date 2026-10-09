"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const { respond, preflight } = require("../common/cors");
const { withObservability } = require("../common/observability");
const { parseJsonBody, hasExactShape } = require("../common/validation");
const { cleanText, validId } = require("../common/domain");
const { identity } = require("../common/tenant");
const { transactWithAudit } = require("../common/audit");
const {
    expectedRevision,
    revisionHeaders,
    revisionCondition,
    nextRevision,
    isConditionalConflict,
} = require("../common/concurrency");
const {
    parseLimit,
    decodeCursor,
    encodeCursor,
} = require("../common/pagination");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const STANDS_TABLE = process.env.STANDS_TABLE;
const EVENTS_TABLE = process.env.EVENTS_TABLE;
const AUDIT_TABLE = process.env.AUDIT_TABLE;
const OWNER_STANDS_INDEX =
    process.env.OWNER_STANDS_INDEX || "owner-stands-index";

function privateStand(item) {
    if (!item) {
        return null;
    }
    const { internalBilling: _internalBilling, ...safe } = item;
    return safe;
}

async function loadOwnedStand(userId, standId) {
    const result = await client.send(
        new GetCommand({
            TableName: STANDS_TABLE,
            Key: { stand_id: standId },
            ConsistentRead: true,
        }),
    );
    return result.Item?.ownerUserId === userId ? result.Item : null;
}

async function listStands(event, actor) {
    const params = event.queryStringParameters || {};
    const limit = parseLimit(params.limit, 25, 100);
    const cursor = decodeCursor(params.cursor);
    if (params.cursor && cursor === null) {
        return respond(400, { error: "INVALID_CURSOR" }, event);
    }
    const result = await client.send(
        new QueryCommand({
            TableName: STANDS_TABLE,
            IndexName: OWNER_STANDS_INDEX,
            KeyConditionExpression: "ownerUserId = :userId",
            ExpressionAttributeValues: { ":userId": actor.userId },
            ScanIndexForward: false,
            Limit: limit,
            ExclusiveStartKey: cursor,
        }),
    );
    return respond(
        200,
        {
            stands: (result.Items || []).map(privateStand),
            count: (result.Items || []).length,
            nextCursor: encodeCursor(result.LastEvaluatedKey),
        },
        event,
    );
}

async function getStand(event, actor, standId) {
    const stand = await loadOwnedStand(actor.userId, standId);
    if (!stand) {
        return respond(404, { error: "STAND_NOT_FOUND" }, event);
    }
    return respond(200, { stand: privateStand(stand) }, event);
}

function validPublicContact(value) {
    if (value === undefined) {
        return true;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    if (!hasExactShape(value, ["showEmail", "showPhone", "showWebsite"])) {
        return false;
    }
    return Object.values(value).every((entry) => typeof entry === "boolean");
}

function normalizeProducts(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.slice(0, 100).map((product, index) => ({
        productId: cleanText(
            product?.productId || product?.id || `product_${index + 1}`,
            120,
        ),
        name: cleanText(product?.name, 160),
        description: cleanText(product?.description, 2000),
        priceInCents: Math.max(
            0,
            Math.min(
                Number.parseInt(product?.priceInCents || 0, 10),
                10_000_000,
            ),
        ),
        currency: ["eur", "usd", "gbp"].includes(
            String(product?.currency || "eur").toLowerCase(),
        )
            ? String(product.currency || "eur").toLowerCase()
            : "eur",
        imageUrl: cleanText(product?.imageUrl || product?.image_url, 2048),
        status: product?.status === "hidden" ? "hidden" : "active",
    }));
}

async function updateStand(event, actor, standId) {
    if (!validId(standId)) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const precondition = expectedRevision(event);
    if (!precondition.ok) {
        return respond(
            precondition.missing ? 428 : 400,
            { error: precondition.code },
            event,
        );
    }
    const existing = await loadOwnedStand(actor.userId, standId);
    if (!existing) {
        return respond(404, { error: "STAND_NOT_FOUND" }, event);
    }
    if (!["draft", "rejected"].includes(existing.status)) {
        return respond(
            409,
            {
                error: "STAND_LOCKED",
                message: "Only draft or rejected stands can be edited",
            },
            event,
        );
    }
    const parsed = parseJsonBody(event);
    const allowed = [
        "name",
        "description",
        "longDescription",
        "category",
        "imageUrl",
        "website",
        "contactEmail",
        "contactPhone",
        "publicContact",
        "products",
        "tags",
    ];
    if (
        parsed.error ||
        !hasExactShape(parsed.value, allowed) ||
        !validPublicContact(parsed.value?.publicContact)
    ) {
        return respond(
            400,
            {
                error: "VALIDATION_ERROR",
                message: parsed.error || "Unexpected stand fields",
            },
            event,
        );
    }
    const next = {
        ...existing,
        name:
            parsed.value.name !== undefined
                ? cleanText(parsed.value.name, 160)
                : existing.name,
        description:
            parsed.value.description !== undefined
                ? cleanText(parsed.value.description, 5000)
                : existing.description,
        long_description:
            parsed.value.longDescription !== undefined
                ? cleanText(parsed.value.longDescription, 20000)
                : existing.long_description,
        category:
            parsed.value.category !== undefined
                ? cleanText(parsed.value.category, 80).toLowerCase()
                : existing.category,
        image_url:
            parsed.value.imageUrl !== undefined
                ? cleanText(parsed.value.imageUrl, 2048)
                : existing.image_url,
        website:
            parsed.value.website !== undefined
                ? cleanText(parsed.value.website, 2048)
                : existing.website,
        contact_email:
            parsed.value.contactEmail !== undefined
                ? cleanText(parsed.value.contactEmail, 254).toLowerCase()
                : existing.contact_email,
        contact_phone:
            parsed.value.contactPhone !== undefined
                ? cleanText(parsed.value.contactPhone, 40)
                : existing.contact_phone,
        publicContact:
            parsed.value.publicContact !== undefined
                ? {
                      showEmail: parsed.value.publicContact?.showEmail === true,
                      showPhone: parsed.value.publicContact?.showPhone === true,
                      showWebsite:
                          parsed.value.publicContact?.showWebsite === true,
                  }
                : existing.publicContact || {
                      showEmail: false,
                      showPhone: false,
                      showWebsite: false,
                  },
        products:
            parsed.value.products !== undefined
                ? normalizeProducts(parsed.value.products)
                : existing.products,
        tags:
            parsed.value.tags !== undefined && Array.isArray(parsed.value.tags)
                ? parsed.value.tags
                      .slice(0, 30)
                      .map((tag) => cleanText(tag, 60))
                      .filter(Boolean)
                : existing.tags,
    };
    if (!next.name || !next.category) {
        return respond(
            400,
            {
                error: "VALIDATION_ERROR",
                message: "name and category are required",
            },
            event,
        );
    }
    const now = new Date().toISOString();
    const newRevision = nextRevision(precondition.revision);
    const revision = revisionCondition({ expected: precondition.revision });
    next.updatedAt = now;
    next.updated_at = now;
    next.moderationStatus = "draft";
    next.publicStatus = "draft";
    next.publicationKey = `${next.status}#${now}`;
    next.revision = newRevision;
    try {
        await transactWithAudit(
            client,
            [
                {
                    Put: {
                        TableName: STANDS_TABLE,
                        Item: next,
                        ConditionExpression: `ownerUserId = :userId AND #status IN (:draft, :rejected) AND ${revision.expression}`,
                        ExpressionAttributeNames: {
                            "#status": "status",
                            ...revision.names,
                        },
                        ExpressionAttributeValues: {
                            ":userId": actor.userId,
                            ":draft": "draft",
                            ":rejected": "rejected",
                            ...revision.values,
                        },
                    },
                },
            ],
            AUDIT_TABLE,
            {
                organizationId: next.organizationId,
                actorUserId: actor.userId,
                action: "stand.updated",
                resourceType: "stand",
                resourceId: standId,
                requestId: event.requestId,
                metadata: {
                    eventId: next.eventId,
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
    return respond(
        200,
        { stand: privateStand(next) },
        event,
        revisionHeaders(newRevision),
    );
}

async function submitStand(event, actor, standId) {
    if (!validId(standId)) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const precondition = expectedRevision(event);
    if (!precondition.ok) {
        return respond(
            precondition.missing ? 428 : 400,
            { error: precondition.code },
            event,
        );
    }
    const existing = await loadOwnedStand(actor.userId, standId);
    if (!existing) {
        return respond(404, { error: "STAND_NOT_FOUND" }, event);
    }
    if (!["draft", "rejected"].includes(existing.status)) {
        return respond(409, { error: "INVALID_STAND_STATE" }, event);
    }
    if (!existing.name || !existing.description || !existing.category) {
        return respond(
            400,
            {
                error: "STAND_INCOMPLETE",
                message: "name, description and category are required",
            },
            event,
        );
    }
    const eventResult = await client.send(
        new GetCommand({
            TableName: EVENTS_TABLE,
            Key: { eventId: existing.eventId },
        }),
    );
    if (
        !eventResult.Item ||
        eventResult.Item.organizationId !== existing.organizationId
    ) {
        return respond(409, { error: "EVENT_NOT_AVAILABLE" }, event);
    }
    const now = new Date().toISOString();
    const publicationKey = `pending_review#${now}`;
    const newRevision = nextRevision(precondition.revision);
    const revision = revisionCondition({ expected: precondition.revision });
    try {
        await transactWithAudit(
            client,
            [
                {
                    Update: {
                        TableName: STANDS_TABLE,
                        Key: { stand_id: standId },
                        UpdateExpression:
                            "SET #status = :pending, moderationStatus = :moderationStatus, publicStatus = :draftPublic, eventStatus = :eventStatus, publicationKey = :publicationKey, submittedAt = :now, updatedAt = :now, updated_at = :now, #revision = :nextRevision REMOVE moderationNote",
                        ConditionExpression: `ownerUserId = :userId AND #status IN (:draft, :rejected) AND ${revision.expression}`,
                        ExpressionAttributeNames: {
                            "#status": "status",
                            ...revision.names,
                        },
                        ExpressionAttributeValues: {
                            ":pending": "pending_review",
                            ":moderationStatus": "pending",
                            ":draftPublic": "draft",
                            ":eventStatus": eventResult.Item.status,
                            ":publicationKey": publicationKey,
                            ":now": now,
                            ":userId": actor.userId,
                            ":draft": "draft",
                            ":rejected": "rejected",
                            ":nextRevision": newRevision,
                            ...revision.values,
                        },
                    },
                },
            ],
            AUDIT_TABLE,
            {
                organizationId: existing.organizationId,
                actorUserId: actor.userId,
                action: "stand.submitted",
                resourceType: "stand",
                resourceId: standId,
                requestId: event.requestId,
                metadata: {
                    eventId: existing.eventId,
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
    return respond(
        200,
        {
            stand: privateStand({
                ...existing,
                status: "pending_review",
                moderationStatus: "pending",
                publicStatus: "draft",
                eventStatus: eventResult.Item.status,
                publicationKey,
                submittedAt: now,
                updatedAt: now,
                updated_at: now,
                revision: newRevision,
                moderationNote: undefined,
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
        const method = event.httpMethod;
        if (path === "/exhibitor/stands" && method === "GET") {
            return listStands(event, actor);
        }
        const item = path.match(/^\/exhibitor\/stands\/([^/]+)$/);
        if (item) {
            const standId = decodeURIComponent(item[1]);
            if (method === "GET") {
                return getStand(event, actor, standId);
            }
            if (method === "PUT") {
                return updateStand(event, actor, standId);
            }
        }
        const submit = path.match(/^\/exhibitor\/stands\/([^/]+)\/submit$/);
        if (submit && method === "POST") {
            return submitStand(event, actor, decodeURIComponent(submit[1]));
        }
        return respond(404, { error: "NOT_FOUND" }, event);
    } catch (error) {
        if (error.name === "ConditionalCheckFailedException") {
            return respond(409, { error: "CONCURRENT_UPDATE" }, event);
        }
        console.error("Exhibitor stands API failed", error);
        return respond(500, { error: "INTERNAL_ERROR" }, event);
    }
};

exports.handler = withObservability("exhibitor-stands", handler);
