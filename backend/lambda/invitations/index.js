"use strict";

const { randomUUID } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
    TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const { respond, preflight } = require("../common/cors");
const { withObservability } = require("../common/observability");
const { parseJsonBody, hasExactShape } = require("../common/validation");
const { cleanText, slugify } = require("../common/domain");
const {
    identity,
    authorizeOrganization,
    getMembership,
} = require("../common/tenant");
const { writeAuditEvent } = require("../common/audit");
const {
    parseLimit,
    decodeCursor,
    encodeCursor,
} = require("../common/pagination");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESv2Client({});
const ORGANIZATIONS_TABLE = process.env.ORGANIZATIONS_TABLE;
const EVENTS_TABLE = process.env.EVENTS_TABLE;
const MEMBERSHIPS_TABLE = process.env.MEMBERSHIPS_TABLE;
const INVITATIONS_TABLE = process.env.INVITATIONS_TABLE;
const ENTITLEMENTS_TABLE = process.env.ENTITLEMENTS_TABLE;
const STANDS_TABLE = process.env.STANDS_TABLE;
const AUDIT_TABLE = process.env.AUDIT_TABLE;
const EVENT_STANDS_INDEX =
    process.env.EVENT_STANDS_INDEX || "event-stands-index";
const EVENT_INVITATIONS_INDEX =
    process.env.EVENT_INVITATIONS_INDEX || "event-invitations-index";
const EMAIL_MODE = process.env.INVITATION_EMAIL_MODE || "disabled";
const EMAIL_FROM = process.env.INVITATION_EMAIL_FROM || "";
const EMAIL_CONFIGURATION_SET = process.env.EMAIL_CONFIGURATION_SET || "";
const APP_URL = process.env.APP_URL || "http://127.0.0.1:3000";

function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function eventInvitationKey(organizationId, eventId) {
    return `${organizationId}#${eventId}`;
}

function publicInvitation(item) {
    if (!item) {
        return null;
    }
    const { ttl: _ttl, deliveryMessageId: _deliveryMessageId, ...safe } = item;
    return safe;
}

async function loadEvent(organizationId, eventId) {
    const result = await client.send(
        new GetCommand({ TableName: EVENTS_TABLE, Key: { eventId } }),
    );
    return result.Item?.organizationId === organizationId ? result.Item : null;
}

async function sendInvitationEmail(invitation, eventItem, organization) {
    if (EMAIL_MODE === "disabled") {
        return { status: "disabled", messageId: null };
    }
    if (EMAIL_MODE === "simulated") {
        return {
            status: "simulated",
            messageId: `sim_${invitation.invitationId}`,
        };
    }
    if (!EMAIL_FROM) {
        throw new Error("INVITATION_EMAIL_FROM is required");
    }
    const link = `${APP_URL.replace(/\/$/, "")}/#/invitation/${encodeURIComponent(
        invitation.invitationId,
    )}`;
    const command = new SendEmailCommand({
        FromEmailAddress: EMAIL_FROM,
        Destination: { ToAddresses: [invitation.email] },
        ConfigurationSetName: EMAIL_CONFIGURATION_SET || undefined,
        EmailTags: [
            { Name: "invitationId", Value: invitation.invitationId },
            { Name: "organizationId", Value: invitation.organizationId },
        ],
        Content: {
            Simple: {
                Subject: {
                    Data: `Invitation to ${eventItem.name}`,
                    Charset: "UTF-8",
                },
                Body: {
                    Text: {
                        Data: `${organization.name} invited you to manage ${invitation.standName} at ${eventItem.name}. Accept by ${invitation.expiresAt}: ${link}`,
                        Charset: "UTF-8",
                    },
                    Html: {
                        Data: `<h1>You are invited</h1><p>${escapeEmailHtml(
                            organization.name,
                        )} invited you to manage <strong>${escapeEmailHtml(
                            invitation.standName,
                        )}</strong> at ${escapeEmailHtml(
                            eventItem.name,
                        )}.</p><p><a href="${link}">Accept invitation</a></p><p>This link expires ${escapeEmailHtml(
                            invitation.expiresAt,
                        )}.</p>`,
                        Charset: "UTF-8",
                    },
                },
            },
        },
    });
    const result = await ses.send(command);
    return { status: "sent", messageId: result.MessageId || null };
}

function escapeEmailHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function recordDelivery(invitationId, delivery, error = null) {
    await client.send(
        new UpdateCommand({
            TableName: INVITATIONS_TABLE,
            Key: { invitationId },
            UpdateExpression:
                "SET deliveryStatus = :status, deliveryMessageId = :messageId, deliveryError = :error, lastSentAt = :now, sendCount = if_not_exists(sendCount, :zero) + :one",
            ExpressionAttributeValues: {
                ":status": delivery?.status || "failed",
                ":messageId": delivery?.messageId || null,
                ":error": error
                    ? String(error.message || error).slice(0, 300)
                    : null,
                ":now": new Date().toISOString(),
                ":zero": 0,
                ":one": 1,
            },
        }),
    );
}

async function deliver(invitation, eventItem, organization) {
    try {
        const delivery = await sendInvitationEmail(
            invitation,
            eventItem,
            organization,
        );
        await recordDelivery(invitation.invitationId, delivery);
        return delivery;
    } catch (error) {
        await recordDelivery(invitation.invitationId, null, error);
        return { status: "failed", messageId: null };
    }
}

async function createInvitation(event, organizationId, eventId) {
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
    const [eventItem, organizationResult] = await Promise.all([
        loadEvent(organizationId, eventId),
        client.send(
            new GetCommand({
                TableName: ORGANIZATIONS_TABLE,
                Key: { organizationId },
            }),
        ),
    ]);
    if (!eventItem) {
        return respond(404, { error: "EVENT_NOT_FOUND" }, event);
    }
    const parsed = parseJsonBody(event);
    if (
        parsed.error ||
        !hasExactShape(parsed.value, [
            "email",
            "standName",
            "message",
            "expiresInDays",
        ])
    ) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const email = cleanText(parsed.value.email, 254).toLowerCase();
    const standName = cleanText(parsed.value.standName, 160);
    const expiresInDays = Math.min(
        Math.max(Number.parseInt(parsed.value.expiresInDays || "14", 10), 1),
        30,
    );
    if (!validEmail(email) || !standName) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const [entitlementResult, standCount] = await Promise.all([
        client.send(
            new GetCommand({
                TableName: ENTITLEMENTS_TABLE,
                Key: { organizationId },
            }),
        ),
        client.send(
            new QueryCommand({
                TableName: STANDS_TABLE,
                IndexName: EVENT_STANDS_INDEX,
                KeyConditionExpression: "eventId = :eventId",
                ExpressionAttributeValues: { ":eventId": eventId },
                Select: "COUNT",
            }),
        ),
    ]);
    const entitlement = entitlementResult.Item;
    if (!entitlement || entitlement.status !== "active") {
        return respond(403, { error: "ENTITLEMENT_REQUIRED" }, event);
    }
    if ((standCount.Count || 0) >= entitlement.maxStandsPerEvent) {
        return respond(409, { error: "STAND_LIMIT_REACHED" }, event);
    }
    const now = new Date();
    const invitation = {
        invitationId: `inv_${randomUUID()}`,
        organizationId,
        eventId,
        organizationEventKey: eventInvitationKey(organizationId, eventId),
        email,
        role: "exhibitor",
        standName,
        standSlug: slugify(standName),
        message: cleanText(parsed.value.message, 2000),
        status: "pending",
        deliveryStatus: "queued",
        sendCount: 0,
        invitedBy: auth.actor.userId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt: new Date(
            now.getTime() + expiresInDays * 86400000,
        ).toISOString(),
        ttl: Math.floor(now.getTime() / 1000) + 45 * 86400,
        schemaVersion: 2,
    };
    await client.send(
        new PutCommand({
            TableName: INVITATIONS_TABLE,
            Item: invitation,
            ConditionExpression: "attribute_not_exists(invitationId)",
        }),
    );
    const delivery = await deliver(
        invitation,
        eventItem,
        organizationResult.Item || { name: "AI Pavilion" },
    );
    await writeAuditEvent(client, AUDIT_TABLE, {
        organizationId,
        actorUserId: auth.actor.userId,
        action: "invitation.created",
        resourceType: "invitation",
        resourceId: invitation.invitationId,
        requestId: event.requestId,
        metadata: { eventId, email, deliveryStatus: delivery.status },
    });
    return respond(
        201,
        {
            invitation: publicInvitation({
                ...invitation,
                deliveryStatus: delivery.status,
            }),
        },
        event,
    );
}

