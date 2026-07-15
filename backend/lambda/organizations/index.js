"use strict";

const { randomUUID } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
    UpdateCommand,
    DeleteCommand,
    PutCommand,
    TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { respond, preflight } = require("../common/cors");
const { withObservability } = require("../common/observability");
const { parseJsonBody, hasExactShape } = require("../common/validation");
const { cleanText, slugify, validSlug, validId } = require("../common/domain");
const {
    identity,
    isPlatformAdmin,
    authorizeOrganization,
    listMemberships,
    getMembership,
} = require("../common/tenant");
const { writeAuditEvent } = require("../common/audit");
const {
    parseLimit,
    decodeCursor,
    encodeCursor,
} = require("../common/pagination");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ORGANIZATIONS_TABLE = process.env.ORGANIZATIONS_TABLE;
const MEMBERSHIPS_TABLE = process.env.MEMBERSHIPS_TABLE;
const ENTITLEMENTS_TABLE = process.env.ENTITLEMENTS_TABLE;
const AUDIT_TABLE = process.env.AUDIT_TABLE;
const ORGANIZATION_MEMBERS_INDEX =
    process.env.ORGANIZATION_MEMBERS_INDEX || "organization-members-index";

function validTimezone(value) {
    try {
        new Intl.DateTimeFormat("en", { timeZone: value }).format();
        return true;
    } catch {
        return false;
    }
}

function validLocale(value) {
    try {
        return Intl.getCanonicalLocales(value).length === 1;
    } catch {
        return false;
    }
}

function privateOrganization(item) {
    if (!item) {
        return null;
    }
    const {
        internalNotes: _internalNotes,
        stripeCustomerId: _stripeCustomerId,
        ownerEmail: _ownerEmail,
        ...safe
    } = item;
    return safe;
}

function organizationIdFor() {
    return `org_${randomUUID()}`;
}

function publicOrganization(item) {
    if (!item) {
        return null;
    }
    const {
        ownerEmail: _ownerEmail,
        billingEmail: _billingEmail,
        internalNotes: _internalNotes,
        ...safe
    } = item;
    return safe;
}

