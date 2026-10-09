"use strict";

function sdk() {
    return require("@aws-sdk/lib-dynamodb");
}

const TERMINAL_STATES = new Set([
    "draft",
    "publishing",
    "published",
    "publish_failed",
    "archiving",
    "archived",
]);

async function scanAll(client, tableName) {
    const { ScanCommand } = sdk();
    const items = [];
    let lastKey;
    do {
        const result = await client.send(
            new ScanCommand({
                TableName: tableName,
                ExclusiveStartKey: lastKey,
            }),
        );
        items.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    return items;
}

function hasPublishedEvidence(event) {
    return Boolean(
        event &&
            event.status === "published" &&
            ["public", "private"].includes(event.visibility) &&
            event.publicStatus ===
                (event.visibility === "public" ? "published" : "private") &&
            typeof event.publishedAt === "string" &&
            event.publishedAt.length > 0,
    );
}

function desiredState(event) {
    if (event?.status === "archived") {
        return { publicationState: "archived", publicStatus: "archived" };
    }
    if (event?.status === "archiving") {
        return { publicationState: "archiving", publicStatus: "hidden" };
    }
    if (event?.status === "publishing") {
        return { publicationState: "publishing", publicStatus: "hidden" };
    }
    if (event?.status === "publish_failed") {
        return { publicationState: "publish_failed", publicStatus: "hidden" };
    }
    if (hasPublishedEvidence(event)) {
        return {
            publicationState: "published",
            publicStatus:
                event.visibility === "public" ? "published" : "private",
        };
    }
    return { publicationState: "draft", publicStatus: "draft" };
}

function needsUpdate(event) {
    const desired = desiredState(event);
    return Boolean(
        !TERMINAL_STATES.has(event?.publicationState) ||
            event.publicationState !== desired.publicationState ||
            event.publicStatus !== desired.publicStatus ||
            Number(event.schemaVersion || 0) < 3,
    );
}

module.exports = {
    id: "004-publishing-saga-state",
    description:
        "Introduce explicit fail-closed publication saga states for all events.",
    async plan(client, tables) {
        const events = await scanAll(client, tables.EventsTableName);
        const candidates = events.filter(needsUpdate);
        return {
            events: candidates.length,
            publicEventsRecognized: candidates.filter(hasPublishedEvidence)
                .length,
            ambiguousEventsHidden: candidates.filter(
                (event) =>
                    event.publicStatus === "published" &&
                    !hasPublishedEvidence(event),
            ).length,
        };
    },
    async up(client, tables) {
        const { UpdateCommand } = sdk();
        const events = await scanAll(client, tables.EventsTableName);
        for (const event of events) {
            if (!event?.eventId || !needsUpdate(event)) continue;
            const desired = desiredState(event);
            const now = new Date().toISOString();
            await client.send(
                new UpdateCommand({
                    TableName: tables.EventsTableName,
                    Key: { eventId: event.eventId },
                    UpdateExpression:
                        "SET publicationState = :publicationState, publicStatus = :publicStatus, schemaVersion = :version, updatedAt = if_not_exists(updatedAt, :now)",
                    ExpressionAttributeValues: {
                        ":publicationState": desired.publicationState,
                        ":publicStatus": desired.publicStatus,
                        ":version": Math.max(
                            Number(event.schemaVersion || 0),
                            3,
                        ),
                        ":now": now,
                    },
                }),
            );
        }
    },
    async verify(client, tables) {
        const events = await scanAll(client, tables.EventsTableName);
        return events.every((event) => !needsUpdate(event));
    },
    _test: { desiredState, hasPublishedEvidence, needsUpdate },
};
