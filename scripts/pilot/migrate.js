#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const { readStackOutputs } = require("../dev/stack-outputs");

const root = path.resolve(__dirname, "../..");
const action = process.argv[2] || "status";
if (!["status", "plan", "apply", "verify"].includes(action)) {
    console.error(
        "Usage: node scripts/pilot/migrate.js status|plan|apply|verify",
    );
    process.exit(2);
}
const outputs = readStackOutputs();
const tableName = outputs.SchemaMigrationsTableName;
if (!tableName) {
    throw new Error("SchemaMigrationsTableName is missing from stack outputs");
}
const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION }),
);
const migrationDir = path.join(root, "data", "migrations");
const migrations = fs
    .readdirSync(migrationDir)
    .filter((file) => /^\d+.*\.js$/.test(file))
    .sort()
    .map((file) => require(path.join(migrationDir, file)));

async function applied() {
    const result = await client.send(new ScanCommand({ TableName: tableName }));
    return new Map(
        (result.Items || []).map((item) => [item.migrationId, item]),
    );
}

async function run() {
    const existing = await applied();
    const summary = [];
    for (const migration of migrations) {
        const isApplied = existing.has(migration.id);
        if (action === "status") {
            summary.push({ id: migration.id, applied: isApplied });
            continue;
        }
        if (action === "plan") {
            summary.push({
                id: migration.id,
                applied: isApplied,
                changes: await migration.plan(client, outputs),
            });
            continue;
        }
        if (action === "verify") {
            summary.push({
                id: migration.id,
                applied: isApplied,
                valid: isApplied
                    ? await migration.verify(client, outputs)
                    : false,
            });
            continue;
        }
        if (isApplied) {
            summary.push({ id: migration.id, skipped: true });
            continue;
        }
        const lock = await client.send(
            new GetCommand({
                TableName: tableName,
                Key: { migrationId: migration.id },
                ConsistentRead: true,
            }),
        );
        if (lock.Item) {
            continue;
        }
        const startedAt = new Date().toISOString();
        await migration.up(client, outputs);
        const valid = await migration.verify(client, outputs);
        if (!valid) {
            throw new Error(`Migration verification failed: ${migration.id}`);
        }
        await client.send(
            new PutCommand({
                TableName: tableName,
                Item: {
                    migrationId: migration.id,
                    description: migration.description,
                    appliedAt: new Date().toISOString(),
                    startedAt,
                    checksum: require("crypto")
                        .createHash("sha256")
                        .update(JSON.stringify(migration))
                        .digest("hex"),
                },
                ConditionExpression: "attribute_not_exists(migrationId)",
            }),
        );
        summary.push({ id: migration.id, applied: true });
    }
    console.log(JSON.stringify(summary, null, 2));
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
