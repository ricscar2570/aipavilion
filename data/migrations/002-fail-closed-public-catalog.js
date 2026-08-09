"use strict";

const { ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

async function scanAll(client, tableName) {
    const items = [];
    let lastKey;
    do {
        const result = await client.send(
            new ScanCommand({ TableName: tableName, ExclusiveStartKey: lastKey }),
        );
        items.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    return items;
}

function moderationStatusFor(stand) {
    if (
        stand.status === "published" &&
        stand.visibility === "public" &&
        stand.eventStatus === "published" &&
        stand.publicStatus === "published" &&
        String(stand.publicationKey || "").startsWith("published#")
    ) {
        return "approved";
    }
    if (stand.status === "pending_review") return "pending";
    if (stand.status === "rejected") return "rejected";
    return "draft";
}

module.exports = {
    id: "002-fail-closed-public-catalog",
    description:
        "Add explicit moderation and contact privacy fields required by the fail-closed public catalog.",
    async plan(client, tables) {
        const [stands, events] = await Promise.all([
            scanAll(client, tables.StandsTableName),
            scanAll(client, tables.EventsTableName),
        ]);
        return {
            stands: stands.filter(
                (item) =>
                    !item.moderationStatus ||
                    !item.publicContact ||
                    Number(item.schemaVersion || 0) < 4,
            ).length,
            events: events.filter(
                (item) =>
                    item.status === "published" &&
                    item.publicStatus === "published" &&
                    !item.publishedAt,
            ).length,
        };
    },
    async up(client, tables) {
        const stands = await scanAll(client, tables.StandsTableName);
        for (const stand of stands) {
            await client.send(
                new UpdateCommand({
                    TableName: tables.StandsTableName,
                    Key: { stand_id: stand.stand_id },
                    UpdateExpression:
                        "SET moderationStatus = if_not_exists(moderationStatus, :moderation), publicContact = if_not_exists(publicContact, :privateContact), schemaVersion = :version",
                    ExpressionAttributeValues: {
                        ":moderation": moderationStatusFor(stand),
                        ":privateContact": {
                            showEmail: false,
                            showPhone: false,
                            showWebsite: false,
                        },
                        ":version": 4,
                    },
                }),
            );
        }
        const events = await scanAll(client, tables.EventsTableName);
        for (const event of events) {
            if (
                event.status !== "published" ||
                event.publicStatus !== "published" ||
                event.publishedAt
            ) {
                continue;
            }
            const publishedAt = event.updatedAt || event.createdAt;
            if (!publishedAt) continue;
            await client.send(
                new UpdateCommand({
                    TableName: tables.EventsTableName,
                    Key: { eventId: event.eventId },
                    UpdateExpression:
                        "SET publishedAt = if_not_exists(publishedAt, :publishedAt), schemaVersion = :version",
                    ExpressionAttributeValues: {
                        ":publishedAt": publishedAt,
                        ":version": Math.max(Number(event.schemaVersion || 0), 2),
                    },
                }),
            );
        }
    },
    async verify(client, tables) {
        const plan = await this.plan(client, tables);
        return Object.values(plan).every((count) => count === 0);
    },
};
