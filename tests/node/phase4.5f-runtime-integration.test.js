"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const {
    envelope,
    normalizeApiResponse,
    sanitizeDetails,
    unhandledResponse,
} = require("../../backend/lambda/common/api-error");
const {
    beginPublishing,
    completePublishing,
    failPublishing,
    isEventPublic,
    resumePublishing,
} = require("../../backend/lambda/common/publication-state");
const {
    filterStandsByEventMap,
} = require("../../backend/lambda/common/public-event-barrier");
const {
    pseudonymizeIp,
    validateTurnstileResult,
} = require("../../backend/lambda/common/lead-protection");
const publishingMigration = require("../../data/migrations/004-publishing-saga-state");

test("API errors are normalized without leaking credential-like details", () => {
    const response = normalizeApiResponse(
        {
            statusCode: 400,
            headers: {},
            body: JSON.stringify({
                error: "VALIDATION_ERROR",
                message: "Bad request",
                details: { apiKey: "secret", field: "name" },
            }),
        },
        { requestId: "request-1234" },
        {},
    );
    const body = JSON.parse(response.body);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.deepEqual(body.error.details, { field: "name" });
    assert.equal(body.requestId, "request-1234");
});

test("unhandled exceptions return a safe request-correlated envelope", () => {
    const response = unhandledResponse(
        Object.assign(new Error("database password leaked"), {
            code: "RAW_INTERNAL",
        }),
        { requestId: "request-5678" },
        {},
    );
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 500);
    assert.equal(body.error.code, "INTERNAL_ERROR");
    assert.equal(
        body.error.message,
        "The service could not complete the request.",
    );
    assert.equal(body.error.requestId, "request-5678");
    assert.equal(response.body.includes("database password"), false);
});

test("publication state remains fail-closed until final completion", () => {
    const draft = {
        eventId: "evt_1",
        status: "draft",
        visibility: "public",
        publicStatus: "draft",
    };
    const started = beginPublishing(
        draft,
        "publish_1",
        "2026-08-24T10:00:00.000Z",
    );
    assert.equal(started.status, "publishing");
    assert.equal(isEventPublic(started), false);
    const failed = failPublishing(
        started,
        { code: "THROTTLED", requestId: "request-1" },
        "2026-08-24T10:01:00.000Z",
    );
    assert.equal(isEventPublic(failed), false);
    const resumed = resumePublishing(failed, "2026-08-24T10:02:00.000Z");
    assert.equal(resumed.publishOperationId, "publish_1");
    assert.equal(isEventPublic(resumed), false);
    const completed = completePublishing(resumed, "2026-08-24T10:03:00.000Z");
    assert.equal(isEventPublic(completed), true);
});

test("stand barrier filters stands whose owner event is not fully public", () => {
    const events = [
        {
            eventId: "evt_public",
            status: "published",
            visibility: "public",
            publicStatus: "published",
            publishedAt: "2026-08-24T10:00:00.000Z",
            publicationState: "published",
        },
        {
            eventId: "evt_pending",
            status: "publishing",
            visibility: "public",
            publicStatus: "hidden",
            publishedAt: "2026-08-24T10:00:00.000Z",
            publicationState: "publishing",
        },
    ];
    const stands = [
        { stand_id: "stand_1", eventId: "evt_public" },
        { stand_id: "stand_2", eventId: "evt_pending" },
    ];
    assert.deepEqual(filterStandsByEventMap(stands, events), [stands[0]]);
});

