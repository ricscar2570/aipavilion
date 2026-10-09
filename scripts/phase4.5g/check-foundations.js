#!/usr/bin/env node
"use strict";

const assert = require("assert/strict");
const fs = require("fs");

function read(file) {
    assert.ok(fs.existsSync(file), `Missing required file: ${file}`);
    return fs.readFileSync(file, "utf8");
}

function includes(file, patterns) {
    const source = read(file);
    for (const pattern of patterns) {
        assert.match(source, pattern, `${file} is missing ${pattern}`);
    }
}

includes("backend/lambda/common/observability.js", [
    /normalizeApiResponse/,
    /unhandledResponse/,
]);
includes("backend/lambda/contact-stand/index.js", [
    /validateTurnstileResult/,
    /pseudonymizeIp/,
    /standEventIsPublic/,
    /LEAD_IP_PSEUDONYMIZATION_MODE/,
    /BOT_CHALLENGE_EXPECTED_HOSTNAME/,
]);
includes("backend/lambda/events/index.js", [
    /publicationState: "draft"/,
    /publishCheckpoint/,
    /publish_failed/,
    /Retry-After/,
    /publicationState = :archiving/,
    /publicationState = :archived/,
]);
includes("backend/lambda/get-stands/index.js", [/filterStandsByPublicEvent/]);
includes("backend/lambda/get-stand-detail/index.js", [/standEventIsPublic/]);
includes("backend/lambda/search-stands/index.js", [
    /filterStandsByPublicEvent/,
]);
includes("backend/lambda/common/domain.js", [/isEventPublic/]);
includes("template.yaml", [
    /LeadIpPseudonymizationMode/,
    /BotChallengeExpectedHostname/,
    /PUBLISH_PAGE_SIZE/,
    /LEAD_IP_HMAC_SECRET_ARN/,
]);
includes("infrastructure/backend-pilot.yaml", [
    /LeadIpPseudonymizationMode/,
    /BotChallengeExpectedHostname/,
    /PUBLISH_PAGE_SIZE/,
    /LEAD_IP_HMAC_SECRET_ARN/,
]);
includes("data/migrations/004-publishing-saga-state.js", [
    /004-publishing-saga-state/,
    /ambiguousEventsHidden/,
]);

const openapi = JSON.parse(read("docs/api/openapi.json"));
const publish =
    openapi.paths?.["/organizations/{organizationId}/events/{eventId}/publish"]
        ?.post;
assert.ok(publish, "OpenAPI publish operation is missing");
assert.ok(publish.responses?.["202"], "OpenAPI 202 response is missing");
assert.ok(
    publish.responses?.["202"]?.headers?.["Retry-After"],
    "OpenAPI Retry-After header is missing",
);
assert.ok(
    openapi.components?.schemas?.ApiError,
    "OpenAPI ApiError schema is missing",
);

console.log(
    "PASS: 4.5F runtime foundations and 4.5G operational contracts are wired fail-closed.",
);
