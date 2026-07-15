"use strict";

const fs = require("fs");
const path = require("path");
const {
    DynamoDBClient,
    DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand,
    QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const { readStackOutputs } = require("./stack-outputs");

const outputs = readStackOutputs();
const region =
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-west-1";
const endpoint = process.env.DYNAMODB_ENDPOINT || undefined;
const baseClient = new DynamoDBClient({ region, endpoint });
const documentClient = DynamoDBDocumentClient.from(baseClient, {
    marshallOptions: { removeUndefinedValues: true },
});
const fixtures = JSON.parse(
    fs.readFileSync(path.resolve("data/dev-fixtures.json"), "utf8"),
);

async function assertTable(tableName, expectedIndexes = []) {
    const result = await baseClient.send(
        new DescribeTableCommand({ TableName: tableName }),
    );
    const actualIndexes = new Set(
        (result.Table?.GlobalSecondaryIndexes || []).map(
            (index) => index.IndexName,
        ),
    );
    for (const expected of expectedIndexes) {
        if (!actualIndexes.has(expected)) {
            throw new Error(`Missing index ${expected} on ${tableName}`);
        }
    }
}

async function putAll(tableName, items, keyName) {
    for (const item of items) {
        await documentClient.send(
            new PutCommand({
                TableName: tableName,
                Item: item,
                ConditionExpression: `attribute_not_exists(${keyName}) OR updatedAt <= :fixtureUpdatedAt`,
                ExpressionAttributeValues: {
                    ":fixtureUpdatedAt":
                        item.updatedAt || item.updated_at || item.createdAt,
                },
            }),
        );
    }
}

async function main() {
    await Promise.all([
        assertTable(outputs.StandsTableName, [
            "category-index",
            "event-stands-index",
            "public-stands-index",
            "owner-stands-index",
        ]),
        assertTable(outputs.OrdersTableName, ["user-orders-index"]),
        assertTable(outputs.UsersTableName),
        assertTable(outputs.LeadsTableName, [
            "stand-leads-index",
            "organization-leads-index",
        ]),
        assertTable(outputs.InteractionsTableName, [
            "stand-created-index",
            "event-created-index",
        ]),
        assertTable(outputs.SavedStandsTableName, ["user-saved-at-index"]),
        assertTable(outputs.OrganizationsTableName, [
            "organization-slug-index",
        ]),
        assertTable(outputs.MembershipsTableName, [
            "organization-members-index",
        ]),
        assertTable(outputs.EventsTableName, [
            "organization-events-index",
            "public-events-index",
        ]),
        assertTable(outputs.InvitationsTableName, ["email-invitations-index"]),
        assertTable(outputs.EntitlementsTableName),
        assertTable(outputs.AuditEventsTableName, ["organization-audit-index"]),
    ]);

    await putAll(
        outputs.OrganizationsTableName,
        fixtures.organizations,
        "organizationId",
    );
    await putAll(outputs.EventsTableName, fixtures.events, "eventId");
    await putAll(
        outputs.EntitlementsTableName,
        fixtures.entitlements,
        "organizationId",
    );
    await putAll(outputs.StandsTableName, fixtures.stands, "stand_id");

    const canonical = fixtures.stands[0];
    const [byId, byCategory, byEvent, publicEvents] = await Promise.all([
        documentClient.send(
            new GetCommand({
                TableName: outputs.StandsTableName,
                Key: { stand_id: canonical.stand_id },
                ConsistentRead: true,
            }),
        ),
        documentClient.send(
            new QueryCommand({
                TableName: outputs.StandsTableName,
                IndexName: "category-index",
                KeyConditionExpression: "category = :category",
                ExpressionAttributeValues: { ":category": canonical.category },
            }),
        ),
        documentClient.send(
            new QueryCommand({
                TableName: outputs.StandsTableName,
                IndexName: "event-stands-index",
                KeyConditionExpression: "eventId = :eventId",
                ExpressionAttributeValues: { ":eventId": canonical.eventId },
            }),
        ),
        documentClient.send(
            new QueryCommand({
                TableName: outputs.EventsTableName,
                IndexName: "public-events-index",
                KeyConditionExpression: "publicStatus = :published",
                ExpressionAttributeValues: { ":published": "published" },
            }),
        ),
    ]);
    if (
        !byId.Item ||
        !(byCategory.Items || []).length ||
        !(byEvent.Items || []).length ||
        !(publicEvents.Items || []).length
    ) {
        throw new Error("Phase 3 seed verification failed.");
    }
    console.log(
        `Seeded ${fixtures.organizations.length} organizations, ${fixtures.events.length} events and ${fixtures.stands.length} stands.`,
    );
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
