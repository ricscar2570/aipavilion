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
    "scripts/check-lockfile-portability.js",
    "scripts/check-infrastructure-contracts.js",
    "scripts/lib/template-contracts.js",
    "scripts/pilot/resolve-deployment-origin.js",
    "scripts/pilot/check-origin-resolution.js",
    "scripts/pilot/preflight-staging.js",
    "scripts/pilot/run-staging-evidence.sh",
    "scripts/pilot/generate-evidence-manifest.js",
    "docs/operations/STAGING-RUNBOOK.md",
    "docs/development/PHASE-4-REPORT.md",
    "docs/development/SPRINT-4.5B-REPORT.md",
    "docs/product/PRODUCT-INTENT.md",
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
requireText(template, "USER_SAVED_INDEX: user-saved-at-index");
requireText(pilot, "USER_SAVED_INDEX: user-saved-at-index");
const obsoleteSavedIndex = `USER_SAVED_INDEX: ${[
    "user",
    "saved",
    "index",
].join("-")}`;
if (template.includes(obsoleteSavedIndex) || pilot.includes(obsoleteSavedIndex)) {
    errors.push("Data export references an obsolete saved-stands index name.");
}
requireText(
    template,
    "PointInTimeRecoveryEnabled: false",
    "disposable dev PITR boundary",
);
requireText(pilot, "PointInTimeRecoveryEnabled: true");
requireText(pilot, "DeletionPolicy: Retain");
const billingSource = fs.readFileSync(
    path.join(root, "backend", "lambda", "billing", "index.js"),
    "utf8",
);
requireText(billingSource, "leaseExpiresAt");
requireText(billingSource, "claim.leaseToken");
requireText(billingSource, "stripeEventCreatedAt");
requireText(pilot, "AllowedValues: [staging, production]");
const deployScript = fs.readFileSync(
    path.join(root, "scripts", "pilot", "deploy-staging.sh"),
    "utf8",
);
requireText(deployScript, "BOOTSTRAP_ORIGIN");
requireText(deployScript, "FINAL_APP_URL");
requireText(deployScript, 'backend_deploy "$FINAL_APP_URL"');
requireText(deployScript, "PRODUCT_PAYMENT_MODE");
if (deployScript.includes("PaymentMode=stripe")) {
    errors.push("Pilot deployment must not hard-code visitor product checkout.");
}
const stagingWorkflow = fs.readFileSync(
    path.join(root, ".github", "workflows", "staging.yml"),
    "utf8",
);
requireText(stagingWorkflow, "npm run pilot:evidence");
requireText(stagingWorkflow, ".artifacts/evidence/**");
requireText(stagingWorkflow, "python -m playwright install --with-deps chromium");
const ciWorkflow = fs.readFileSync(
    path.join(root, ".github", "workflows", "ci.yml"),
    "utf8",
);
requireText(ciWorkflow, "sam validate --lint --template-file infrastructure/backend-pilot.yaml");
requireText(ciWorkflow, "sam build --template-file infrastructure/backend-pilot.yaml");
const browserRunner = fs.readFileSync(
    path.join(root, "scripts", "dev", "run-browser-e2e.sh"),
    "utf8",
);
requireText(browserRunner, "E2E_BASE_URL");
requireText(browserRunner, "https://*");
const stagingEnvWriter = fs.readFileSync(
    path.join(root, "scripts", "pilot", "write-staging-env.js"),
    "utf8",
);
requireText(stagingEnvWriter, 'process.env.PRODUCT_PAYMENT_MODE || "disabled"');
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
