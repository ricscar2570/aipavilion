"use strict";

const { randomUUID } = require("crypto");
const { PutCommand, TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");

const AUDIT_RETENTION_DAYS = Math.min(
    Math.max(
        Number.parseInt(process.env.AUDIT_RETENTION_DAYS || "365", 10),
        30,
    ),
    2555,
);

function buildAuditEvent(entry, now = new Date()) {
    const createdAt = now.toISOString();
    return {
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
            Math.floor(now.getTime() / 1000) +
            AUDIT_RETENTION_DAYS * 24 * 60 * 60,
    };
}

function buildAuditTransactPut(tableName, entry, now = new Date()) {
    if (!tableName) return null;
    return {
        Put: {
            TableName: tableName,
            Item: buildAuditEvent(entry, now),
            ConditionExpression: "attribute_not_exists(auditId)",
        },
    };
}

async function transactWithAudit(client, transactItems, tableName, entry) {
    const auditPut = buildAuditTransactPut(tableName, entry);
    await client.send(
        new TransactWriteCommand({
            TransactItems: auditPut
                ? [...transactItems, auditPut]
                : transactItems,
        }),
    );
}

async function writeAuditEvent(client, tableName, entry) {
    if (!tableName) return null;
    const item = buildAuditEvent(entry);
    await client.send(
        new PutCommand({
            TableName: tableName,
            Item: item,
            ConditionExpression: "attribute_not_exists(auditId)",
        }),
    );
    return item;
}

module.exports = {
    buildAuditEvent,
    buildAuditTransactPut,
    transactWithAudit,
    writeAuditEvent,
};
