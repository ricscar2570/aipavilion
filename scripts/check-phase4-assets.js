#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const template = fs.readFileSync(path.join(root, "template.yaml"), "utf8");
const pilot = fs.readFileSync(
    path.join(root, "infrastructure", "backend-pilot.yaml"),
    "utf8",
);
const errors = [];

function requireFile(relative) {
    if (!fs.existsSync(path.join(root, relative))) {
        errors.push(`Missing Phase 4 file: ${relative}`);
    }
}

function requireText(haystack, needle, label = needle) {
    if (!haystack.includes(needle)) {
        errors.push(`Missing Phase 4 contract: ${label}`);
    }
}

for (const file of [
    "backend/lambda/billing/index.js",
    "backend/lambda/email-events/index.js",
    "backend/lambda/audit-view/index.js",
    "backend/lambda/data-export/index.js",
    "infrastructure/backend-pilot.yaml",
    "infrastructure/frontend-pilot.yaml",
    "infrastructure/operations-pilot.yaml",
    "scripts/pilot/generate-pilot-backend.js",
    "scripts/pilot/deploy-staging.sh",
    "scripts/pilot/migrate.js",
    "docs/operations/STAGING-RUNBOOK.md",
    "docs/development/PHASE-4-REPORT.md",
    "docs/operations/INCIDENT-RESPONSE.md",
    "docs/operations/PILOT-SERVICE-OBJECTIVES.md",
    "docs/compliance/PRIVACY-DATA-INVENTORY.md",
    "docs/compliance/ACCESSIBILITY-CHECKLIST.md",
    ".github/workflows/staging.yml",
    ".github/workflows/security.yml",
    ".github/workflows/synthetic.yml",
]) {
    requireFile(file);
}

for (const logicalId of [
    "BillingFunction:",
    "EmailEventsFunction:",
    "AuditViewFunction:",
    "DataExportFunction:",
    "BotChallengeCredentials:",
    "InvitationConfigurationSet:",
    "InvitationEventTopicPolicy:",
    "SchemaMigrationsTable:",
]) {
    requireText(template, logicalId);
}

for (const route of [
    "/organizations/{organizationId}/billing/checkout",
    "/billing/webhook",
    "/organizations/{organizationId}/audit",
    "/user/export",
    "/organizations/{organizationId}/events/{eventId}/duplicate",
    "/organizations/{organizationId}/events/{eventId}/archive",
]) {
    requireText(template, `Path: ${route}`);
}

requireText(template, "IndexName: event-invitations-index");
requireText(
    template,
    "PointInTimeRecoveryEnabled: false",
    "disposable dev PITR boundary",
);
requireText(pilot, "PointInTimeRecoveryEnabled: true");
requireText(pilot, "DeletionPolicy: Retain");
requireText(
    fs.readFileSync(
        path.join(root, "backend", "lambda", "billing", "index.js"),
        "utf8",
    ),
    'status !== "failed"',
);
requireText(
    fs.readFileSync(
        path.join(root, "backend", "lambda", "billing", "index.js"),
        "utf8",
    ),
    "failEvent(stripeEvent.id, error)",
);
requireText(pilot, "AllowedValues: [staging, production]");
requireText(pilot, "MfaConfiguration: OPTIONAL");
if (pilot.includes("AllowedValues: [disabled, simulated, stripe]")) {
    errors.push(
        "Pilot backend must not allow simulated billing or payment modes.",
    );
}
if (pilot.includes("PointInTimeRecoveryEnabled: false")) {
    errors.push(
        "Pilot backend contains a table without point-in-time recovery.",
    );
}

if (errors.length) {
    console.error("Phase 4 asset check failed:\n");
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exit(1);
}
console.log(
    "Phase 4 asset check passed: staging, billing, trust and operations assets verified.",
);
