"use strict";

const { randomUUID } = require("crypto");
const {
    DynamoDBClient,
    DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand,
    QueryCommand,
    DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { readStackOutputs } = require("../../scripts/dev/stack-outputs");

const enabled = process.env.RUN_DEPLOYED_INTEGRATION === "1";
const describeIntegration = enabled ? describe : describe.skip;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryEventually(client, input, predicate) {
    let last;
    for (let attempt = 0; attempt < 12; attempt += 1) {
        last = await client.send(new QueryCommand(input));
        if (predicate(last.Items || [])) {
            return last;
        }
        await delay(500 + attempt * 100);
    }
    return last;
}

describeIntegration(
    "deployed DynamoDB schema and Phase 4 access patterns",
    () => {
        const outputs = enabled ? readStackOutputs() : {};
        const region = process.env.AWS_REGION || "eu-west-1";
        const baseClient = new DynamoDBClient({ region });
        const client = DynamoDBDocumentClient.from(baseClient, {
            marshallOptions: { removeUndefinedValues: true },
        });
        const suffix = randomUUID();
        const cleanup = [];

        function remember(table, key) {
            cleanup.push({ table, key });
        }

        afterAll(async () => {
            await Promise.allSettled(
                cleanup.map(({ table, key }) =>
                    client.send(
                        new DeleteCommand({ TableName: table, Key: key }),
                    ),
                ),
            );
        });

        test("all fourteen tables and required GSIs exist", async () => {
            const expected = [
                [
                    outputs.StandsTableName,
                    [
                        "category-index",
                        "event-stands-index",
                        "public-stands-index",
                        "owner-stands-index",
                    ],
                ],
                [outputs.OrdersTableName, ["user-orders-index"]],
                [outputs.PaymentEventsTableName, []],
                [outputs.UsersTableName, []],
                [
                    outputs.LeadsTableName,
                    ["stand-leads-index", "organization-leads-index"],
                ],
                [
                    outputs.InteractionsTableName,
                    ["stand-created-index", "event-created-index"],
                ],
                [outputs.SavedStandsTableName, ["user-saved-at-index"]],
                [outputs.OrganizationsTableName, ["organization-slug-index"]],
                [outputs.MembershipsTableName, ["organization-members-index"]],
                [
                    outputs.EventsTableName,
                    ["organization-events-index", "public-events-index"],
                ],
                [
                    outputs.InvitationsTableName,
                    ["email-invitations-index", "event-invitations-index"],
                ],
                [outputs.EntitlementsTableName, []],
                [outputs.AuditEventsTableName, ["organization-audit-index"]],
                [outputs.SchemaMigrationsTableName, []],
            ];

            for (const [tableName, indexes] of expected) {
                expect(tableName).toBeTruthy();
                const result = await baseClient.send(
                    new DescribeTableCommand({ TableName: tableName }),
                );
                expect(result.Table?.TableStatus).toBe("ACTIVE");
                const actual = (result.Table?.GlobalSecondaryIndexes || []).map(
                    (index) => index.IndexName,
                );
                expect(actual).toEqual(expect.arrayContaining(indexes));
            }
        });

        test("stands support event, public and owner access patterns", async () => {
            const now = new Date().toISOString();
            const item = {
                stand_id: `integration-stand-${suffix}`,
                organizationId: `integration-org-${suffix}`,
                eventId: `integration-event-${suffix}`,
                ownerUserId: `integration-owner-${suffix}`,
                category: `integration-${suffix}`,
                name: "Integration Stand",
                status: "published",
                visibility: "public",
                publicStatus: "published",
                publicationKey: `published#${now}`,
                updatedAt: now,
            };
            await client.send(
                new PutCommand({
                    TableName: outputs.StandsTableName,
                    Item: item,
                }),
            );
            remember(outputs.StandsTableName, { stand_id: item.stand_id });

            const byId = await client.send(
                new GetCommand({
                    TableName: outputs.StandsTableName,
                    Key: { stand_id: item.stand_id },
                    ConsistentRead: true,
                }),
            );
            expect(byId.Item).toMatchObject(item);

            const checks = [
                {
                    IndexName: "event-stands-index",
                    KeyConditionExpression:
                        "eventId = :eventId AND begins_with(publicationKey, :published)",
                    ExpressionAttributeValues: {
                        ":eventId": item.eventId,
                        ":published": "published#",
                    },
                },
                {
                    IndexName: "public-stands-index",
                    KeyConditionExpression:
                        "publicStatus = :publicStatus AND begins_with(publicationKey, :published)",
                    ExpressionAttributeValues: {
                        ":publicStatus": "published",
                        ":published": "published#",
                    },
                },
                {
                    IndexName: "owner-stands-index",
                    KeyConditionExpression: "ownerUserId = :ownerUserId",
                    ExpressionAttributeValues: {
                        ":ownerUserId": item.ownerUserId,
                    },
                },
            ];
            for (const query of checks) {
                const result = await queryEventually(
                    client,
                    { TableName: outputs.StandsTableName, ...query },
                    (items) =>
                        items.some(
                            (candidate) => candidate.stand_id === item.stand_id,
                        ),
                );
                expect(result.Items).toEqual(
                    expect.arrayContaining([expect.objectContaining(item)]),
                );
            }
        });

        test("organizations, memberships, events and entitlements isolate tenant data", async () => {
            const organizationId = `integration-org-${suffix}`;
            const userId = `integration-user-${suffix}`;
            const eventId = `integration-event-${suffix}`;
            const startsAt = new Date(Date.now() + 86400000).toISOString();
            const now = new Date().toISOString();
            const organization = {
                organizationId,
                name: "Integration Organization",
                slug: `integration-${suffix}`,
                status: "active",
                ownerUserId: userId,
                createdAt: now,
                updatedAt: now,
            };
            const membership = {
                userId,
                organizationId,
                membershipKey: `owner#${userId}`,
                role: "owner",
                status: "active",
                joinedAt: now,
            };
            const eventItem = {
                eventId,
                organizationId,
                name: "Integration Event",
                status: "published",
                visibility: "public",
                publicStatus: "published",
                startsAt,
                endsAt: new Date(Date.now() + 172800000).toISOString(),
            };
            const entitlement = {
                organizationId,
                plan: "pilot",
                status: "active",
                maxActiveEvents: 2,
                maxStandsPerEvent: 20,
            };
            await Promise.all([
                client.send(
                    new PutCommand({
                        TableName: outputs.OrganizationsTableName,
                        Item: organization,
                    }),
                ),
                client.send(
                    new PutCommand({
                        TableName: outputs.MembershipsTableName,
                        Item: membership,
                    }),
                ),
                client.send(
                    new PutCommand({
                        TableName: outputs.EventsTableName,
                        Item: eventItem,
                    }),
                ),
                client.send(
                    new PutCommand({
                        TableName: outputs.EntitlementsTableName,
                        Item: entitlement,
                    }),
                ),
            ]);
            remember(outputs.OrganizationsTableName, { organizationId });
            remember(outputs.MembershipsTableName, { userId, organizationId });
            remember(outputs.EventsTableName, { eventId });
            remember(outputs.EntitlementsTableName, { organizationId });

            const memberResult = await queryEventually(
                client,
                {
                    TableName: outputs.MembershipsTableName,
                    IndexName: "organization-members-index",
                    KeyConditionExpression: "organizationId = :organizationId",
                    ExpressionAttributeValues: {
                        ":organizationId": organizationId,
                    },
                },
                (items) => items.some((item) => item.userId === userId),
            );
            expect(memberResult.Items).toEqual(
                expect.arrayContaining([expect.objectContaining(membership)]),
            );

            const orgEvents = await queryEventually(
                client,
                {
                    TableName: outputs.EventsTableName,
                    IndexName: "organization-events-index",
                    KeyConditionExpression: "organizationId = :organizationId",
                    ExpressionAttributeValues: {
                        ":organizationId": organizationId,
                    },
                },
                (items) => items.some((item) => item.eventId === eventId),
            );
            expect(orgEvents.Items).toEqual(
                expect.arrayContaining([expect.objectContaining(eventItem)]),
            );

            const publicEvents = await queryEventually(
                client,
                {
                    TableName: outputs.EventsTableName,
                    IndexName: "public-events-index",
                    KeyConditionExpression: "publicStatus = :published",
                    ExpressionAttributeValues: { ":published": "published" },
                },
                (items) => items.some((item) => item.eventId === eventId),
            );
            expect(publicEvents.Items).toEqual(
                expect.arrayContaining([expect.objectContaining(eventItem)]),
            );
        });

        test("invitations and audit records support operational indexes", async () => {
            const now = new Date().toISOString();
            const invitation = {
                invitationId: `integration-invitation-${suffix}`,
                organizationId: `integration-org-${suffix}`,
                eventId: `integration-event-${suffix}`,
                organizationEventKey: `integration-org-${suffix}#integration-event-${suffix}`,
                email: `invite-${suffix}@example.com`,
                status: "pending",
                createdAt: now,
                ttl: Math.floor(Date.now() / 1000) + 3600,
            };
            const audit = {
                auditId: `integration-audit-${suffix}`,
                organizationId: invitation.organizationId,
                createdAt: now,
                action: "integration.checked",
                resourceType: "event",
                resourceId: invitation.eventId,
                ttl: Math.floor(Date.now() / 1000) + 3600,
            };
            await Promise.all([
                client.send(
                    new PutCommand({
                        TableName: outputs.InvitationsTableName,
                        Item: invitation,
                    }),
                ),
                client.send(
                    new PutCommand({
                        TableName: outputs.AuditEventsTableName,
                        Item: audit,
                    }),
                ),
            ]);
            remember(outputs.InvitationsTableName, {
                invitationId: invitation.invitationId,
            });
            remember(outputs.AuditEventsTableName, { auditId: audit.auditId });

            const invitations = await queryEventually(
                client,
                {
                    TableName: outputs.InvitationsTableName,
                    IndexName: "email-invitations-index",
                    KeyConditionExpression: "email = :email",
                    ExpressionAttributeValues: { ":email": invitation.email },
                },
                (items) =>
                    items.some(
                        (item) => item.invitationId === invitation.invitationId,
                    ),
            );
            expect(invitations.Items).toEqual(
                expect.arrayContaining([expect.objectContaining(invitation)]),
            );

            const eventInvitations = await queryEventually(
                client,
                {
                    TableName: outputs.InvitationsTableName,
                    IndexName: "event-invitations-index",
                    KeyConditionExpression: "organizationEventKey = :key",
                    ExpressionAttributeValues: {
                        ":key": invitation.organizationEventKey,
                    },
                },
                (items) =>
                    items.some(
                        (item) => item.invitationId === invitation.invitationId,
                    ),
            );
            expect(eventInvitations.Items).toEqual(
                expect.arrayContaining([expect.objectContaining(invitation)]),
            );

            const auditEvents = await queryEventually(
                client,
                {
                    TableName: outputs.AuditEventsTableName,
                    IndexName: "organization-audit-index",
                    KeyConditionExpression: "organizationId = :organizationId",
                    ExpressionAttributeValues: {
                        ":organizationId": audit.organizationId,
                    },
                },
                (items) => items.some((item) => item.auditId === audit.auditId),
            );
            expect(auditEvents.Items).toEqual(
                expect.arrayContaining([expect.objectContaining(audit)]),
            );
        });

        test("orders support ownership queries through user-orders-index", async () => {
            const item = {
                orderId: `integration-order-${suffix}`,
                userId: `integration-user-${suffix}`,
                createdAt: new Date().toISOString(),
                amountInCents: 100,
                currency: "eur",
                status: "pending",
            };
            await client.send(
                new PutCommand({
                    TableName: outputs.OrdersTableName,
                    Item: item,
                }),
            );
            remember(outputs.OrdersTableName, { orderId: item.orderId });
            const result = await queryEventually(
                client,
                {
                    TableName: outputs.OrdersTableName,
                    IndexName: "user-orders-index",
                    KeyConditionExpression: "userId = :userId",
                    ExpressionAttributeValues: { ":userId": item.userId },
                },
                (items) => items.some((item) => item.orderId === item.orderId),
            );
            expect(result.Items).toEqual(
                expect.arrayContaining([expect.objectContaining(item)]),
            );
        });

        test("leads and interactions support tenant and event analytics indexes", async () => {
            const now = new Date().toISOString();
            const organizationId = `integration-org-${suffix}`;
            const eventId = `integration-event-${suffix}`;
            const standId = `integration-stand-${suffix}`;
            const lead = {
                leadId: `integration-lead-${suffix}`,
                organizationId,
                eventId,
                standId,
                createdAt: now,
                name: "Integration Lead",
                email: "integration@example.com",
                message: "Integration test lead",
                status: "new",
            };
            const interaction = {
                interactionId: `integration-interaction-${suffix}`,
                organizationId,
                eventId,
                standId,
                interactionType: "view",
                createdAt: now,
                ttl: Math.floor(Date.now() / 1000) + 3600,
            };
            await Promise.all([
                client.send(
                    new PutCommand({
                        TableName: outputs.LeadsTableName,
                        Item: lead,
                    }),
                ),
                client.send(
                    new PutCommand({
                        TableName: outputs.InteractionsTableName,
                        Item: interaction,
                    }),
                ),
            ]);
            remember(outputs.LeadsTableName, { leadId: lead.leadId });
            remember(outputs.InteractionsTableName, {
                interactionId: interaction.interactionId,
            });

            const organizationLeads = await queryEventually(
                client,
                {
                    TableName: outputs.LeadsTableName,
                    IndexName: "organization-leads-index",
                    KeyConditionExpression: "organizationId = :organizationId",
                    ExpressionAttributeValues: {
                        ":organizationId": organizationId,
                    },
                },
                (items) => items.some((item) => item.leadId === lead.leadId),
            );
            expect(organizationLeads.Items).toEqual(
                expect.arrayContaining([expect.objectContaining(lead)]),
            );

            const eventInteractions = await queryEventually(
                client,
                {
                    TableName: outputs.InteractionsTableName,
                    IndexName: "event-created-index",
                    KeyConditionExpression: "eventId = :eventId",
                    ExpressionAttributeValues: { ":eventId": eventId },
                },
                (items) =>
                    items.some(
                        (item) =>
                            item.interactionId === interaction.interactionId,
                    ),
            );
            expect(eventInteractions.Items).toEqual(
                expect.arrayContaining([expect.objectContaining(interaction)]),
            );
        });

        test("users, payment events and saved stands retain their primary contracts", async () => {
            const user = {
                userId: `integration-user-${suffix}`,
                displayName: "Integration User",
                role: "visitor",
            };
            const paymentEvent = {
                eventId: `evt-integration-${suffix}`,
                eventType: "payment_intent.succeeded",
                status: "processing",
                ttl: Math.floor(Date.now() / 1000) + 3600,
            };
            const saved = {
                userId: user.userId,
                standId: `integration-stand-${suffix}`,
                savedAt: new Date().toISOString(),
            };
            await Promise.all([
                client.send(
                    new PutCommand({
                        TableName: outputs.UsersTableName,
                        Item: user,
                    }),
                ),
                client.send(
                    new PutCommand({
                        TableName: outputs.PaymentEventsTableName,
                        Item: paymentEvent,
                        ConditionExpression: "attribute_not_exists(eventId)",
                    }),
                ),
                client.send(
                    new PutCommand({
                        TableName: outputs.SavedStandsTableName,
                        Item: saved,
                    }),
                ),
            ]);
            remember(outputs.UsersTableName, { userId: user.userId });
            remember(outputs.PaymentEventsTableName, {
                eventId: paymentEvent.eventId,
            });
            remember(outputs.SavedStandsTableName, {
                userId: saved.userId,
                standId: saved.standId,
            });

            const profile = await client.send(
                new GetCommand({
                    TableName: outputs.UsersTableName,
                    Key: { userId: user.userId },
                    ConsistentRead: true,
                }),
            );
            expect(profile.Item).toMatchObject(user);

            const savedResult = await queryEventually(
                client,
                {
                    TableName: outputs.SavedStandsTableName,
                    IndexName: "user-saved-at-index",
                    KeyConditionExpression: "userId = :userId",
                    ExpressionAttributeValues: { ":userId": user.userId },
                },
                (items) => items.some((item) => item.standId === saved.standId),
            );
            expect(savedResult.Items).toEqual(
                expect.arrayContaining([expect.objectContaining(saved)]),
            );
        });
    },
);
