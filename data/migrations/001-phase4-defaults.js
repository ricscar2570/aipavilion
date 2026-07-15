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

module.exports = {
    id: "001-phase4-defaults",
    description: "Add Phase 4 organization, entitlement and invitation defaults.",
    async plan(client, tables) {
        const [organizations, entitlements, invitations] = await Promise.all([
            scanAll(client, tables.OrganizationsTableName),
            scanAll(client, tables.EntitlementsTableName),
            scanAll(client, tables.InvitationsTableName),
        ]);
        return {
            organizations: organizations.filter(
                (item) => !item.timezone || !item.locale || item.profileCompleted === undefined,
            ).length,
            entitlements: entitlements.filter((item) => !item.billingSource).length,
            invitations: invitations.filter(
                (item) => !item.organizationEventKey && item.organizationId && item.eventId,
            ).length,
        };
    },
    async up(client, tables) {
        const organizations = await scanAll(client, tables.OrganizationsTableName);
        for (const item of organizations) {
            await client.send(
                new UpdateCommand({
                    TableName: tables.OrganizationsTableName,
                    Key: { organizationId: item.organizationId },
                    UpdateExpression:
                        "SET timezone = if_not_exists(timezone, :timezone), locale = if_not_exists(locale, :locale), profileCompleted = if_not_exists(profileCompleted, :completed), schemaVersion = :version",
                    ExpressionAttributeValues: {
                        ":timezone": "Europe/Rome",
                        ":locale": "en",
                        ":completed": false,
                        ":version": 2,
                    },
                }),
            );
        }
        const entitlements = await scanAll(client, tables.EntitlementsTableName);
        for (const item of entitlements) {
            await client.send(
                new UpdateCommand({
                    TableName: tables.EntitlementsTableName,
                    Key: { organizationId: item.organizationId },
                    UpdateExpression:
                        "SET billingSource = if_not_exists(billingSource, :source), schemaVersion = :version",
                    ExpressionAttributeValues: { ":source": "seed", ":version": 2 },
                }),
            );
        }
        const invitations = await scanAll(client, tables.InvitationsTableName);
        for (const item of invitations) {
            if (!item.organizationId || !item.eventId) continue;
            await client.send(
                new UpdateCommand({
                    TableName: tables.InvitationsTableName,
                    Key: { invitationId: item.invitationId },
                    UpdateExpression:
                        "SET organizationEventKey = if_not_exists(organizationEventKey, :key), deliveryStatus = if_not_exists(deliveryStatus, :delivery), sendCount = if_not_exists(sendCount, :zero), schemaVersion = :version",
                    ExpressionAttributeValues: {
                        ":key": `${item.organizationId}#${item.eventId}`,
                        ":delivery": "unknown",
                        ":zero": 0,
                        ":version": 2,
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
