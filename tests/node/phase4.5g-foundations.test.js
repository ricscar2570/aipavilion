"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { redact, percentile } = require("../../scripts/phase4.5g/lib/evidence");
const { envelope } = require("../../backend/lambda/common/api-error");
const {
    pseudonymizeIp,
    validateTurnstileResult,
} = require("../../backend/lambda/common/lead-protection");
const {
    isEventPublic,
} = require("../../backend/lambda/common/publication-state");
test("evidence redaction", () =>
    assert.deepEqual(redact({ token: "x", safe: true }), {
        token: "[REDACTED]",
        safe: true,
    }));
test("percentile", () => assert.equal(percentile([1, 2, 3, 100], 95), 100));
test("error envelope", () =>
    assert.equal(
        envelope({ statusCode: 500, message: "leak", requestId: "r" }).error
            .message,
        "The service could not complete the request.",
    ));
test("IP privacy default and HMAC", () => {
    assert.equal(pseudonymizeIp("192.0.2.1"), null);
    assert.equal(
        pseudonymizeIp("192.0.2.1", { mode: "hmac", secret: "a".repeat(32) })
            .length,
        64,
    );
});
test("Turnstile fail closed", () =>
    assert.equal(
        validateTurnstileResult(
            {
                success: true,
                hostname: "bad",
                action: "lead-submit",
                challenge_ts: new Date().toISOString(),
            },
            { hostname: "good", action: "lead-submit" },
        ).valid,
        false,
    ));
test("publication barrier", () =>
    assert.equal(
        isEventPublic({
            status: "published",
            visibility: "public",
            publicStatus: "published",
            publishedAt: "x",
            publicationState: "publishing",
        }),
        false,
    ));
