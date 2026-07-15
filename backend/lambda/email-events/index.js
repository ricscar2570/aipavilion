"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const { withObservability } = require("../common/observability");
const { writeAuditEvent } = require("../common/audit");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const INVITATIONS_TABLE = process.env.INVITATIONS_TABLE;
const AUDIT_TABLE = process.env.AUDIT_TABLE;

function tagValue(tags, name) {
    const value = tags?.[name];
    if (Array.isArray(value)) {
        return value[0] || null;
    }
    return value || null;
}

function parseRecord(record) {
    const payload = record.Sns?.Message
        ? JSON.parse(record.Sns.Message)
        : record;
    const eventType =
        payload.eventType || payload.notificationType || "Unknown";
    const mail = payload.mail || {};
    return {
        eventType,
        invitationId: tagValue(mail.tags, "invitationId"),
        organizationId: tagValue(mail.tags, "organizationId"),
        messageId: mail.messageId || null,
        destination: mail.destination || [],
        timestamp: mail.timestamp || new Date().toISOString(),
    };
}

function deliveryStatus(eventType) {
    const normalized = String(eventType).toLowerCase();
    if (normalized === "delivery") {
        return "delivered";
    }
    if (normalized === "bounce") {
        return "bounced";
    }
    if (normalized === "complaint") {
        return "complained";
    }
    if (normalized === "reject") {
        return "rejected";
    }
    return "unknown";
}

async function processRecord(record, requestId) {
    const event = parseRecord(record);
    if (!event.invitationId) {
        return { ignored: true };
    }
    const status = deliveryStatus(event.eventType);
    await client.send(
        new UpdateCommand({
            TableName: INVITATIONS_TABLE,
            Key: { invitationId: event.invitationId },
            UpdateExpression:
                "SET deliveryStatus = :status, deliveryEventAt = :timestamp, deliveryMessageId = if_not_exists(deliveryMessageId, :messageId), updatedAt = :timestamp",
            ExpressionAttributeValues: {
                ":status": status,
                ":timestamp": event.timestamp,
                ":messageId": event.messageId,
            },
            ConditionExpression: "attribute_exists(invitationId)",
        }),
    );
    if (event.organizationId) {
        await writeAuditEvent(client, AUDIT_TABLE, {
            organizationId: event.organizationId,
            actorUserId: "ses",
            action: `invitation.email_${status}`,
            resourceType: "invitation",
            resourceId: event.invitationId,
            requestId,
            metadata: {
                messageId: event.messageId,
                destination: event.destination,
            },
        });
    }
    return { invitationId: event.invitationId, status };
}

const handler = async (event) => {
    const results = [];
    for (const record of event.Records || []) {
        try {
            results.push(await processRecord(record, event.requestId));
        } catch (error) {
            if (error.name !== "ConditionalCheckFailedException") {
                throw error;
            }
            results.push({ ignored: true });
        }
    }
    return { processed: results.length, results };
};

exports.handler = withObservability("email-events", handler);
exports.parseRecord = parseRecord;
exports.deliveryStatus = deliveryStatus;
