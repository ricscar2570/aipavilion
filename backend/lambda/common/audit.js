"use strict";

const { randomUUID } = require("crypto");
const { PutCommand } = require("@aws-sdk/lib-dynamodb");

const AUDIT_RETENTION_DAYS = Math.min(
    Math.max(
        Number.parseInt(process.env.AUDIT_RETENTION_DAYS || "365", 10),
        30,
    ),
    2555,
);

async function writeAuditEvent(client, tableName, entry) {
    if (!tableName) {
        return null;
    }
    const createdAt = new Date().toISOString();
    const item = {
        auditId: `audit_${randomUUID()}`,
        organizationId: entry.organizationId || "platform",
        createdAt,
        actorUserId: entry.actorUserId || null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        requestId: entry.requestId || null,
        metadata: entry.metadata || {},
        schemaVersion: 1,
        ttl:
            Math.floor(Date.now() / 1000) + AUDIT_RETENTION_DAYS * 24 * 60 * 60,
    };
    await client.send(
        new PutCommand({
            TableName: tableName,
            Item: item,
            ConditionExpression: "attribute_not_exists(auditId)",
        }),
    );
    return item;
}

module.exports = { writeAuditEvent };
