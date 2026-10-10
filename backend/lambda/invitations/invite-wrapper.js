"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
    ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const quota = require("../common/quota-store");
const { authorizeQuotaMutation } = require("../common/quota-authorization");
const { respond, corsHeaders } = require("../common/cors");
const {
    InvitePolicyError,
    normalizeEmail,
    assertInvitationAcceptable,
    isExpired,
} = require("../common/invite-policy");

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
});

function method(event) {
    return String(
        event.httpMethod || event.requestContext?.http?.method || "",
    ).toUpperCase();
}

function route(event) {
    return String(
        event.resource || event.routeKey || event.rawPath || event.path || "",
    );
}

function headers(event) {
    const result = {};
    for (const [key, value] of Object.entries(event.headers || {})) {
        result[String(key).toLowerCase()] = value;
    }
    return result;
}

function actorUserId(event) {
    return (
        event.requestContext?.authorizer?.claims?.sub ||
        event.requestContext?.authorizer?.jwt?.claims?.sub ||
        event.requestContext?.authorizer?.principalId
    );
}

function parseBody(event) {
    if (!event.body) {
        return {};
    }
    if (typeof event.body === "object") {
        return event.body;
    }
    try {
        return JSON.parse(event.body);
    } catch {
        return {};
    }
}

function parseResponseBody(response) {
    if (!response?.body) {
        return {};
    }
    if (typeof response.body === "object") {
        return response.body;
    }
    try {
        return JSON.parse(response.body);
    } catch {
        return {};
    }
}

