"use strict";

const { isEventPublic } = require("./publication-state");

function sdk() {
    return require("@aws-sdk/lib-dynamodb");
}

function uniqueEventIds(stands = []) {
    return [...new Set(stands.map((stand) => stand?.eventId).filter(Boolean))];
}

function chunks(values, size) {
    const result = [];
    for (let index = 0; index < values.length; index += size) {
        result.push(values.slice(index, index + size));
    }
    return result;
}

function filterStandsByEventMap(stands = [], events = []) {
    const publicIds = new Set(
        events.filter(isEventPublic).map((event) => event.eventId),
    );
    return stands.filter(
        (stand) => stand?.eventId && publicIds.has(stand.eventId),
    );
}

async function loadPublicEvents(client, eventsTable, eventIds) {
    if (!eventsTable || eventIds.length === 0) {
        return [];
    }
    const { BatchGetCommand } = sdk();
    const events = [];
    for (const group of chunks(eventIds, 100)) {
        let requestItems = {
            [eventsTable]: {
                Keys: group.map((eventId) => ({ eventId })),
                ConsistentRead: true,
                ProjectionExpression:
                    "eventId, #status, visibility, publicStatus, publishedAt, publicationState",
                ExpressionAttributeNames: { "#status": "status" },
            },
        };
        for (let attempt = 0; attempt < 4; attempt += 1) {
            const result = await client.send(
                new BatchGetCommand({ RequestItems: requestItems }),
            );
            events.push(...(result.Responses?.[eventsTable] || []));
            const unprocessed = result.UnprocessedKeys?.[eventsTable];
            if (!unprocessed?.Keys?.length) {
                break;
            }
            requestItems = { [eventsTable]: unprocessed };
        }
    }
    return events;
}

async function loadPublicEventIds(client, eventsTable, eventIds) {
    const events = await loadPublicEvents(client, eventsTable, eventIds);
    return new Set(events.filter(isEventPublic).map((event) => event.eventId));
}

async function filterStandsByPublicEvent(client, eventsTable, stands = []) {
    const events = await loadPublicEvents(
        client,
        eventsTable,
        uniqueEventIds(stands),
    );
    return filterStandsByEventMap(stands, events);
}

async function standEventIsPublic(client, eventsTable, stand) {
    if (!eventsTable || !stand?.eventId) {
        return false;
    }
    const { GetCommand } = sdk();
    const result = await client.send(
        new GetCommand({
            TableName: eventsTable,
            Key: { eventId: stand.eventId },
            ConsistentRead: true,
            ProjectionExpression:
                "eventId, #status, visibility, publicStatus, publishedAt, publicationState",
            ExpressionAttributeNames: { "#status": "status" },
        }),
    );
    return isEventPublic(result.Item);
}

module.exports = {
    filterStandsByEventMap,
    filterStandsByPublicEvent,
    loadPublicEventIds,
    loadPublicEvents,
    standEventIsPublic,
    uniqueEventIds,
};