test("Turnstile context rejects stale, future and mismatched challenges", () => {
    const now = Date.parse("2026-08-24T10:00:00.000Z");
    const base = {
        success: true,
        hostname: "staging.example",
        action: "lead-submit",
        challenge_ts: new Date(now - 1000).toISOString(),
    };
    assert.equal(
        validateTurnstileResult(base, {
            hostname: "staging.example",
            action: "lead-submit",
            now,
        }).valid,
        true,
    );
    assert.equal(
        validateTurnstileResult(
            { ...base, hostname: "evil.example" },
            { hostname: "staging.example", action: "lead-submit", now },
        ).valid,
        false,
    );
    assert.equal(
        validateTurnstileResult(
            {
                ...base,
                challenge_ts: new Date(now + 60000).toISOString(),
            },
            { hostname: "staging.example", action: "lead-submit", now },
        ).reason,
        "challenge_timestamp_in_future",
    );
});

test("lead IP pseudonymization is opt-in and secret-bound", () => {
    assert.equal(pseudonymizeIp("192.0.2.1"), null);
    const a = pseudonymizeIp("192.0.2.1", {
        mode: "hmac",
        secret: "a".repeat(32),
    });
    const b = pseudonymizeIp("192.0.2.1", {
        mode: "hmac",
        secret: "b".repeat(32),
    });
    assert.equal(a.length, 64);
    assert.notEqual(a, b);
});

test("4.5F modules are connected to runtime handlers and infrastructure", () => {
    const files = {
        observability: fs.readFileSync(
            "backend/lambda/common/observability.js",
            "utf8",
        ),
        contact: fs.readFileSync(
            "backend/lambda/contact-stand/index.js",
            "utf8",
        ),
        events: fs.readFileSync("backend/lambda/events/index.js", "utf8"),
        stands: fs.readFileSync("backend/lambda/get-stands/index.js", "utf8"),
        search: fs.readFileSync(
            "backend/lambda/search-stands/index.js",
            "utf8",
        ),
        detail: fs.readFileSync(
            "backend/lambda/get-stand-detail/index.js",
            "utf8",
        ),
        template: fs.readFileSync("template.yaml", "utf8"),
    };
    assert.match(files.observability, /normalizeApiResponse/);
    assert.match(files.observability, /unhandledResponse/);
    assert.match(files.contact, /validateTurnstileResult/);
    assert.match(files.contact, /pseudonymizeIp/);
    assert.match(files.events, /publishCheckpoint/);
    assert.match(files.events, /publish_failed/);
    assert.match(
        files.events,
        /\["publishing", "publish_failed", "archiving", "archived"\]/,
    );
    assert.match(files.events, /REMOVE publishedAt, publishCompletedAt/);
    assert.match(files.events, /EVENT_NOT_DUPLICABLE/);
    assert.match(files.stands, /filterStandsByPublicEvent/);
    assert.match(files.search, /filterStandsByPublicEvent/);
    assert.match(files.detail, /standEventIsPublic/);
    assert.match(files.template, /LeadIpPseudonymizationMode/);
    assert.match(files.template, /BotChallengeExpectedHostname/);
    assert.match(files.template, /PUBLISH_PAGE_SIZE/);
});

test("publishing migration recognizes only explicit historical publication", () => {
    const { desiredState, hasPublishedEvidence, needsUpdate } =
        publishingMigration._test;
    const published = {
        eventId: "evt_public",
        status: "published",
        visibility: "public",
        publicStatus: "published",
        publishedAt: "2026-08-24T10:00:00.000Z",
        schemaVersion: 2,
    };
    assert.equal(hasPublishedEvidence(published), true);
    assert.deepEqual(desiredState(published), {
        publicationState: "published",
        publicStatus: "published",
    });
    assert.equal(needsUpdate(published), true);
    assert.deepEqual(
        desiredState({
            ...published,
            publishedAt: undefined,
        }),
        { publicationState: "draft", publicStatus: "draft" },
    );
});

test("sanitizer removes sensitive keys recursively", () => {
    assert.deepEqual(
        sanitizeDetails({
            apiKey: "x",
            nested: { accessToken: "y", value: 1 },
        }),
        { nested: { value: 1 } },
    );
    assert.equal(
        envelope({ statusCode: 503, requestId: "request-9" }).error.retryable,
        true,
    );
});