async function listInvitations(event, organizationId, eventId) {
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
    if (!(await loadEvent(organizationId, eventId))) {
        return respond(404, { error: "EVENT_NOT_FOUND" }, event);
    }
    const params = event.queryStringParameters || {};
    const limit = parseLimit(params.limit, 25, 100);
    const cursor = decodeCursor(params.cursor);
    if (params.cursor && cursor === null) {
        return respond(400, { error: "INVALID_CURSOR" }, event);
    }
    const result = await client.send(
        new QueryCommand({
            TableName: INVITATIONS_TABLE,
            IndexName: EVENT_INVITATIONS_INDEX,
            KeyConditionExpression: "organizationEventKey = :key",
            ExpressionAttributeValues: {
                ":key": eventInvitationKey(organizationId, eventId),
            },
            ScanIndexForward: false,
            Limit: limit,
            ExclusiveStartKey: cursor,
        }),
    );
    return respond(
        200,
        {
            invitations: (result.Items || []).map(publicInvitation),
            nextCursor: encodeCursor(result.LastEvaluatedKey),
        },
        event,
    );
}

async function manageInvitation(
    event,
    organizationId,
    eventId,
    invitationId,
    action,
) {
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
    const [invitationResult, eventItem, organizationResult] = await Promise.all(
        [
            client.send(
                new GetCommand({
                    TableName: INVITATIONS_TABLE,
                    Key: { invitationId },
                    ConsistentRead: true,
                }),
            ),
            loadEvent(organizationId, eventId),
            client.send(
                new GetCommand({
                    TableName: ORGANIZATIONS_TABLE,
                    Key: { organizationId },
                }),
            ),
        ],
    );
    const invitation = invitationResult.Item;
    if (
        !invitation ||
        invitation.organizationId !== organizationId ||
        invitation.eventId !== eventId ||
        !eventItem
    ) {
        return respond(404, { error: "INVITATION_NOT_FOUND" }, event);
    }
    if (action === "revoke") {
        if (invitation.status !== "pending") {
            return respond(409, { error: "INVITATION_NOT_PENDING" }, event);
        }
        await client.send(
            new UpdateCommand({
                TableName: INVITATIONS_TABLE,
                Key: { invitationId },
                UpdateExpression:
                    "SET #status = :revoked, revokedAt = :now, revokedBy = :actor, updatedAt = :now",
                ConditionExpression: "#status = :pending",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                    ":revoked": "revoked",
                    ":pending": "pending",
                    ":now": new Date().toISOString(),
                    ":actor": auth.actor.userId,
                },
            }),
        );
        await writeAuditEvent(client, AUDIT_TABLE, {
            organizationId,
            actorUserId: auth.actor.userId,
            action: "invitation.revoked",
            resourceType: "invitation",
            resourceId: invitationId,
            requestId: event.requestId,
            metadata: { eventId },
        });
        return respond(200, { revoked: true }, event);
    }
    if (invitation.status !== "pending") {
        return respond(409, { error: "INVITATION_NOT_PENDING" }, event);
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 86400000).toISOString();
    await client.send(
        new UpdateCommand({
            TableName: INVITATIONS_TABLE,
            Key: { invitationId },
            UpdateExpression:
                "SET expiresAt = :expiresAt, updatedAt = :now, deliveryStatus = :queued, #ttl = :ttl",
            ExpressionAttributeNames: { "#ttl": "ttl" },
            ExpressionAttributeValues: {
                ":expiresAt": expiresAt,
                ":now": now.toISOString(),
                ":queued": "queued",
                ":ttl": Math.floor(now.getTime() / 1000) + 45 * 86400,
            },
        }),
    );
    const delivery = await deliver(
        { ...invitation, expiresAt },
        eventItem,
        organizationResult.Item || { name: "AI Pavilion" },
    );
    await writeAuditEvent(client, AUDIT_TABLE, {
        organizationId,
        actorUserId: auth.actor.userId,
        action: "invitation.resent",
        resourceType: "invitation",
        resourceId: invitationId,
        requestId: event.requestId,
        metadata: { eventId, deliveryStatus: delivery.status },
    });
    return respond(
        200,
        { resent: true, deliveryStatus: delivery.status, expiresAt },
        event,
    );
}

