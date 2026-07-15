#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const template = fs.readFileSync(path.join(root, "template.yaml"), "utf8");
const fixtures = JSON.parse(
    fs.readFileSync(path.join(root, "data", "dev-fixtures.json"), "utf8"),
);
const errors = [];

function requireText(haystack, needle, label = needle) {
    if (!haystack.includes(needle)) {
        errors.push(`Missing Phase 3 contract: ${label}`);
    }
}

const requiredFiles = [
    "backend/lambda/common/tenant.js",
    "backend/lambda/common/audit.js",
    "backend/lambda/common/domain.js",
    "backend/lambda/organizations/index.js",
    "backend/lambda/events/index.js",
    "backend/lambda/invitations/index.js",
    "backend/lambda/exhibitor-stands/index.js",
    "backend/lambda/exhibitor-leads/index.js",
    "backend/lambda/public-events/index.js",
    "backend/lambda/profile-sync/index.js",
    "frontend/src/events/public.js",
    "frontend/src/tenant/portal.js",
    "frontend/src/tenant/portal-templates.js",
    "docs/api/openapi.json",
    "docs/architecture/ADR-002-MULTI-TENANCY.md",
    "docs/development/PHASE-3-REPORT.md",
];
for (const relative of requiredFiles) {
    if (!fs.existsSync(path.join(root, relative))) {
        errors.push(`Missing Phase 3 file: ${relative}`);
    }
}

for (const logicalId of [
    "OrganizationsTable:",
    "MembershipsTable:",
    "EventsTable:",
    "InvitationsTable:",
    "EntitlementsTable:",
    "AuditEventsTable:",
    "OrganizationsFunction:",
    "EventsFunction:",
    "InvitationsFunction:",
    "ExhibitorStandsFunction:",
    "ExhibitorLeadsFunction:",
    "PublicEventsFunction:",
    "ProfileSyncFunction:",
    "ProfileSyncPermission:",
]) {
    requireText(template, logicalId);
}

requireText(template, "PostConfirmation: !GetAtt ProfileSyncFunction.Arn");

for (const index of [
    "event-stands-index",
    "public-stands-index",
    "owner-stands-index",
    "organization-leads-index",
    "event-created-index",
    "organization-slug-index",
    "organization-members-index",
    "organization-events-index",
    "public-events-index",
    "email-invitations-index",
    "organization-audit-index",
]) {
    requireText(template, `IndexName: ${index}`);
}

for (const route of [
    "/me/memberships",
    "/platform/organizations",
    "/organizations/{organizationId}/events",
    "/organizations/{organizationId}/events/{eventId}/publish",
    "/organizations/{organizationId}/events/{eventId}/invitations",
    "/invitations/{invitationId}/accept",
    "/exhibitor/stands",
    "/exhibitor/leads",
    "/events",
    "/events/{eventId}/stands",
]) {
    requireText(template, `Path: ${route}`);
}

if ((fixtures.organizations || []).length < 2) {
    errors.push(
        "Development fixtures must contain at least two organizations.",
    );
}
if ((fixtures.events || []).length < 2) {
    errors.push("Development fixtures must contain at least two events.");
}
const organizationIds = new Set(
    (fixtures.organizations || []).map((item) => item.organizationId),
);
for (const event of fixtures.events || []) {
    if (!organizationIds.has(event.organizationId)) {
        errors.push(
            `Event ${event.eventId} references an unknown organization.`,
        );
    }
}
const tenantStandCoverage = new Set(
    (fixtures.stands || []).map((item) => item.organizationId).filter(Boolean),
);
for (const organizationId of organizationIds) {
    if (!tenantStandCoverage.has(organizationId)) {
        errors.push(
            `Development fixtures need at least one stand for tenant ${organizationId}.`,
        );
    }
}
for (const stand of fixtures.stands || []) {
    if (!stand.organizationId || !stand.eventId || !stand.ownerUserId) {
        errors.push(
            `Stand ${stand.stand_id} is missing tenant ownership fields.`,
        );
    }
}

const sourceFiles = [
    "backend/lambda/get-stands/index.js",
    "backend/lambda/search-stands/index.js",
].map((relative) => fs.readFileSync(path.join(root, relative), "utf8"));
for (const source of sourceFiles) {
    if (/\bScanCommand\b/.test(source)) {
        errors.push(
            "Public catalogue handlers must not use DynamoDB ScanCommand.",
        );
    }
}

if (template.includes("/auth/login") || template.includes("/auth/refresh")) {
    errors.push("Legacy custom authentication routes must remain removed.");
}

if (errors.length) {
    console.error("Phase 3 asset check failed:\n");
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exit(1);
}

console.log(
    `Phase 3 asset check passed: ${organizationIds.size} tenant fixtures and ${(fixtures.events || []).length} events verified.`,
);