async function createOrganization(event) {
    const actor = identity(event);
    if (!actor.userId) {
        return respond(401, { error: "UNAUTHORIZED" }, event);
    }
    if (!isPlatformAdmin(actor)) {
        return respond(403, { error: "PLATFORM_ADMIN_REQUIRED" }, event);
    }

    const parsed = parseJsonBody(event);
    if (
        parsed.error ||
        !hasExactShape(parsed.value, [
            "name",
            "slug",
            "ownerUserId",
            "ownerEmail",
            "plan",
        ])
    ) {
        return respond(
            400,
            {
                error: "VALIDATION_ERROR",
                message: parsed.error || "Unexpected organization fields",
            },
            event,
        );
    }

    const body = parsed.value;
    const name = cleanText(body.name, 160);
    const slug = cleanText(body.slug, 80) || slugify(name);
    const ownerUserId = cleanText(body.ownerUserId, 120);
    const ownerEmail = cleanText(body.ownerEmail, 254).toLowerCase();
    const plan = ["pilot", "starter", "professional"].includes(body.plan)
        ? body.plan
        : "pilot";
    if (!name || !validSlug(slug) || !validId(ownerUserId)) {
        return respond(
            400,
            {
                error: "VALIDATION_ERROR",
                message: "name, a valid slug and ownerUserId are required",
            },
            event,
        );
    }

    const organizationId = organizationIdFor();
    const now = new Date().toISOString();
    const organization = {
        organizationId,
        name,
        slug,
        status: "active",
        ownerUserId,
        ownerEmail: ownerEmail || null,
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
    };
    const membership = {
        userId: ownerUserId,
        organizationId,
        membershipKey: `owner#${ownerUserId}`,
        role: "owner",
        status: "active",
        invitedBy: actor.userId,
        joinedAt: now,
        updatedAt: now,
        schemaVersion: 1,
    };
    const entitlement = {
        organizationId,
        plan,
        status: "active",
        maxActiveEvents:
            plan === "professional" ? 10 : plan === "starter" ? 3 : 1,
        maxStandsPerEvent:
            plan === "professional" ? 250 : plan === "starter" ? 50 : 20,
        features: {
            whiteLabel: plan === "professional",
            advancedAnalytics: plan === "professional",
            leadExport: true,
        },
        validFrom: now,
        validUntil: new Date(
            Date.now() + 90 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        updatedAt: now,
        schemaVersion: 1,
    };

    try {
        await docClient.send(
            new TransactWriteCommand({
                TransactItems: [
                    {
                        Put: {
                            TableName: ORGANIZATIONS_TABLE,
                            Item: organization,
                            ConditionExpression:
                                "attribute_not_exists(organizationId)",
                        },
                    },
                    {
                        Put: {
                            TableName: MEMBERSHIPS_TABLE,
                            Item: membership,
                            ConditionExpression:
                                "attribute_not_exists(userId) AND attribute_not_exists(organizationId)",
                        },
                    },
                    {
                        Put: {
                            TableName: ENTITLEMENTS_TABLE,
                            Item: entitlement,
                            ConditionExpression:
                                "attribute_not_exists(organizationId)",
                        },
                    },
                ],
            }),
        );
        await writeAuditEvent(docClient, AUDIT_TABLE, {
            organizationId,
            actorUserId: actor.userId,
            action: "organization.created",
            resourceType: "organization",
            resourceId: organizationId,
            requestId: event.requestId,
            metadata: { ownerUserId, plan },
        });
        return respond(
            201,
            {
                organization: publicOrganization(organization),
                membership,
                entitlement,
            },
            event,
        );
    } catch (error) {
        if (error.name === "TransactionCanceledException") {
            return respond(409, { error: "ORGANIZATION_CONFLICT" }, event);
        }
        throw error;
    }
}

async function listMyMemberships(event) {
    const actor = identity(event);
    if (!actor.userId) {
        return respond(401, { error: "UNAUTHORIZED" }, event);
    }
    const params = event.queryStringParameters || {};
    const limit = parseLimit(params.limit, 25, 100);
    const cursor = decodeCursor(params.cursor);
    if (params.cursor && cursor === null) {
        return respond(400, { error: "INVALID_CURSOR" }, event);
    }
    const result = await listMemberships(
        docClient,
        MEMBERSHIPS_TABLE,
        actor.userId,
        { limit, exclusiveStartKey: cursor },
    );
    const memberships = [];
    for (const membership of result.items) {
        const organization = await docClient.send(
            new GetCommand({
                TableName: ORGANIZATIONS_TABLE,
                Key: { organizationId: membership.organizationId },
            }),
        );
        if (organization.Item) {
            memberships.push({
                ...membership,
                organization: publicOrganization(organization.Item),
            });
        }
    }
    return respond(
        200,
        {
            memberships,
            count: memberships.length,
            nextCursor: encodeCursor(result.nextKey),
        },
        event,
    );
}

async function getOrganization(event, organizationId) {
    const auth = await authorizeOrganization({
        event,
        client: docClient,
        membershipsTable: MEMBERSHIPS_TABLE,
        organizationId,
    });
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const result = await docClient.send(
        new GetCommand({
            TableName: ORGANIZATIONS_TABLE,
            Key: { organizationId },
        }),
    );
    if (!result.Item) {
        return respond(404, { error: "ORGANIZATION_NOT_FOUND" }, event);
    }
    return respond(
        200,
        {
            organization: privateOrganization(result.Item),
            membership: auth.membership,
        },
        event,
    );
}

async function updateOrganization(event, organizationId) {
    const auth = await authorizeOrganization({
        event,
        client: docClient,
        membershipsTable: MEMBERSHIPS_TABLE,
        organizationId,
        roles: ["owner", "organizer"],
    });
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const parsed = parseJsonBody(event);
    const allowed = [
        "name",
        "billingEmail",
        "timezone",
        "locale",
        "profileCompleted",
    ];
    if (parsed.error || !hasExactShape(parsed.value, allowed)) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const existing = await docClient.send(
        new GetCommand({
            TableName: ORGANIZATIONS_TABLE,
            Key: { organizationId },
        }),
    );
    if (!existing.Item) {
        return respond(404, { error: "ORGANIZATION_NOT_FOUND" }, event);
    }
    const next = { ...existing.Item };
    if (parsed.value.name !== undefined) {
        next.name = cleanText(parsed.value.name, 160);
    }
    if (parsed.value.billingEmail !== undefined) {
        const email = cleanText(parsed.value.billingEmail, 254).toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return respond(400, { error: "INVALID_BILLING_EMAIL" }, event);
        }
        next.billingEmail = email || null;
    }
    if (parsed.value.timezone !== undefined) {
        const timezone = cleanText(parsed.value.timezone, 80);
        if (!validTimezone(timezone)) {
            return respond(400, { error: "INVALID_TIMEZONE" }, event);
        }
        next.timezone = timezone;
    }
    if (parsed.value.locale !== undefined) {
        const locale = cleanText(parsed.value.locale, 35);
        if (!validLocale(locale)) {
            return respond(400, { error: "INVALID_LOCALE" }, event);
        }
        next.locale = locale;
    }
    if (parsed.value.profileCompleted !== undefined) {
        next.profileCompleted = parsed.value.profileCompleted === true;
    }
    if (!next.name) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    next.updatedAt = new Date().toISOString();
    next.schemaVersion = 2;
    await docClient.send(
        new PutCommand({
            TableName: ORGANIZATIONS_TABLE,
            Item: next,
            ConditionExpression: "attribute_exists(organizationId)",
        }),
    );
    await writeAuditEvent(docClient, AUDIT_TABLE, {
        organizationId,
        actorUserId: auth.actor.userId,
        action: "organization.updated",
        resourceType: "organization",
        resourceId: organizationId,
        requestId: event.requestId,
    });
    return respond(200, { organization: privateOrganization(next) }, event);
}