async function acceptInvitation(event, invitationId) {
    const actor = identity(event);
    if (!actor.userId || !actor.email) {
        return respond(401, { error: "UNAUTHORIZED" }, event);
    }
    const result = await client.send(
        new GetCommand({
            TableName: INVITATIONS_TABLE,
            Key: { invitationId },
            ConsistentRead: true,
        }),
    );
    const invitation = result.Item;
    if (!invitation) {
        return respond(404, { error: "INVITATION_NOT_FOUND" }, event);
    }
    if (
        invitation.status === "accepted" &&
        invitation.acceptedBy === actor.userId
    ) {
        return respond(
            200,
            {
                accepted: true,
                duplicate: true,
                organizationId: invitation.organizationId,
                eventId: invitation.eventId,
                standId: invitation.standId,
            },
            event,
        );
    }
    if (invitation.status !== "pending") {
        return respond(409, { error: "INVITATION_NOT_PENDING" }, event);
    }
    if (new Date(invitation.expiresAt) <= new Date()) {
        return respond(410, { error: "INVITATION_EXPIRED" }, event);
    }
    if (invitation.email !== actor.email) {
        return respond(403, { error: "INVITATION_EMAIL_MISMATCH" }, event);
    }
    const [organizationResult, eventItem, existingMembership] =
        await Promise.all([
            client.send(
                new GetCommand({
                    TableName: ORGANIZATIONS_TABLE,
                    Key: { organizationId: invitation.organizationId },
                }),
            ),
            loadEvent(invitation.organizationId, invitation.eventId),
            getMembership(
                client,
                MEMBERSHIPS_TABLE,
                actor.userId,
                invitation.organizationId,
            ),
        ]);
    if (
        !organizationResult.Item ||
        organizationResult.Item.status !== "active"
    ) {
        return respond(409, { error: "ORGANIZATION_INACTIVE" }, event);
    }
    if (!eventItem) {
        return respond(409, { error: "EVENT_NOT_AVAILABLE" }, event);
    }
    const now = new Date().toISOString();
    const standId = invitation.standId || `stand_${randomUUID()}`;
    const stand = {
        stand_id: standId,
        organizationId: invitation.organizationId,
        eventId: invitation.eventId,
        ownerUserId: actor.userId,
        exhibitorUserId: actor.userId,
        name: invitation.standName,
        slug: invitation.standSlug,
        description: "",
        category: "general",
        status: "draft",
        eventStatus: eventItem.status,
        visibility: "public",
        publicationKey: `draft#${now}`,
        products: [],
        images: [],
        createdAt: now,
        updatedAt: now,
        created_at: now,
        updated_at: now,
        schemaVersion: 3,
    };
    const transactItems = [
        {
            Put: {
                TableName: STANDS_TABLE,
                Item: stand,
                ConditionExpression: "attribute_not_exists(stand_id)",
            },
        },
        {
            Update: {
                TableName: INVITATIONS_TABLE,
                Key: { invitationId },
                UpdateExpression:
                    "SET #status = :accepted, acceptedBy = :userId, acceptedAt = :now, standId = :standId, updatedAt = :now",
                ConditionExpression: "#status = :pending AND email = :email",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                    ":accepted": "accepted",
                    ":pending": "pending",
                    ":email": actor.email,
                    ":userId": actor.userId,
                    ":now": now,
                    ":standId": standId,
                },
            },
        },
    ];
    if (!existingMembership) {
        transactItems.push({
            Put: {
                TableName: MEMBERSHIPS_TABLE,
                Item: {
                    userId: actor.userId,
                    organizationId: invitation.organizationId,
                    membershipKey: `exhibitor#${actor.userId}`,
                    role: "exhibitor",
                    status: "active",
                    invitedBy: invitation.invitedBy,
                    joinedAt: now,
                    updatedAt: now,
                    schemaVersion: 1,
                },
                ConditionExpression:
                    "attribute_not_exists(userId) AND attribute_not_exists(organizationId)",
            },
        });
    }
    try {
        await client.send(
            new TransactWriteCommand({ TransactItems: transactItems }),
        );
        await writeAuditEvent(client, AUDIT_TABLE, {
            organizationId: invitation.organizationId,
            actorUserId: actor.userId,
            action: "invitation.accepted",
            resourceType: "stand",
            resourceId: standId,
            requestId: event.requestId,
            metadata: { eventId: invitation.eventId, invitationId },
        });
        return respond(
            200,
            {
                accepted: true,
                organizationId: invitation.organizationId,
                eventId: invitation.eventId,
                stand,
            },
            event,
        );
    } catch (error) {
        if (error.name === "TransactionCanceledException") {
            return respond(409, { error: "INVITATION_ALREADY_USED" }, event);
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
        const collectionMatch = path.match(
            /^\/organizations\/([^/]+)\/events\/([^/]+)\/invitations$/,
        );
        if (collectionMatch) {
            const organizationId = decodeURIComponent(collectionMatch[1]);
            const eventId = decodeURIComponent(collectionMatch[2]);
            if (event.httpMethod === "POST") {
                return createInvitation(event, organizationId, eventId);
            }
            if (event.httpMethod === "GET") {
                return listInvitations(event, organizationId, eventId);
            }
        }
        const itemMatch = path.match(
            /^\/organizations\/([^/]+)\/events\/([^/]+)\/invitations\/([^/]+)(?:\/(resend))?$/,
        );
        if (itemMatch) {
            const organizationId = decodeURIComponent(itemMatch[1]);
            const eventId = decodeURIComponent(itemMatch[2]);
            const invitationId = decodeURIComponent(itemMatch[3]);
            if (event.httpMethod === "DELETE" && !itemMatch[4]) {
                return manageInvitation(
                    event,
                    organizationId,
                    eventId,
                    invitationId,
                    "revoke",
                );
            }
            if (event.httpMethod === "POST" && itemMatch[4] === "resend") {
                return manageInvitation(
                    event,
                    organizationId,
                    eventId,
                    invitationId,
                    "resend",
                );
            }
        }
        const acceptMatch = path.match(/^\/invitations\/([^/]+)\/accept$/);
        if (acceptMatch && event.httpMethod === "POST") {
            return acceptInvitation(event, decodeURIComponent(acceptMatch[1]));
        }
        return respond(404, { error: "NOT_FOUND" }, event);
    } catch (error) {
        console.error("Invitations API failed", error);
        return respond(500, { error: "INTERNAL_ERROR" }, event);
    }
};

exports.handler = withObservability("invitations", handler);
exports.escapeEmailHtml = escapeEmailHtml;
