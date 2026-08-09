#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const errors = [];
const requireFile = (relative) => {
    if (!fs.existsSync(path.join(root, relative))) {
        errors.push(`Missing Sprint 4.5D file: ${relative}`);
    }
};
const requireText = (text, needle, label = needle) => {
    if (!text.includes(needle)) errors.push(`Missing 4.5D contract: ${label}`);
};

for (const file of [
    "backend/lambda/common/retry.js",
    "backend/lambda/payment-reconciliation/index.js",
    "tests/unit/payment-reconciliation.test.js",
    "docs/development/SPRINT-4.5D-REPORT.md",
]) {
    requireFile(file);
}

const template = read("template.yaml");
const pilot = read("infrastructure/backend-pilot.yaml");
const checkout = read("backend/lambda/checkout/index.js");
const billing = read("backend/lambda/billing/index.js");
const audit = read("backend/lambda/common/audit.js");
const events = read("backend/lambda/events/index.js");
const retry = read("backend/lambda/common/retry.js");
const reconciliation = read("backend/lambda/payment-reconciliation/index.js");

for (const source of [template, pilot]) {
    requireText(source, "PaymentReconciliationFunction:");
    requireText(source, "EntryPoints: [payment-reconciliation/index.js]");
    requireText(source, "Schedule: rate(15 minutes)");
    requireText(source, "PaymentReconciliationLogGroup:");
    const transactPermissions = (
        source.match(/Action: dynamodb:TransactWriteItems/g) || []
    ).length;
    if (transactPermissions < 5) {
        errors.push(
            `Expected explicit TransactWriteItems permissions for five tenant functions, found ${transactPermissions}.`,
        );
    }
}

for (const source of [checkout, billing]) {
    requireText(source, "leaseExpiresAt");
    requireText(source, "leaseToken");
    requireText(source, "stripeCreatedAt");
    requireText(source, "out_of_order");
}
requireText(checkout, "retryUnprocessedBatchGet");
requireText(retry, "DYNAMODB_UNPROCESSED_KEYS");
requireText(reconciliation, "expireAbandonedEventLeases");
requireText(reconciliation, "reconcileOrders");
requireText(reconciliation, "reconcileEntitlements");
requireText(audit, "transactWithAudit");
requireText(audit, "buildAuditTransactPut");
requireText(events, 'status: "archiving"');
requireText(events, 'action: "event.archive_started"');

for (const file of [
    "backend/lambda/organizations/index.js",
    "backend/lambda/events/index.js",
    "backend/lambda/invitations/index.js",
    "backend/lambda/exhibitor-stands/index.js",
    "backend/lambda/exhibitor-leads/index.js",
]) {
    requireText(read(file), "transactWithAudit", `${file} transactional audit`);
}

if (checkout.includes("releaseWebhookEvent")) {
    errors.push("Checkout still deletes failed webhook claims instead of retaining retry state.");
}
if (checkout.includes("DeleteItemCommand")) {
    errors.push("Checkout still imports destructive webhook claim deletion.");
}

if (errors.length) {
    console.error("Sprint 4.5D asset check failed:\n");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
}

console.log(
    "Sprint 4.5D asset check passed: transactional audit, webhook leases, ordering, retry and reconciliation are present.",
);