async function addOrganizationMember(event, organizationId) {
    const auth = await authorizeOrganization({
        event,
        client: docClient,
        membershipsTable: MEMBERSHIPS_TABLE,
        organizationId,
        roles: ["owner", "organizer"],
    });
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const parsed = parseJsonBody(event);
    if (parsed.error || !hasExactShape(parsed.value, ["userId", "role"])) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const userId = cleanText(parsed.value.userId, 120);
    const role = cleanText(parsed.value.role, 30);
    if (!validId(userId) || !["organizer", "exhibitor"].includes(role)) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    if (role === "organizer" && auth.membership.role !== "owner") {
        return respond(403, { error: "OWNER_REQUIRED" }, event);
    }
    const now = new Date().toISOString();
    const membership = {
        userId,
        organizationId,
        membershipKey: `${role}#${userId}`,
        role,
        status: "active",
        invitedBy: auth.actor.userId,
        joinedAt: now,
        updatedAt: now,
        schemaVersion: 2,
    };
    try {
        await docClient.send(
            new PutCommand({
                TableName: MEMBERSHIPS_TABLE,
                Item: membership,
                ConditionExpression:
                    "attribute_not_exists(userId) AND attribute_not_exists(organizationId)",
            }),
        );
    } catch (error) {
        if (error.name === "ConditionalCheckFailedException") {
            return respond(409, { error: "MEMBERSHIP_EXISTS" }, event);
        }
        throw error;
    }
    await writeAuditEvent(docClient, AUDIT_TABLE, {
        organizationId,
        actorUserId: auth.actor.userId,
        action: "membership.created",
        resourceType: "membership",
        resourceId: userId,
        requestId: event.requestId,
        metadata: { role },
    });
    return respond(201, { membership }, event);
}

async function changeOrganizationMember(
    event,
    organizationId,
    userId,
    remove = false,
) {
    const auth = await authorizeOrganization({
        event,
        client: docClient,
        membershipsTable: MEMBERSHIPS_TABLE,
        organizationId,
        roles: ["owner"],
    });
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const membership = await getMembership(
        docClient,
        MEMBERSHIPS_TABLE,
        userId,
        organizationId,
    );
    if (!membership) {
        return respond(404, { error: "MEMBERSHIP_NOT_FOUND" }, event);
    }
    if (membership.role === "owner" || userId === auth.actor.userId) {
        return respond(409, { error: "OWNER_MEMBERSHIP_PROTECTED" }, event);
    }
    if (remove) {
        await docClient.send(
            new DeleteCommand({
                TableName: MEMBERSHIPS_TABLE,
                Key: { userId, organizationId },
            }),
        );
        await writeAuditEvent(docClient, AUDIT_TABLE, {
            organizationId,
            actorUserId: auth.actor.userId,
            action: "membership.removed",
            resourceType: "membership",
            resourceId: userId,
            requestId: event.requestId,
            metadata: { previousRole: membership.role },
        });
        return respond(200, { removed: true }, event);
    }
    const parsed = parseJsonBody(event);
    if (parsed.error || !hasExactShape(parsed.value, ["role", "status"])) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const role = parsed.value.role || membership.role;
    const status = parsed.value.status || membership.status;
    if (
        !["organizer", "exhibitor"].includes(role) ||
        !["active", "suspended"].includes(status)
    ) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const result = await docClient.send(
        new UpdateCommand({
            TableName: MEMBERSHIPS_TABLE,
            Key: { userId, organizationId },
            UpdateExpression:
                "SET #role = :role, #status = :status, membershipKey = :membershipKey, updatedAt = :now, schemaVersion = :schemaVersion",
            ExpressionAttributeNames: { "#role": "role", "#status": "status" },
            ExpressionAttributeValues: {
                ":role": role,
                ":status": status,
                ":membershipKey": `${role}#${userId}`,
                ":now": new Date().toISOString(),
                ":schemaVersion": 2,
            },
            ReturnValues: "ALL_NEW",
        }),
    );
    await writeAuditEvent(docClient, AUDIT_TABLE, {
        organizationId,
        actorUserId: auth.actor.userId,
        action: "membership.updated",
        resourceType: "membership",
        resourceId: userId,
        requestId: event.requestId,
        metadata: { role, status },
    });
    return respond(200, { membership: result.Attributes }, event);
}