function findId(value, keys) {
    if (!value || typeof value !== "object") {
        return undefined;
    }
    for (const key of keys) {
        if (typeof value[key] === "string" && value[key]) {
            return value[key];
        }
    }
    for (const child of Object.values(value)) {
        if (child && typeof child === "object") {
            const found = findId(child, keys);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}

function responseStatus(response) {
    return Number(response?.statusCode || 200);
}

function isSuccess(response) {
    const status = responseStatus(response);
    return status >= 200 && status < 300;
}

function jsonError(error, event) {
    const statusCode = Number(error.statusCode || 500);
    const publicMessage =
        statusCode >= 500
            ? "The invitation operation could not be completed."
            : error.message;
    return respond(
        statusCode,
        {
            error: {
                code: error.code || "INVITATION_INTERNAL_ERROR",
                message: publicMessage,
                retryable: statusCode >= 500,
                details: statusCode < 500 ? error.details : undefined,
            },
        },
        event,
    );
}

function requestKey(event, prefix) {
    const supplied = headers(event)["idempotency-key"];
    if (supplied && String(supplied).length <= 200) {
        return String(supplied);
    }
    return `auto:${prefix}:${quota.requestDigest(`${actorUserId(event)}|${route(event)}|${event.body || ""}`)}`;
}

function isCreate(event) {
    return (
        method(event) === "POST" &&
        /\/events\/\{?eventId\}?\/invitations\/?$/.test(route(event)) &&
        !event.pathParameters?.invitationId
    );
}

function isAccept(event) {
    return (
        method(event) === "POST" &&
        /\/invitations\/\{?invitationId\}?\/accept\/?$/.test(route(event))
    );
}

function isResend(event) {
    return (
        method(event) === "POST" &&
        /\/invitations\/\{?invitationId\}?\/resend\/?$/.test(route(event))
    );
}

function isRevoke(event) {
    return (
        method(event) === "DELETE" &&
        /\/invitations\/\{?invitationId\}?\/?$/.test(route(event))
    );
}

async function getById(tableName, keyName, id) {
    try {
        const result = await documentClient.send(
            new GetCommand({
                TableName: tableName,
                Key: { [keyName]: id },
                ConsistentRead: true,
            }),
        );
        if (result.Item) {
            return result.Item;
        }
    } catch (error) {
        if (error.name !== "ValidationException") {
            throw error;
        }
    }
    let ExclusiveStartKey;
    do {
        const result = await documentClient.send(
            new ScanCommand({
                TableName: tableName,
                FilterExpression: "#id = :id",
                ExpressionAttributeNames: { "#id": keyName },
                ExpressionAttributeValues: { ":id": id },
                ExclusiveStartKey,
                Limit: 100,
            }),
        );
        if (result.Items?.length) {
            return result.Items[0];
        }
        ExclusiveStartKey = result.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return undefined;
}

async function loadProfile(userId) {
    return getById(process.env.USERS_TABLE, "userId", userId);
}

async function loadInvitation(invitationId) {
    return getById(process.env.INVITATIONS_TABLE, "invitationId", invitationId);
}

async function loadMembership(organizationId, userId) {
    if (!organizationId || !userId) {
        return undefined;
    }
    if (process.env.ORGANIZATION_MEMBERS_INDEX) {
        try {
            let ExclusiveStartKey;
            do {
                const result = await documentClient.send(
                    new QueryCommand({
                        TableName: process.env.MEMBERSHIPS_TABLE,
                        IndexName: process.env.ORGANIZATION_MEMBERS_INDEX,
                        KeyConditionExpression:
                            "organizationId = :organizationId",
                        ExpressionAttributeValues: {
                            ":organizationId": organizationId,
                        },
                        ExclusiveStartKey,
                    }),
                );
                const found = (result.Items || []).find(
                    (item) => item.userId === userId,
                );
                if (found) {
                    return found;
                }
                ExclusiveStartKey = result.LastEvaluatedKey;
            } while (ExclusiveStartKey);
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
    let ExclusiveStartKey;
    do {
        const result = await documentClient.send(
            new ScanCommand({
                TableName: process.env.MEMBERSHIPS_TABLE,
                FilterExpression:
                    "organizationId = :organizationId AND userId = :userId",
                ExpressionAttributeValues: {
                    ":organizationId": organizationId,
                    ":userId": userId,
                },
                ExclusiveStartKey,
                Limit: 100,
            }),
        );
        if (result.Items?.length) {
            return result.Items[0];
        }
        ExclusiveStartKey = result.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return undefined;
}

function replayResponse(reservation, type, event) {
    const stored = quota.replayResponse(reservation);
    if (stored) {
        return {
            ...stored,
            headers: {
                ...stored.headers,
                ...corsHeaders(event),
                "Idempotency-Replayed": "true",
            },
        };
    }
    if (reservation?.resourceId) {
        return respond(
            200,
            { [`${type}Id`]: reservation.resourceId, idempotentReplay: true },
            event,
            { "Idempotency-Replayed": "true" },
        );
    }
    return jsonError(
        new InvitePolicyError(
            "IDEMPOTENCY_RECOVERY_REQUIRED",
            "The previous request is still being reconciled.",
            409,
        ),
        event,
    );
}

async function handleCreate(baseHandler, event, context) {
    const organizationId = event.pathParameters?.organizationId;
    const eventId = event.pathParameters?.eventId;
    const body = parseBody(event);
    const email = normalizeEmail(body.email || body.recipientEmail);
    if (!organizationId || !eventId || !email) {
        return jsonError(
            new InvitePolicyError(
                "INVITATION_INPUT_INVALID",
                "Organization, event and recipient email are required.",
                400,
            ),
            event,
        );
    }
    const key = requestKey(event, "invitation-create");
    const requestHash = quota.requestDigest(
        JSON.stringify({
            organizationId,
            eventId,
            email,
            role: body.role || "exhibitor",
        }),
    );
    let source;
    let writerSucceeded = false;
    try {
        await authorizeQuotaMutation(
            event,
            documentClient,
            organizationId,
            eventId,
        );
        const reserved = await quota.reserveStandSlot({
            organizationId,
            eventId,
            idempotencyKey: key,
            requestHash,
            actorUserId: actorUserId(event),
            ttlSeconds: Number(
                process.env.INVITATION_RESERVATION_TTL_SECONDS || 604800,
            ),
        });
        source = reserved.reservation;
        if (reserved.replay) {
            return replayResponse(source, "invitation", event);
        }

        const response = await baseHandler(event, context);
        if (!isSuccess(response)) {
            await quota.releaseSourceReservation(
                source.reservationId,
                `legacy_status_${responseStatus(response)}`,
            );
            return response;
        }
        writerSucceeded = true;
        const payload = parseResponseBody(response);
        const invitationId = findId(payload, ["invitationId", "id"]);
        if (!invitationId) {
            return jsonError(
                new InvitePolicyError(
                    "INVITATION_ID_MISSING",
                    "The invitation writer returned no identifier.",
                    500,
                ),
                event,
            );
        }
        const expiresAt =
            payload.expiresAt ||
            payload.invitation?.expiresAt ||
            body.expiresAt;
        await quota.linkInvitationReservation(source.reservationId, {
            invitationId,
            expiresAt,
        });
        await quota.storeResponse(source.reservationId, response);
        return response;
    } catch (error) {
        if (
            !writerSucceeded &&
            source?.reservationId &&
            !["QUOTA_EXCEEDED", "IDEMPOTENCY_KEY_REUSED"].includes(error.code)
        ) {
            try {
                await quota.releaseSourceReservation(
                    source.reservationId,
                    "exception",
                );
            } catch {
                /* reconciler */
            }
        }
        return jsonError(error, event);
    }
}

async function handleAccept(baseHandler, event, context) {
    const invitationId = event.pathParameters?.invitationId;
    const userId = actorUserId(event);
    try {
        if (!userId) {
            throw new InvitePolicyError(
                "AUTHENTICATION_REQUIRED",
                "Authentication is required.",
                401,
            );
        }
        if (!invitationId) {
            throw new InvitePolicyError(
                "INVITATION_ID_REQUIRED",
                "Invitation identifier is required.",
                400,
            );
        }
        const invitation = await loadInvitation(invitationId);
        const profile = await loadProfile(userId);
        const membership = invitation
            ? await loadMembership(invitation.organizationId, userId)
            : undefined;
        assertInvitationAcceptable({
            invitation,
            profile,
            membership,
            actorUserId: userId,
        });
        await quota.ensureInvitationOccupancy({
            organizationId: invitation.organizationId,
            eventId: invitation.eventId,
            invitationId,
            expiresAt: invitation.expiresAt,
            actorUserId: userId,
        });

        const response = await baseHandler(event, context);
        if (!isSuccess(response)) {
            const status = String(invitation.status || "").toLowerCase();
            if (status === "revoked" || isExpired(invitation)) {
                await quota.releaseOccupancy(
                    "INVITATION",
                    invitationId,
                    status || "expired",
                );
            }
            return response;
        }
        const payload = parseResponseBody(response);
        const standId = findId(payload, ["standId", "id"]);
        if (!standId) {
            return jsonError(
                new InvitePolicyError(
                    "STAND_ID_MISSING",
                    "Invitation acceptance returned no stand identifier.",
                    500,
                ),
                event,
            );
        }
        await quota.consumeInvitationReservation(invitationId, standId);
        return response;
    } catch (error) {
        if (error.code === "INVITATION_EXPIRED" && invitationId) {
            try {
                await quota.releaseOccupancy(
                    "INVITATION",
                    invitationId,
                    "invitation_expired",
                );
            } catch {
                /* reconciler */
            }
        }
        return jsonError(error, event);
    }
}

async function handleRevoke(baseHandler, event, context) {
    const response = await baseHandler(event, context);
    if (isSuccess(response) && event.pathParameters?.invitationId) {
        await quota.releaseOccupancy(
            "INVITATION",
            event.pathParameters.invitationId,
            "invitation_revoked",
        );
    }
    return response;
}

async function handleResend(baseHandler, event, context) {
    const invitationId = event.pathParameters?.invitationId;
    try {
        await authorizeQuotaMutation(
            event,
            documentClient,
            event.pathParameters?.organizationId,
            event.pathParameters?.eventId,
        );
        const invitation = await loadInvitation(invitationId);
        if (!invitation) {
            throw new InvitePolicyError(
                "INVITATION_NOT_FOUND",
                "The invitation does not exist.",
                404,
            );
        }
        if (
            invitation.organizationId !==
                event.pathParameters?.organizationId ||
            invitation.eventId !== event.pathParameters?.eventId
        ) {
            throw new InvitePolicyError(
                "INVITATION_NOT_FOUND",
                "The invitation does not exist.",
                404,
            );
        }
        if (
            String(invitation.status || "pending").toLowerCase() !== "pending"
        ) {
            throw new InvitePolicyError(
                "INVITATION_NOT_PENDING",
                "Only a pending invitation can be resent.",
                409,
            );
        }
        await quota.ensureInvitationOccupancy({
            organizationId: invitation.organizationId,
            eventId: invitation.eventId,
            invitationId,
            expiresAt: invitation.expiresAt,
            actorUserId: actorUserId(event),
        });
        return baseHandler(event, context);
    } catch (error) {
        return jsonError(error, event);
    }
}

function wrap(baseHandler) {
    if (typeof baseHandler !== "function") {
        throw new TypeError("The invitations handler is not callable.");
    }
    return async function inviteProtocolHandler(event, context) {
        if (isCreate(event)) {
            return handleCreate(baseHandler, event, context);
        }
        if (isAccept(event)) {
            return handleAccept(baseHandler, event, context);
        }
        if (isRevoke(event)) {
            return handleRevoke(baseHandler, event, context);
        }
        if (isResend(event)) {
            return handleResend(baseHandler, event, context);
        }
        return baseHandler(event, context);
    };
}

module.exports = { wrap };
