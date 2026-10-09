"use strict";

const { randomUUID } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
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

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ORGANIZATIONS_TABLE = process.env.ORGANIZATIONS_TABLE;
const MEMBERSHIPS_TABLE = process.env.MEMBERSHIPS_TABLE;
const ENTITLEMENTS_TABLE = process.env.ENTITLEMENTS_TABLE;
const AUDIT_TABLE = process.env.AUDIT_TABLE;
const USERS_TABLE = process.env.USERS_TABLE;
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
    return { ...safe, revision: revisionOf(item) };
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
    return { ...safe, revision: revisionOf(item) };
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
        revision: 1,
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
        revision: 1,
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
        revision: 1,
    };

    try {
        await transactWithAudit(
            docClient,
            [
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
            AUDIT_TABLE,
            {
                organizationId,
                actorUserId: actor.userId,
                action: "organization.created",
                resourceType: "organization",
                resourceId: organizationId,
                requestId: event.requestId,
                metadata: { ownerUserId, plan },
            },
        );
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
        revisionHeaders(result.Item),
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
    const precondition = expectedRevision(event);
    if (!precondition.ok) {
        return respond(
            precondition.missing ? 428 : 400,
            { error: precondition.code },
            event,
        );
    }
    const parsed = parseJsonBody(event);
    const allowed = [
        "name",
        "billingEmail",
        "timezone",
        "locale",
        "profileCompleted",
    ];
    if (
        parsed.error ||
        !hasExactShape(parsed.value, allowed) ||
        Object.keys(parsed.value || {}).length === 0
    ) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const existing = await docClient.send(
        new GetCommand({
            TableName: ORGANIZATIONS_TABLE,
            Key: { organizationId },
            ConsistentRead: true,
        }),
    );
    if (!existing.Item) {
        return respond(404, { error: "ORGANIZATION_NOT_FOUND" }, event);
    }

    const next = { ...existing.Item };
    const assignments = [];
    const names = {
        "#revision": "revision",
        "#updatedAt": "updatedAt",
        "#schemaVersion": "schemaVersion",
    };
    const values = {};
    const assign = (field, value) => {
        const name = `#field${assignments.length}`;
        const token = `:value${assignments.length}`;
        names[name] = field;
        values[token] = value;
        assignments.push(`${name} = ${token}`);
        next[field] = value;
    };

    if (parsed.value.name !== undefined) {
        const name = cleanText(parsed.value.name, 160);
        if (!name) {
            return respond(400, { error: "VALIDATION_ERROR" }, event);
        }
        assign("name", name);
    }
    if (parsed.value.billingEmail !== undefined) {
        const email = cleanText(parsed.value.billingEmail, 254).toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return respond(400, { error: "INVALID_BILLING_EMAIL" }, event);
        }
        assign("billingEmail", email || null);
    }
    if (parsed.value.timezone !== undefined) {
        const timezone = cleanText(parsed.value.timezone, 80);
        if (!validTimezone(timezone)) {
            return respond(400, { error: "INVALID_TIMEZONE" }, event);
        }
        assign("timezone", timezone);
    }
    if (parsed.value.locale !== undefined) {
        const locale = cleanText(parsed.value.locale, 35);
        if (!validLocale(locale)) {
            return respond(400, { error: "INVALID_LOCALE" }, event);
        }
        assign("locale", locale);
    }
    if (parsed.value.profileCompleted !== undefined) {
        assign("profileCompleted", parsed.value.profileCompleted === true);
    }

    const now = new Date().toISOString();
    const newRevision = nextRevision(precondition.revision);
    next.updatedAt = now;
    next.schemaVersion = 3;
    next.revision = newRevision;
    assignments.push(
        "#updatedAt = :updatedAt",
        "#schemaVersion = :schemaVersion",
        "#revision = :nextRevision",
    );
    values[":updatedAt"] = now;
    values[":schemaVersion"] = 3;
    values[":nextRevision"] = newRevision;
    const revision = revisionCondition({ expected: precondition.revision });
    Object.assign(names, revision.names);
    Object.assign(values, revision.values);

    try {
        await transactWithAudit(
            docClient,
            [
                {
                    Update: {
                        TableName: ORGANIZATIONS_TABLE,
                        Key: { organizationId },
                        UpdateExpression: `SET ${assignments.join(", ")}`,
                        ConditionExpression: `attribute_exists(organizationId) AND ${revision.expression}`,
                        ExpressionAttributeNames: names,
                        ExpressionAttributeValues: values,
                    },
                },
            ],
            AUDIT_TABLE,
            {
                organizationId,
                actorUserId: auth.actor.userId,
                action: "organization.updated",
                resourceType: "organization",
                resourceId: organizationId,
                requestId: event.requestId,
                metadata: {
                    expectedRevision: precondition.revision,
                    revision: newRevision,
                    fields: Object.keys(parsed.value),
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
        { organization: privateOrganization(next) },
        event,
        revisionHeaders(newRevision),
    );
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
        revision: 1,
    };
    try {
        await transactWithAudit(
            docClient,
            [
                {
                    Put: {
                        TableName: MEMBERSHIPS_TABLE,
                        Item: membership,
                        ConditionExpression:
                            "attribute_not_exists(userId) AND attribute_not_exists(organizationId)",
                    },
                },
            ],
            AUDIT_TABLE,
            {
                organizationId,
                actorUserId: auth.actor.userId,
                action: "membership.created",
                resourceType: "membership",
                resourceId: userId,
                requestId: event.requestId,
                metadata: { role },
            },
        );
    } catch (error) {
        if (error.name === "ConditionalCheckFailedException") {
            return respond(409, { error: "MEMBERSHIP_EXISTS" }, event);
        }
        throw error;
    }
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
    const precondition = expectedRevision(event);
    if (!precondition.ok) {
        return respond(
            precondition.missing ? 428 : 400,
            { error: precondition.code },
            event,
        );
    }
    const membership = await getMembership(
        docClient,
        MEMBERSHIPS_TABLE,
        userId,
        organizationId,
    );
    if (!membership || membership.status === "removed") {
        return respond(404, { error: "MEMBERSHIP_NOT_FOUND" }, event);
    }
    if (membership.role === "owner" || userId === auth.actor.userId) {
        return respond(409, { error: "OWNER_MEMBERSHIP_PROTECTED" }, event);
    }
    const now = new Date().toISOString();
    const newRevision = nextRevision(precondition.revision);
    const revision = revisionCondition({ expected: precondition.revision });
    let role = membership.role;
    let status = membership.status;
    let action = "membership.updated";
    let updateExpression;
    const names = {
        ...revision.names,
        "#role": "role",
        "#status": "status",
        "#revision": "revision",
    };
    const values = {
        ...revision.values,
        ":now": now,
        ":schemaVersion": 3,
        ":nextRevision": newRevision,
    };
    if (remove) {
        status = "removed";
        action = "membership.removed";
        values[":removed"] = "removed";
        values[":removedKey"] = `removed#${userId}`;
        updateExpression =
            "SET #status = :removed, membershipKey = :removedKey, removedAt = :now, updatedAt = :now, schemaVersion = :schemaVersion, #revision = :nextRevision";
    } else {
        const parsed = parseJsonBody(event);
        if (
            parsed.error ||
            !hasExactShape(parsed.value, ["role", "status"]) ||
            Object.keys(parsed.value || {}).length === 0
        ) {
            return respond(400, { error: "VALIDATION_ERROR" }, event);
        }
        role = parsed.value.role || membership.role;
        status = parsed.value.status || membership.status;
        if (
            !["organizer", "exhibitor"].includes(role) ||
            !["active", "suspended"].includes(status)
        ) {
            return respond(400, { error: "VALIDATION_ERROR" }, event);
        }
        values[":role"] = role;
        values[":status"] = status;
        values[":membershipKey"] = `${role}#${userId}`;
        updateExpression =
            "SET #role = :role, #status = :status, membershipKey = :membershipKey, updatedAt = :now, schemaVersion = :schemaVersion, #revision = :nextRevision REMOVE removedAt";
    }
    try {
        await transactWithAudit(
            docClient,
            [
                {
                    Update: {
                        TableName: MEMBERSHIPS_TABLE,
                        Key: { userId, organizationId },
                        UpdateExpression: updateExpression,
                        ConditionExpression: `attribute_exists(userId) AND ${revision.expression}`,
                        ExpressionAttributeNames: names,
                        ExpressionAttributeValues: values,
                    },
                },
            ],
            AUDIT_TABLE,
            {
                organizationId,
                actorUserId: auth.actor.userId,
                action,
                resourceType: "membership",
                resourceId: userId,
                requestId: event.requestId,
                metadata: {
                    previousRole: membership.role,
                    role,
                    status,
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
    if (remove) {
        return respond(
            200,
            { removed: true, revision: newRevision },
            event,
            revisionHeaders(newRevision),
        );
    }
    return respond(
        200,
        {
            membership: {
                ...membership,
                role,
                status,
                membershipKey: `${role}#${userId}`,
                updatedAt: now,
                schemaVersion: 3,
                revision: newRevision,
            },
        },
        event,
        revisionHeaders(newRevision),
    );
}

async function transferOrganizationOwnership(event, organizationId) {
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

    const parsed = parseJsonBody(event);
    if (parsed.error || !hasExactShape(parsed.value, ["newOwnerUserId"])) {
        return respond(400, { error: "VALIDATION_ERROR" }, event);
    }
    const newOwnerUserId = cleanText(parsed.value.newOwnerUserId, 120);
    if (!validId(newOwnerUserId) || newOwnerUserId === auth.actor.userId) {
        return respond(400, { error: "INVALID_NEW_OWNER" }, event);
    }

    const [targetMembership, targetUser] = await Promise.all([
        getMembership(
            docClient,
            MEMBERSHIPS_TABLE,
            newOwnerUserId,
            organizationId,
        ),
        docClient.send(
            new GetCommand({
                TableName: USERS_TABLE,
                Key: { userId: newOwnerUserId },
            }),
        ),
    ]);
    if (
        !targetMembership ||
        targetMembership.status !== "active" ||
        targetMembership.role !== "organizer"
    ) {
        return respond(409, { error: "ACTIVE_ORGANIZER_REQUIRED" }, event);
    }
    if (!targetUser.Item?.email) {
        return respond(409, { error: "OWNER_PROFILE_REQUIRED" }, event);
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const audit = buildAuditEvent(
        {
            organizationId,
            actorUserId: auth.actor.userId,
            action: "organization.ownership_transferred",
            resourceType: "organization",
            resourceId: organizationId,
            requestId: event.requestId,
            metadata: {
                previousOwnerUserId: auth.actor.userId,
                newOwnerUserId,
            },
        },
        now,
    );

    try {
        await docClient.send(
            new TransactWriteCommand({
                TransactItems: [
                    {
                        Update: {
                            TableName: ORGANIZATIONS_TABLE,
                            Key: { organizationId },
                            UpdateExpression:
                                "SET ownerUserId = :newOwner, ownerEmail = :newEmail, updatedAt = :now, schemaVersion = :schemaVersion",
                            ConditionExpression: "ownerUserId = :currentOwner",
                            ExpressionAttributeValues: {
                                ":newOwner": newOwnerUserId,
                                ":newEmail": targetUser.Item.email,
                                ":now": nowIso,
                                ":schemaVersion": 3,
                                ":currentOwner": auth.actor.userId,
                            },
                        },
                    },
                    {
                        Update: {
                            TableName: MEMBERSHIPS_TABLE,
                            Key: {
                                userId: newOwnerUserId,
                                organizationId,
                            },
                            UpdateExpression:
                                "SET #role = :owner, membershipKey = :ownerKey, updatedAt = :now, schemaVersion = :schemaVersion",
                            ConditionExpression:
                                "#status = :active AND #role = :organizer",
                            ExpressionAttributeNames: {
                                "#role": "role",
                                "#status": "status",
                            },
                            ExpressionAttributeValues: {
                                ":owner": "owner",
                                ":ownerKey": `owner#${newOwnerUserId}`,
                                ":now": nowIso,
                                ":schemaVersion": 3,
                                ":active": "active",
                                ":organizer": "organizer",
                            },
                        },
                    },
                    {
                        Update: {
                            TableName: MEMBERSHIPS_TABLE,
                            Key: {
                                userId: auth.actor.userId,
                                organizationId,
                            },
                            UpdateExpression:
                                "SET #role = :organizer, membershipKey = :organizerKey, updatedAt = :now, schemaVersion = :schemaVersion",
                            ConditionExpression:
                                "#status = :active AND #role = :owner",
                            ExpressionAttributeNames: {
                                "#role": "role",
                                "#status": "status",
                            },
                            ExpressionAttributeValues: {
                                ":organizer": "organizer",
                                ":organizerKey": `organizer#${auth.actor.userId}`,
                                ":now": nowIso,
                                ":schemaVersion": 3,
                                ":active": "active",
                                ":owner": "owner",
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
        if (
            error?.name === "TransactionCanceledException" ||
            error?.name === "ConditionalCheckFailedException"
        ) {
            return respond(409, { error: "OWNERSHIP_CHANGED" }, event);
        }
        throw error;
    }

    return respond(
        200,
        {
            transferred: true,
            organizationId,
            previousOwnerUserId: auth.actor.userId,
            newOwnerUserId,
        },
        event,
    );
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
            memberships: (result.Items || [])
                .filter((item) => item.status !== "removed")
                .map((item) => ({ ...item, revision: revisionOf(item) })),
            count: (result.Items || []).filter(
                (item) => item.status !== "removed",
            ).length,
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
        const ownershipMatch = path.match(
            /^\/organizations\/([^/]+)\/ownership-transfer$/,
        );
        if (ownershipMatch && method === "POST") {
            return transferOrganizationOwnership(
                event,
                decodeURIComponent(ownershipMatch[1]),
            );
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
