"use strict";

const crypto = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
    ScanCommand,
    TransactWriteCommand,
    UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const { QuotaError, integer } = require("./quota-model");

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
});

const nowIso = () => new Date().toISOString();
const nowSeconds = () => Math.floor(Date.now() / 1000);

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new QuotaError(
            "QUOTA_CONFIGURATION_ERROR",
            `Missing ${name}.`,
            503,
        );
    }
    return value;
}

function requestDigest(value) {
    return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function reservationId(kind, scopeId, idempotencyKey) {
    return `RES#${kind}#${requestDigest(`${scopeId}|${idempotencyKey}`).slice(0, 40)}`;
}

function occupancyId(kind, resourceId) {
    return `OCC#${kind}#${resourceId}`;
}

function eventCounterKey(organizationId) {
    return `ORG#${organizationId}#EVENTS`;
}

function standCounterKey(eventId) {
    return `EVENT#${eventId}#STANDS`;
}

function getPath(obj, paths) {
    for (const path of paths) {
        let current = obj;
        let ok = true;
        for (const part of path.split(".")) {
            if (
                current &&
                Object.prototype.hasOwnProperty.call(current, part)
            ) {
                current = current[part];
            } else {
                ok = false;
                break;
            }
        }
        if (ok && current !== undefined && current !== null) {
            return current;
        }
    }
    return undefined;
}

function extractLimit(entitlement, kind) {
    const paths =
        kind === "events"
            ? [
                  "maxActiveEvents",
                  "limits.maxActiveEvents",
                  "entitlements.maxActiveEvents",
                  "features.maxActiveEvents",
              ]
            : [
                  "maxStandsPerEvent",
                  "limits.maxStandsPerEvent",
                  "entitlements.maxStandsPerEvent",
                  "features.maxStandsPerEvent",
              ];
    const value = Number(getPath(entitlement || {}, paths));
    if (!Number.isInteger(value) || value < 0) {
        throw new QuotaError(
            "QUOTA_LIMIT_MISSING",
            `No valid ${kind} limit is available for this organization.`,
            503,
        );
    }
    return value;
}

async function readEntitlement(organizationId) {
    const result = await documentClient.send(
        new GetCommand({
            TableName: requiredEnv("ENTITLEMENTS_TABLE"),
            Key: { organizationId },
            ConsistentRead: true,
        }),
    );
    if (!result.Item) {
        throw new QuotaError(
            "ENTITLEMENT_NOT_FOUND",
            "No entitlement exists for this organization.",
            409,
        );
    }
    return result.Item;
}

async function queryAll(params) {
    const items = [];
    let ExclusiveStartKey;
    do {
        const result = await documentClient.send(
            new QueryCommand({ ...params, ExclusiveStartKey }),
        );
        items.push(...(result.Items || []));
        ExclusiveStartKey = result.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
}

async function scanAll(params) {
    const items = [];
    let ExclusiveStartKey;
    do {
        const result = await documentClient.send(
            new ScanCommand({ ...params, ExclusiveStartKey }),
        );
        items.push(...(result.Items || []));
        ExclusiveStartKey = result.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
}

async function queryOrScan({
    tableName,
    indexName,
    keyName,
    keyValue,
    consistentRead = false,
}) {
    if (indexName && !consistentRead) {
        try {
            return await queryAll({
                TableName: tableName,
                IndexName: indexName,
                KeyConditionExpression: "#key = :value",
                ExpressionAttributeNames: { "#key": keyName },
                ExpressionAttributeValues: { ":value": keyValue },
            });
        } catch (error) {
            if (
                !["ValidationException", "ResourceNotFoundException"].includes(
                    error.name,
                )
            ) {
                throw error;
            }
        }
    }
    return scanAll({
        TableName: tableName,
        ConsistentRead: consistentRead,
        FilterExpression: "#key = :value",
        ExpressionAttributeNames: { "#key": keyName },
        ExpressionAttributeValues: { ":value": keyValue },
    });
}

function eventCountsAsActive(event) {
    const status = String(event.status || "draft").toLowerCase();
    return !["archived", "deleted", "cancelled", "canceled"].includes(status);
}

function standCountsAsUsed(stand) {
    const status = String(stand.status || "draft").toLowerCase();
    return !["deleted", "archived", "removed"].includes(status);
}

function expirySeconds(value, fallback = 0) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
        return numeric;
    }
    const parsed = Date.parse(String(value));
    if (!Number.isFinite(parsed)) {
        throw new QuotaError(
            "INVITATION_EXPIRY_INVALID",
            "Invalid invitation expiry.",
            400,
        );
    }
    return Math.floor(parsed / 1000);
}

function invitationCountsAsReserved(invitation, at = nowSeconds()) {
    const status = String(invitation.status || "pending").toLowerCase();
    const expiry = expirySeconds(invitation.expiresAt);
    return status === "pending" && (!expiry || expiry > at);
}

async function calculateEventUsage(organizationId, consistentRead = false) {
    const items = await queryOrScan({
        consistentRead,
        tableName: requiredEnv("EVENTS_TABLE"),
        indexName: process.env.ORGANIZATION_EVENTS_INDEX,
        keyName: "organizationId",
        keyValue: organizationId,
    });
    return items.filter(eventCountsAsActive).length;
}

async function calculateStandUsage(eventId, consistentRead = false) {
    const stands = await queryOrScan({
        consistentRead,
        tableName: requiredEnv("STANDS_TABLE"),
        indexName: process.env.EVENT_STANDS_INDEX,
        keyName: "eventId",
        keyValue: eventId,
    });
    const invitations = await queryOrScan({
        consistentRead,
        tableName: requiredEnv("INVITATIONS_TABLE"),
        indexName: process.env.EVENT_INVITATIONS_INDEX,
        keyName: "eventId",
        keyValue: eventId,
    });
    return {
        used: stands.filter(standCountsAsUsed).length,
        reserved: invitations.filter((invitation) =>
            invitationCountsAsReserved(invitation),
        ).length,
    };
}

async function getCounter(counterKey) {
    const result = await documentClient.send(
        new GetCommand({
            TableName: requiredEnv("QUOTA_COUNTERS_TABLE"),
            Key: { counterKey },
            ConsistentRead: true,
        }),
    );
    return result.Item;
}

async function initializeCounter({
    counterKey,
    organizationId,
    eventId,
    kind,
    limit,
    used,
    reserved,
}) {
    const safeUsed = integer(used, 0);
    const safeReserved = integer(reserved, 0);
    const item = {
        counterKey,
        organizationId,
        eventId,
        kind,
        limit,
        used: safeUsed,
        reserved: safeReserved,
        available: Math.max(0, limit - safeUsed - safeReserved),
        overLimit: safeUsed + safeReserved > limit,
        revision: 1,
        createdAt: nowIso(),
        updatedAt: nowIso(),
    };
    try {
        await documentClient.send(
            new PutCommand({
                TableName: requiredEnv("QUOTA_COUNTERS_TABLE"),
                Item: item,
                ConditionExpression: "attribute_not_exists(counterKey)",
            }),
        );
        return item;
    } catch (error) {
        if (error.name !== "ConditionalCheckFailedException") {
            throw error;
        }
        return getCounter(counterKey);
    }
}

async function refreshCounterLimit(counter, organizationId, kind) {
    const entitlement = await readEntitlement(organizationId);
    const limit = extractLimit(entitlement, kind);
    if (Number(counter.limit) === limit) {
        return counter;
    }
    const desired = {
        limit,
        used: Number(counter.used || 0),
        reserved: Number(counter.reserved || 0),
        available: Math.max(
            0,
            limit - Number(counter.used || 0) - Number(counter.reserved || 0),
        ),
    };
    try {
        return await setCounterAbsolute(counter, counter, desired);
    } catch (error) {
        if (
            [
                "ConditionalCheckFailedException",
                "TransactionConflictException",
            ].includes(error.name)
        ) {
            return getCounter(counter.counterKey);
        }
        throw error;
    }
}

async function ensureEventCounter(organizationId) {
    const counterKey = eventCounterKey(organizationId);
    const existing = await getCounter(counterKey);
    if (existing) {
        return refreshCounterLimit(existing, organizationId, "events");
    }
    const entitlement = await readEntitlement(organizationId);
    const limit = extractLimit(entitlement, "events");
    const used = await calculateEventUsage(organizationId);
    return initializeCounter({
        counterKey,
        organizationId,
        kind: "events",
        limit,
        used,
        reserved: 0,
    });
}

async function ensureStandCounter(organizationId, eventId) {
    const counterKey = standCounterKey(eventId);
    const existing = await getCounter(counterKey);
    if (existing) {
        return refreshCounterLimit(existing, organizationId, "stands");
    }
    const entitlement = await readEntitlement(organizationId);
    const limit = extractLimit(entitlement, "stands");
    const usage = await calculateStandUsage(eventId);
    return initializeCounter({
        counterKey,
        organizationId,
        eventId,
        kind: "stands",
        limit,
        ...usage,
    });
}

async function getReservation(id) {
    const result = await documentClient.send(
        new GetCommand({
            TableName: requiredEnv("QUOTA_RESERVATIONS_TABLE"),
            Key: { reservationId: id },
            ConsistentRead: true,
        }),
    );
    return result.Item;
}

async function reserveUnit({
    counter,
    kind,
    scopeId,
    idempotencyKey,
    requestHash,
    actorUserId,
    ttlSeconds = 900,
}) {
    const id = reservationId(kind, scopeId, idempotencyKey);
    const existing = await getReservation(id);
    if (existing) {
        if (
            existing.requestHash !== requestHash ||
            existing.actorUserId !== actorUserId
        ) {
            throw new QuotaError(
                "IDEMPOTENCY_KEY_REUSED",
                "The idempotency key was reused with a different request.",
                409,
            );
        }
        return { reservation: existing, replay: true };
    }
    if (Number(counter.available) < 1 || counter.overLimit) {
        throw new QuotaError(
            "QUOTA_EXCEEDED",
            "The plan quota has been reached.",
            409,
            {
                counterKey: counter.counterKey,
                limit: counter.limit,
                used: counter.used,
                reserved: counter.reserved,
            },
        );
    }
    const createdAt = nowIso();
    const reservation = {
        reservationId: id,
        counterKey: counter.counterKey,
        organizationId: counter.organizationId,
        eventId: counter.eventId,
        kind,
        scopeId,
        idempotencyKey,
        requestHash,
        actorUserId,
        status: "reserved",
        createdAt,
        updatedAt: createdAt,
        reservationExpiresAt: nowSeconds() + ttlSeconds,
    };
    try {
        await documentClient.send(
            new TransactWriteCommand({
                TransactItems: [
                    {
                        Update: {
                            TableName: requiredEnv("QUOTA_COUNTERS_TABLE"),
                            Key: { counterKey: counter.counterKey },
                            UpdateExpression:
                                "SET #reserved = #reserved + :one, #available = #available - :one, #updatedAt = :now ADD #revision :one",
                            ConditionExpression:
                                "#available >= :one AND #overLimit = :false",
                            ExpressionAttributeNames: {
                                "#reserved": "reserved",
                                "#available": "available",
                                "#updatedAt": "updatedAt",
                                "#revision": "revision",
                                "#overLimit": "overLimit",
                            },
                            ExpressionAttributeValues: {
                                ":one": 1,
                                ":now": createdAt,
                                ":false": false,
                            },
                        },
                    },
                    {
                        Put: {
                            TableName: requiredEnv("QUOTA_RESERVATIONS_TABLE"),
                            Item: reservation,
                            ConditionExpression:
                                "attribute_not_exists(reservationId)",
                        },
                    },
                ],
                ClientRequestToken: requestDigest(`reserve|${id}`).slice(0, 36),
            }),
        );
        return { reservation, replay: false };
    } catch (error) {
        if (
            [
                "TransactionCanceledException",
                "ConditionalCheckFailedException",
            ].includes(error.name)
        ) {
            const raced = await getReservation(id);
            if (
                raced &&
                raced.requestHash === requestHash &&
                raced.actorUserId === actorUserId
            ) {
                return { reservation: raced, replay: true };
            }
            throw new QuotaError(
                "QUOTA_EXCEEDED",
                "The plan quota has been reached or changed concurrently.",
                409,
            );
        }
        throw error;
    }
}

async function reserveEventSlot({
    organizationId,
    idempotencyKey,
    requestHash,
    actorUserId,
}) {
    return reserveUnit({
        counter: await ensureEventCounter(organizationId),
        kind: "event-create",
        scopeId: organizationId,
        idempotencyKey,
        requestHash,
        actorUserId,
    });
}

async function reserveStandSlot({
    organizationId,
    eventId,
    idempotencyKey,
    requestHash,
    actorUserId,
    ttlSeconds,
}) {
    return reserveUnit({
        counter: await ensureStandCounter(organizationId, eventId),
        kind: "stand-invitation",
        scopeId: eventId,
        idempotencyKey,
        requestHash,
        actorUserId,
        ttlSeconds,
    });
}

async function releaseSourceReservation(id, reason = "operation_failed") {
    const item = await getReservation(id);
    if (!item || item.status !== "reserved") {
        return { released: false, replay: true };
    }
    const timestamp = nowIso();
    try {
        await documentClient.send(
            new TransactWriteCommand({
                TransactItems: [
                    {
                        Update: {
                            TableName: requiredEnv("QUOTA_COUNTERS_TABLE"),
                            Key: { counterKey: item.counterKey },
                            UpdateExpression:
                                "SET #reserved = #reserved - :one, #available = #available + :one, #updatedAt = :now ADD #revision :one",
                            ConditionExpression: "#reserved >= :one",
                            ExpressionAttributeNames: {
                                "#reserved": "reserved",
                                "#available": "available",
                                "#updatedAt": "updatedAt",
                                "#revision": "revision",
                            },
                            ExpressionAttributeValues: {
                                ":one": 1,
                                ":now": timestamp,
                            },
                        },
                    },
                    {
                        Update: {
                            TableName: requiredEnv("QUOTA_RESERVATIONS_TABLE"),
                            Key: { reservationId: id },
                            UpdateExpression:
                                "SET #status = :released, releaseReason = :reason, updatedAt = :now, ttlExpiresAt = :ttl REMOVE reservationExpiresAt",
                            ConditionExpression: "#status = :reserved",
                            ExpressionAttributeNames: { "#status": "status" },
                            ExpressionAttributeValues: {
                                ":released": "released",
                                ":reserved": "reserved",
                                ":reason": reason,
                                ":now": timestamp,
                                ":ttl": nowSeconds() + 2592000,
                            },
                        },
                    },
                ],
                ClientRequestToken: requestDigest(`release|${id}`).slice(0, 36),
            }),
        );
        return { released: true };
    } catch (error) {
        if (
            [
                "TransactionCanceledException",
                "ConditionalCheckFailedException",
            ].includes(error.name)
        ) {
            return { released: false, replay: true };
        }
        throw error;
    }
}

async function storeResponse(reservationIdValue, response) {
    const body =
        typeof response?.body === "string"
            ? response.body.slice(0, 200000)
            : JSON.stringify(response?.body || {});
    await documentClient.send(
        new UpdateCommand({
            TableName: requiredEnv("QUOTA_RESERVATIONS_TABLE"),
            Key: { reservationId: reservationIdValue },
            UpdateExpression:
                "SET responseStatusCode = :status, responseBody = :body, updatedAt = :now",
            ExpressionAttributeValues: {
                ":status": Number(response?.statusCode || 200),
                ":body": body,
                ":now": nowIso(),
            },
        }),
    );
}

function replayResponse(item) {
    if (!item || !item.responseStatusCode) {
        return null;
    }
    return {
        statusCode: Number(item.responseStatusCode),
        headers: {
            "Content-Type": "application/json",
            "Idempotency-Replayed": "true",
        },
        body: item.responseBody || "{}",
    };
}

async function consumeEventReservation(sourceReservationId, eventId) {
    const source = await getReservation(sourceReservationId);
    const occId = occupancyId("EVENT", eventId);
    const existing = await getReservation(occId);
    if (existing) {
        return { replay: true, occupancy: existing };
    }
    if (!source || source.status !== "reserved") {
        throw new QuotaError(
            "QUOTA_RESERVATION_MISSING",
            "The event reservation is unavailable.",
            409,
        );
    }
    const timestamp = nowIso();
    const occupancy = {
        ...source,
        reservationId: occId,
        sourceReservationId,
        resourceId: eventId,
        resourceType: "event",
        status: "used",
        reservationExpiresAt: undefined,
        invitationExpiresAt: undefined,
        ttlExpiresAt: undefined,
        updatedAt: timestamp,
    };
    await documentClient.send(
        new TransactWriteCommand({
            TransactItems: [
                {
                    Update: {
                        TableName: requiredEnv("QUOTA_COUNTERS_TABLE"),
                        Key: { counterKey: source.counterKey },
                        UpdateExpression:
                            "SET #reserved = #reserved - :one, #used = #used + :one, #updatedAt = :now ADD #revision :one",
                        ConditionExpression: "#reserved >= :one",
                        ExpressionAttributeNames: {
                            "#reserved": "reserved",
                            "#used": "used",
                            "#updatedAt": "updatedAt",
                            "#revision": "revision",
                        },
                        ExpressionAttributeValues: {
                            ":one": 1,
                            ":now": timestamp,
                        },
                    },
                },
                {
                    Update: {
                        TableName: requiredEnv("QUOTA_RESERVATIONS_TABLE"),
                        Key: { reservationId: sourceReservationId },
                        UpdateExpression:
                            "SET #status = :linked, resourceId = :resourceId, updatedAt = :now, ttlExpiresAt = :ttl REMOVE reservationExpiresAt",
                        ConditionExpression: "#status = :reserved",
                        ExpressionAttributeNames: { "#status": "status" },
                        ExpressionAttributeValues: {
                            ":linked": "linked",
                            ":reserved": "reserved",
                            ":resourceId": eventId,
                            ":now": timestamp,
                            ":ttl": nowSeconds() + 2592000,
                        },
                    },
                },
                {
                    Put: {
                        TableName: requiredEnv("QUOTA_RESERVATIONS_TABLE"),
                        Item: occupancy,
                        ConditionExpression:
                            "attribute_not_exists(reservationId)",
                    },
                },
            ],
            ClientRequestToken: requestDigest(`event-consume|${eventId}`).slice(
                0,
                36,
            ),
        }),
    );
    return { replay: false, occupancy };
}

async function linkInvitationReservation(sourceReservationId, invitation) {
    const invitationId = invitation.invitationId;
    const source = await getReservation(sourceReservationId);
    const occId = occupancyId("INVITATION", invitationId);
    const existing = await getReservation(occId);
    if (existing) {
        return { replay: true, occupancy: existing };
    }
    if (!source || source.status !== "reserved") {
        throw new QuotaError(
            "QUOTA_RESERVATION_MISSING",
            "The invitation reservation is unavailable.",
            409,
        );
    }
    const timestamp = nowIso();
    const occupancy = {
        ...source,
        reservationId: occId,
        sourceReservationId,
        resourceId: invitationId,
        resourceType: "invitation",
        invitationId,
        status: "reserved",
        invitationExpiresAt: expirySeconds(
            invitation.expiresAt,
            source.reservationExpiresAt,
        ),
        reservationExpiresAt: undefined,
        updatedAt: timestamp,
    };
    await documentClient.send(
        new TransactWriteCommand({
            TransactItems: [
                {
                    Update: {
                        TableName: requiredEnv("QUOTA_RESERVATIONS_TABLE"),
                        Key: { reservationId: sourceReservationId },
                        UpdateExpression:
                            "SET #status = :linked, resourceId = :resourceId, updatedAt = :now, ttlExpiresAt = :ttl REMOVE reservationExpiresAt",
                        ConditionExpression: "#status = :reserved",
                        ExpressionAttributeNames: { "#status": "status" },
                        ExpressionAttributeValues: {
                            ":linked": "linked",
                            ":reserved": "reserved",
                            ":resourceId": invitationId,
                            ":now": timestamp,
                            ":ttl": nowSeconds() + 2592000,
                        },
                    },
                },
                {
                    Put: {
                        TableName: requiredEnv("QUOTA_RESERVATIONS_TABLE"),
                        Item: occupancy,
                        ConditionExpression:
                            "attribute_not_exists(reservationId)",
                    },
                },
            ],
            ClientRequestToken: requestDigest(
                `invite-link|${invitationId}`,
            ).slice(0, 36),
        }),
    );
    return { replay: false, occupancy };
}

async function consumeInvitationReservation(invitationId, standId) {
    const inviteId = occupancyId("INVITATION", invitationId);
    const standOccId = occupancyId("STAND", standId);
    const invitation = await getReservation(inviteId);
    const existingStand = await getReservation(standOccId);
    if (existingStand) {
        return { replay: true, occupancy: existingStand };
    }
    if (!invitation || invitation.status !== "reserved") {
        throw new QuotaError(
            "INVITATION_QUOTA_RESERVATION_MISSING",
            "The invitation does not own a reserved stand slot.",
            409,
        );
    }
    const timestamp = nowIso();
    const standOccupancy = {
        ...invitation,
        reservationId: standOccId,
        sourceInvitationReservationId: inviteId,
        resourceId: standId,
        resourceType: "stand",
        standId,
        status: "used",
        reservationExpiresAt: undefined,
        invitationExpiresAt: undefined,
        ttlExpiresAt: undefined,
        updatedAt: timestamp,
    };
    await documentClient.send(
        new TransactWriteCommand({
            TransactItems: [
                {
                    Update: {
                        TableName: requiredEnv("QUOTA_COUNTERS_TABLE"),
                        Key: { counterKey: invitation.counterKey },
                        UpdateExpression:
                            "SET #reserved = #reserved - :one, #used = #used + :one, #updatedAt = :now ADD #revision :one",
                        ConditionExpression: "#reserved >= :one",
                        ExpressionAttributeNames: {
                            "#reserved": "reserved",
                            "#used": "used",
                            "#updatedAt": "updatedAt",
                            "#revision": "revision",
                        },
                        ExpressionAttributeValues: {
                            ":one": 1,
                            ":now": timestamp,
                        },
                    },
                },
                {
                    Update: {
                        TableName: requiredEnv("QUOTA_RESERVATIONS_TABLE"),
                        Key: { reservationId: inviteId },
                        UpdateExpression:
                            "SET #status = :consumed, standId = :standId, updatedAt = :now, ttlExpiresAt = :ttl REMOVE invitationExpiresAt",
                        ConditionExpression: "#status = :reserved",
                        ExpressionAttributeNames: { "#status": "status" },
                        ExpressionAttributeValues: {
                            ":consumed": "consumed",
                            ":reserved": "reserved",
                            ":standId": standId,
                            ":now": timestamp,
                            ":ttl": nowSeconds() + 2592000,
                        },
                    },
                },
                {
                    Put: {
                        TableName: requiredEnv("QUOTA_RESERVATIONS_TABLE"),
                        Item: standOccupancy,
                        ConditionExpression:
                            "attribute_not_exists(reservationId)",
                    },
                },
            ],
            ClientRequestToken: requestDigest(
                `invite-consume|${invitationId}|${standId}`,
            ).slice(0, 36),
        }),
    );
    return { replay: false, occupancy: standOccupancy };
}

async function releaseOccupancy(kind, resourceId, reason) {
    const id = occupancyId(kind, resourceId);
    const occupancy = await getReservation(id);
    if (!occupancy || !["used", "reserved"].includes(occupancy.status)) {
        return { released: false, replay: true };
    }
    const field = occupancy.status === "used" ? "used" : "reserved";
    const timestamp = nowIso();
    try {
        await documentClient.send(
            new TransactWriteCommand({
                TransactItems: [
                    {
                        Update: {
                            TableName: requiredEnv("QUOTA_COUNTERS_TABLE"),
                            Key: { counterKey: occupancy.counterKey },
                            UpdateExpression:
                                "SET #field = #field - :one, #available = #available + :one, #updatedAt = :now ADD #revision :one",
                            ConditionExpression: "#field >= :one",
                            ExpressionAttributeNames: {
                                "#field": field,
                                "#available": "available",
                                "#updatedAt": "updatedAt",
                                "#revision": "revision",
                            },
                            ExpressionAttributeValues: {
                                ":one": 1,
                                ":now": timestamp,
                            },
                        },
                    },
                    {
                        Update: {
                            TableName: requiredEnv("QUOTA_RESERVATIONS_TABLE"),
                            Key: { reservationId: id },
                            UpdateExpression:
                                "SET #status = :released, releaseReason = :reason, updatedAt = :now, ttlExpiresAt = :ttl REMOVE invitationExpiresAt, reservationExpiresAt",
                            ConditionExpression: "#status = :oldStatus",
                            ExpressionAttributeNames: { "#status": "status" },
                            ExpressionAttributeValues: {
                                ":released": "released",
                                ":oldStatus": occupancy.status,
                                ":reason": reason,
                                ":now": timestamp,
                                ":ttl": nowSeconds() + 2592000,
                            },
                        },
                    },
                ],
                ClientRequestToken: requestDigest(
                    `occupancy-release|${id}`,
                ).slice(0, 36),
            }),
        );
        return { released: true };
    } catch (error) {
        if (
            [
                "TransactionCanceledException",
                "ConditionalCheckFailedException",
            ].includes(error.name)
        ) {
            return { released: false, replay: true };
        }
        throw error;
    }
}

async function ensureInvitationOccupancy({
    organizationId,
    eventId,
    invitationId,
    expiresAt,
    actorUserId,
}) {
    const id = occupancyId("INVITATION", invitationId);
    const existing = await getReservation(id);
    if (existing) {
        return existing;
    }
    const requestHash = requestDigest(`legacy-invitation|${invitationId}`);
    const reserved = await reserveStandSlot({
        organizationId,
        eventId,
        idempotencyKey: `legacy-invitation:${invitationId}`,
        requestHash,
        actorUserId,
        ttlSeconds: Math.max(
            60,
            expirySeconds(expiresAt, nowSeconds() + 900) - nowSeconds(),
        ),
    });
    const linked = await linkInvitationReservation(
        reserved.reservation.reservationId,
        { invitationId, expiresAt },
    );
    return linked.occupancy;
}

async function setCounterAbsolute(counter, expected, desired) {
    const timestamp = nowIso();
    const result = await documentClient.send(
        new UpdateCommand({
            TableName: requiredEnv("QUOTA_COUNTERS_TABLE"),
            Key: { counterKey: counter.counterKey },
            UpdateExpression:
                "SET #limit = :limit, #used = :used, #reserved = :reserved, #available = :available, #overLimit = :overLimit, #updatedAt = :now ADD #revision :one",
            ConditionExpression:
                "#revision = :expectedRevision AND #limit = :expectedLimit AND #used = :expectedUsed AND #reserved = :expectedReserved AND #available = :expectedAvailable",
            ExpressionAttributeNames: {
                "#limit": "limit",
                "#used": "used",
                "#reserved": "reserved",
                "#available": "available",
                "#overLimit": "overLimit",
                "#updatedAt": "updatedAt",
                "#revision": "revision",
            },
            ExpressionAttributeValues: {
                ":limit": desired.limit,
                ":used": desired.used,
                ":reserved": desired.reserved,
                ":available": desired.available,
                ":overLimit": desired.used + desired.reserved > desired.limit,
                ":now": timestamp,
                ":one": 1,
                ":expectedRevision": expected.revision,
                ":expectedLimit": expected.limit,
                ":expectedUsed": expected.used,
                ":expectedReserved": expected.reserved,
                ":expectedAvailable": expected.available,
            },
            ReturnValues: "ALL_NEW",
        }),
    );
    return result.Attributes;
}

module.exports = {
    documentClient,
    requiredEnv,
    requestDigest,
    reservationId,
    occupancyId,
    eventCounterKey,
    standCounterKey,
    extractLimit,
    readEntitlement,
    queryAll,
    scanAll,
    queryOrScan,
    eventCountsAsActive,
    standCountsAsUsed,
    expirySeconds,
    invitationCountsAsReserved,
    calculateEventUsage,
    calculateStandUsage,
    getCounter,
    initializeCounter,
    refreshCounterLimit,
    ensureEventCounter,
    ensureStandCounter,
    getReservation,
    reserveEventSlot,
    reserveStandSlot,
    releaseSourceReservation,
    storeResponse,
    replayResponse,
    consumeEventReservation,
    linkInvitationReservation,
    consumeInvitationReservation,
    releaseOccupancy,
    ensureInvitationOccupancy,
    setCounterAbsolute,
};
