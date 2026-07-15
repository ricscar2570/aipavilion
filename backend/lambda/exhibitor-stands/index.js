"use strict";

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
const { cleanText, validId } = require("../common/domain");
const { identity } = require("../common/tenant");
const { writeAuditEvent } = require("../common/audit");
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
        "products",
        "tags",
    ];
    if (parsed.error || !hasExactShape(parsed.value, allowed)) {
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
    next.updatedAt = now;
    next.updated_at = now;
    next.publicationKey = `${next.status}#${now}`;
    await client.send(
        new PutCommand({
            TableName: STANDS_TABLE,
            Item: next,
            ConditionExpression:
                "ownerUserId = :userId AND #status IN (:draft, :rejected)",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
                ":userId": actor.userId,
                ":draft": "draft",
                ":rejected": "rejected",
            },
        }),
    );
    await writeAuditEvent(client, AUDIT_TABLE, {
        organizationId: next.organizationId,
        actorUserId: actor.userId,
        action: "stand.updated",
        resourceType: "stand",
        resourceId: standId,
        requestId: event.requestId,
        metadata: { eventId: next.eventId },
    });
    return respond(200, { stand: privateStand(next) }, event);
}

async function submitStand(event, actor, standId) {
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
    const result = await client.send(
        new UpdateCommand({
            TableName: STANDS_TABLE,
            Key: { stand_id: standId },
            UpdateExpression:
                "SET #status = :pending, eventStatus = :eventStatus, publicationKey = :publicationKey, submittedAt = :now, updatedAt = :now, updated_at = :now REMOVE moderationNote",
            ConditionExpression:
                "ownerUserId = :userId AND #status IN (:draft, :rejected)",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
                ":pending": "pending_review",
                ":eventStatus": eventResult.Item.status,
                ":publicationKey": `pending_review#${now}`,
                ":now": now,
                ":userId": actor.userId,
                ":draft": "draft",
                ":rejected": "rejected",
            },
            ReturnValues: "ALL_NEW",
        }),
    );
    await writeAuditEvent(client, AUDIT_TABLE, {
        organizationId: existing.organizationId,
        actorUserId: actor.userId,
        action: "stand.submitted",
        resourceType: "stand",
        resourceId: standId,
        requestId: event.requestId,
        metadata: { eventId: existing.eventId },
    });
    return respond(200, { stand: privateStand(result.Attributes) }, event);
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
