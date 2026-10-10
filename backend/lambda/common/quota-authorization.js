"use strict";

const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { authorizeOrganization } = require("./tenant");
const { QuotaError } = require("./quota-model");

// A stored idempotent response is still protected by current membership.
// Check permission before touching a tenant's counters or replaying its data.
async function authorizeQuotaMutation(event, client, organizationId, eventId) {
    const authorization = await authorizeOrganization({
        event,
        client,
        membershipsTable: process.env.MEMBERSHIPS_TABLE,
        organizationId,
        roles: ["owner", "organizer"],
    });
    if (!authorization.ok) {
        throw new QuotaError(
            authorization.code,
            "You cannot manage this organization's resources.",
            authorization.statusCode,
        );
    }
    if (eventId) {
        const result = await client.send(
            new GetCommand({
                TableName: process.env.EVENTS_TABLE,
                Key: { eventId },
                ConsistentRead: true,
            }),
        );
        if (!result.Item || result.Item.organizationId !== organizationId) {
            throw new QuotaError(
                "EVENT_NOT_FOUND",
                "The event does not exist.",
                404,
            );
        }
    }
}

module.exports = { authorizeQuotaMutation };
