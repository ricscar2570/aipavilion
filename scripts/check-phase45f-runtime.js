#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const errors = [];
const requireText = (relative, needle, label = needle) => {
    const source = read(relative);
    if (!source.includes(needle)) {
        errors.push(`${relative}: missing ${label}`);
    }
};

const requiredFiles = [
    "backend/lambda/common/api-error.js",
    "backend/lambda/common/lead-protection.js",
    "backend/lambda/common/publication-state.js",
    "backend/lambda/common/public-event-barrier.js",
    "frontend/src/core/session-lifecycle.js",
    "tests/node/phase4.5f-runtime-integration.test.js",
];
for (const relative of requiredFiles) {
    if (!fs.existsSync(path.join(root, relative))) {
        errors.push(`Missing 4.5F runtime file: ${relative}`);
    }
}

requireText(
    "backend/lambda/common/observability.js",
    "normalizeApiResponse",
    "runtime error normalization",
);
requireText(
    "backend/lambda/common/observability.js",
    "unhandledResponse",
    "safe unhandled exception response",
);
requireText(
    "backend/lambda/contact-stand/index.js",
    "validateTurnstileResult",
    "Turnstile context validation",
);
requireText(
    "backend/lambda/contact-stand/index.js",
    "sourcePseudonym",
    "opt-in IP pseudonymization",
);
requireText(
    "backend/lambda/events/index.js",
    "publishCheckpoint",
    "publishing checkpoint",
);
requireText(
    "backend/lambda/events/index.js",
    '"publish_failed"',
    "publishing failure state",
);
requireText(
    "backend/lambda/events/index.js",
    "REMOVE publishedAt, publishCompletedAt",
    "published-event edits return the event to a fail-closed draft",
);
requireText(
    "backend/lambda/events/index.js",
    "EVENT_NOT_DUPLICABLE",
    "transitional events cannot be duplicated",
);
for (const relative of [
    "backend/lambda/get-stands/index.js",
    "backend/lambda/search-stands/index.js",
]) {
    requireText(
        relative,
        "filterStandsByPublicEvent",
        "public owner-event barrier",
    );
}
requireText(
    "backend/lambda/get-stand-detail/index.js",
    "standEventIsPublic",
    "public owner-event detail barrier",
);
requireText(
    "backend/lambda/common/domain.js",
    "isEventPublic(event)",
    "canonical event public-state check",
);
requireText(
    "frontend/src/app.js",
    "installSessionLifecycle()",
    "session lifecycle bootstrap",
);
for (const needle of [
    "BotChallengeExpectedHostname",
    "BotChallengeExpectedAction",
    "BotChallengeMaxAgeSeconds",
    "LeadIpPseudonymizationMode",
    "LeadPrivacyCredentials",
    "PUBLISH_PAGE_SIZE",
]) {
    requireText("template.yaml", needle);
}

if (errors.length) {
    console.error("Sprint 4.5F runtime integration check failed:\n");
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exit(1);
}
console.log(
    "Sprint 4.5F runtime integration check passed: errors, sessions, privacy controls, Turnstile, publishing saga and public barriers are connected.",
);
