"use strict";

const { GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const ORGANIZER_ROLES = new Set(["owner", "organizer"]);
const MEMBER_ROLES = new Set(["owner", "organizer", "exhibitor"]);

function claims(event = {}) {
    return event.requestContext?.authorizer?.claims || {};
}

function identity(event = {}) {
    const value = claims(event);
    const groupsValue = value["cognito:groups"] || value.groups || [];
    const groups = Array.isArray(groupsValue)
        ? groupsValue
        : String(groupsValue || "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
    return {
        userId: value.sub || null,
        email:
            String(value.email || "")
                .trim()
                .toLowerCase() || null,
        groups,
    };
}

function isPlatformAdmin(actor) {
    return Boolean(actor?.groups?.includes("admin"));
}

function hasRole(membership, allowedRoles) {
    return Boolean(
        membership &&
        membership.status === "active" &&
        allowedRoles.includes(membership.role),
    );
}

async function getMembership(client, tableName, userId, organizationId) {
    if (!userId || !organizationId) {
        return null;
    }
    const result = await client.send(
        new GetCommand({
            TableName: tableName,
            Key: { userId, organizationId },
            ConsistentRead: true,
        }),
    );
    return result.Item || null;
}

async function listMemberships(client, tableName, userId, options = {}) {
    const result = await client.send(
        new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "userId = :userId",
            ExpressionAttributeValues: { ":userId": userId },
            ScanIndexForward: false,
            Limit: options.limit || 100,
            ExclusiveStartKey: options.exclusiveStartKey,
        }),
    );
    return {
        items: result.Items || [],
        nextKey: result.LastEvaluatedKey,
    };
}

async function authorizeOrganization({
    event,
    client,
    membershipsTable,
    organizationId,
    roles = [...MEMBER_ROLES],
    allowPlatformAdmin = true,
}) {
    const actor = identity(event);
    if (!actor.userId) {
        return { ok: false, statusCode: 401, code: "UNAUTHORIZED", actor };
    }
    if (allowPlatformAdmin && isPlatformAdmin(actor)) {
        return {
            ok: true,
            actor,
            membership: {
                userId: actor.userId,
                organizationId,
                role: "platform_admin",
                status: "active",
            },
        };
    }
    const membership = await getMembership(
        client,
        membershipsTable,
        actor.userId,
        organizationId,
    );
    if (!hasRole(membership, roles)) {
        return { ok: false, statusCode: 403, code: "FORBIDDEN", actor };
    }
    return { ok: true, actor, membership };
}

function canManageOrganization(membership) {
    return hasRole(membership, [...ORGANIZER_ROLES]);
}

module.exports = {
    ORGANIZER_ROLES,
    MEMBER_ROLES,
    claims,
    identity,
    isPlatformAdmin,
    hasRole,
    getMembership,
    listMemberships,
    authorizeOrganization,
    canManageOrganization,
};