async function listOrganizationMembers(event, organizationId) {
    const auth = await authorizeOrganization({
        event,
        client: docClient,
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
    const result = await docClient.send(
        new QueryCommand({
            TableName: MEMBERSHIPS_TABLE,
            IndexName: ORGANIZATION_MEMBERS_INDEX,
            KeyConditionExpression: "organizationId = :organizationId",
            ExpressionAttributeValues: {
                ":organizationId": organizationId,
            },
            ScanIndexForward: true,
            Limit: limit,
            ExclusiveStartKey: cursor,
        }),
    );
    return respond(
        200,
        {
            memberships: result.Items || [],
            count: (result.Items || []).length,
            nextCursor: encodeCursor(result.LastEvaluatedKey),
        },
        event,
    );
}

async function getEntitlement(event, organizationId) {
    const auth = await authorizeOrganization({
        event,
        client: docClient,
        membershipsTable: MEMBERSHIPS_TABLE,
        organizationId,
        roles: ["owner", "organizer"],
    });
    if (!auth.ok) {
        return respond(auth.statusCode, { error: auth.code }, event);
    }
    const result = await docClient.send(
        new GetCommand({
            TableName: ENTITLEMENTS_TABLE,
            Key: { organizationId },
        }),
    );
    if (!result.Item) {
        return respond(404, { error: "ENTITLEMENT_NOT_FOUND" }, event);
    }
    return respond(200, { entitlement: result.Item }, event);
}

const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return preflight(event);
    }
    try {
        const method = event.httpMethod;
        const path = event.path || "";
        if (method === "GET" && path === "/me/memberships") {
            return listMyMemberships(event);
        }
        if (method === "POST" && path === "/platform/organizations") {
            return createOrganization(event);
        }
        const match = path.match(/^\/organizations\/([^/]+)$/);
        if (match && method === "GET") {
            return getOrganization(event, decodeURIComponent(match[1]));
        }
        if (match && method === "PATCH") {
            return updateOrganization(event, decodeURIComponent(match[1]));
        }
        const membersMatch = path.match(
            /^\/organizations\/([^/]+)\/memberships$/,
        );
        if (membersMatch && method === "GET") {
            return listOrganizationMembers(
                event,
                decodeURIComponent(membersMatch[1]),
            );
        }
        if (membersMatch && method === "POST") {
            return addOrganizationMember(
                event,
                decodeURIComponent(membersMatch[1]),
            );
        }
        const memberMatch = path.match(
            /^\/organizations\/([^/]+)\/memberships\/([^/]+)$/,
        );
        if (memberMatch && method === "PATCH") {
            return changeOrganizationMember(
                event,
                decodeURIComponent(memberMatch[1]),
                decodeURIComponent(memberMatch[2]),
                false,
            );
        }
        if (memberMatch && method === "DELETE") {
            return changeOrganizationMember(
                event,
                decodeURIComponent(memberMatch[1]),
                decodeURIComponent(memberMatch[2]),
                true,
            );
        }
        const entitlementMatch = path.match(
            /^\/organizations\/([^/]+)\/entitlement$/,
        );
        if (entitlementMatch && method === "GET") {
            return getEntitlement(
                event,
                decodeURIComponent(entitlementMatch[1]),
            );
        }
        return respond(404, { error: "NOT_FOUND" }, event);
    } catch (error) {
        console.error("Organizations API failed", error);
        return respond(500, { error: "INTERNAL_ERROR" }, event);
    }
};

exports.handler = withObservability("organizations", handler);
