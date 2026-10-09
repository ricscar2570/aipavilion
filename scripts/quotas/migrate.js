#!/usr/bin/env node
"use strict";

const {
    scanAll,
    readEntitlement,
    extractLimit,
    calculateEventUsage,
    calculateStandUsage,
    initializeCounter,
    eventCounterKey,
    standCounterKey,
    requiredEnv,
} = require("../../backend/lambda/common/quota-store");

const apply = process.argv.includes("--apply");

async function main() {
    const entitlements = await scanAll({
        TableName: requiredEnv("ENTITLEMENTS_TABLE"),
    });
    const events = await scanAll({ TableName: requiredEnv("EVENTS_TABLE") });
    const plan = [];
    for (const entitlement of entitlements) {
        const organizationId = entitlement.organizationId;
        if (!organizationId) {
            continue;
        }
        const limit = extractLimit(entitlement, "events");
        const used = await calculateEventUsage(organizationId);
        const operation = {
            kind: "events",
            counterKey: eventCounterKey(organizationId),
            organizationId,
            limit,
            used,
            reserved: 0,
        };
        plan.push(operation);
        if (apply) {
            await initializeCounter(operation);
        }
    }
    for (const event of events) {
        if (!event.eventId || !event.organizationId) {
            continue;
        }
        const entitlement = await readEntitlement(event.organizationId);
        const limit = extractLimit(entitlement, "stands");
        const usage = await calculateStandUsage(event.eventId);
        const operation = {
            kind: "stands",
            counterKey: standCounterKey(event.eventId),
            organizationId: event.organizationId,
            eventId: event.eventId,
            limit,
            ...usage,
        };
        plan.push(operation);
        if (apply) {
            await initializeCounter(operation);
        }
    }
    process.stdout.write(
        `${JSON.stringify({ migration: "003-atomic-entitlement-quotas", apply, operations: plan }, null, 2)}\n`,
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
