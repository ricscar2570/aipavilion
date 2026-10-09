#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const errors = [];
const requireFile = (relative) => {
    if (!fs.existsSync(path.join(root, relative))) {
        errors.push(`Missing Sprint 4.5E file: ${relative}`);
    }
};
const requireText = (text, needle, label = needle) => {
    if (!text.includes(needle)) {
        errors.push(`Missing 4.5E contract: ${label}`);
    }
};

for (const file of [
    "data/migrations/002-fail-closed-public-catalog.js",
    "frontend/public/stand-placeholder.svg",
    "tests/unit/catalog.test.js",
    "docs/development/SPRINT-4.5E-REPORT.md",
]) {
    requireFile(file);
}

const catalog = read("backend/lambda/common/catalog.js");
const domain = read("backend/lambda/common/domain.js");
const search = read("backend/lambda/search-stands/index.js");
const exhibitor = read("backend/lambda/exhibitor-stands/index.js");
const events = read("backend/lambda/events/index.js");
const frontendPolicy = read("infrastructure/frontend-pilot.yaml");
const frontendFiles = [
    "frontend/src/app.js",
    "frontend/src/account/dashboard.js",
    "frontend/src/account/dashboard-templates.js",
    "frontend/src/stands/card.js",
    "frontend/src/stands/detail.js",
    "frontend/src/stands/search.js",
    "frontend/src/tenant/portal-templates.js",
    "frontend/src/ui/ui.js",
]
    .map(read)
    .join("\n");

for (const condition of [
    'stand.status === "published"',
    'stand.moderationStatus === "approved"',
    'stand.visibility === "public"',
    'stand.eventStatus === "published"',
    'stand.publicStatus === "published"',
    'stand.publicationKey.startsWith("published#")',
]) {
    requireText(catalog, condition);
}
requireText(catalog, "publicContact(stand)");
requireText(catalog, 'product.status === "hidden"');
requireText(domain, "isEventPublic(event)");
requireText(domain, 'const { isEventPublic } = require("./publication-state")');
requireText(search, "while (matches.length < limit)");
requireText(search, "searchableText(item)");
requireText(search, "scannedCount");
requireText(exhibitor, "validPublicContact");
requireText(exhibitor, 'moderationStatus = "draft"');
requireText(events, "synchronizeEventStandPublication");
requireText(
    events,
    'moderationStatus = status === "published" ? "approved" : "rejected"',
);

for (const forbidden of [
    "coming soon",
    "Coming soon",
    "book-meeting",
    "change-language",
    "manage-notifications",
    "onerror=",
    "onclick=",
    'style="',
    ".style.",
]) {
    if (frontendFiles.includes(forbidden)) {
        errors.push(
            `Frontend still contains incomplete or CSP-unsafe pattern: ${forbidden}`,
        );
    }
}
if (frontendPolicy.includes("'unsafe-inline'")) {
    errors.push("Pilot CSP still permits unsafe-inline.");
}

const fixture = JSON.parse(read("data/dev-fixtures.json"));
for (const stand of fixture.stands || []) {
    if (stand.status === "published" && stand.moderationStatus !== "approved") {
        errors.push(
            `Published fixture ${stand.stand_id} lacks approved moderation status.`,
        );
    }
}

const { isPublicStand, toPublicStand, searchableText } = require(
    path.join(root, "backend/lambda/common/catalog.js"),
);
const { publicEvent } = require(
    path.join(root, "backend/lambda/common/domain.js"),
);
const publicStandFixture = {
    stand_id: "stand-check",
    eventId: "event-check",
    name: "Public stand",
    status: "published",
    moderationStatus: "approved",
    visibility: "public",
    eventStatus: "published",
    publicStatus: "published",
    publicationKey: "published#2026-08-06T00:00:00.000Z",
    contact_email: "private@example.test",
    website: "https://example.test",
    products: [
        { id: "visible", name: "Visible product", status: "active" },
        { id: "hidden", name: "Hidden product", status: "hidden" },
    ],
};
if (!isPublicStand(publicStandFixture)) {
    errors.push("A fully explicit published stand is not considered public.");
}
for (const field of [
    "moderationStatus",
    "visibility",
    "eventStatus",
    "publicStatus",
    "publicationKey",
]) {
    const incomplete = { ...publicStandFixture };
    delete incomplete[field];
    if (isPublicStand(incomplete)) {
        errors.push(
            `Public stand eligibility does not fail closed when ${field} is missing.`,
        );
    }
}
const privateProjection = toPublicStand(publicStandFixture);
if (privateProjection?.contact) {
    errors.push("Public contact data is exposed without explicit consent.");
}
if (privateProjection?.products?.some((product) => product.id === "hidden")) {
    errors.push("Hidden products are present in the public projection.");
}
if (searchableText(publicStandFixture).includes("hidden product")) {
    errors.push("Hidden products are included in public search text.");
}
const optedInProjection = toPublicStand({
    ...publicStandFixture,
    publicContact: { showEmail: true, showPhone: false, showWebsite: true },
});
if (
    optedInProjection?.contact?.email !== "private@example.test" ||
    optedInProjection?.contact?.website !== "https://example.test"
) {
    errors.push(
        "Explicit public contact consent is not reflected in the projection.",
    );
}
if (
    publicEvent({
        eventId: "event-check",
        organizationId: "org-check",
        name: "Public event",
        status: "published",
        visibility: "public",
        publicStatus: "published",
    }) !== null
) {
    errors.push("A public event without publishedAt does not fail closed.");
}

const openapi = JSON.parse(read("docs/api/openapi.json"));
const update =
    openapi.components?.schemas?.StandUpdateRequest?.properties || {};
for (const field of ["contactPhone", "publicContact"]) {
    if (!update[field]) {
        errors.push(`OpenAPI StandUpdateRequest lacks ${field}.`);
    }
}

if (errors.length) {
    console.error("Sprint 4.5E asset check failed:\n");
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exit(1);
}

console.log(
    "Sprint 4.5E asset check passed: fail-closed catalog, complete pilot search, opt-in contacts and production-only UI are present.",
);
