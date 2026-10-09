"use strict";
const fs = require("fs");
const path = require("path");
const { redact, percentile } = require("../../scripts/phase4.5g/lib/evidence");
const {
    envelope,
    sanitizeDetails,
} = require("../../backend/lambda/common/api-error");
const {
    pseudonymizeIp,
    validateTurnstileResult,
} = require("../../backend/lambda/common/lead-protection");
const {
    isEventPublic,
} = require("../../backend/lambda/common/publication-state");

describe("Sprint 4.5G evidence foundations", () => {
    test("redacts secrets recursively", () => {
        expect(
            redact({
                token: "secret",
                nested: { password: "secret", safe: "ok" },
            }),
        ).toEqual({
            token: "[REDACTED]",
            nested: { password: "[REDACTED]", safe: "ok" },
        });
    });
    test("computes percentiles deterministically", () => {
        expect(percentile([1, 2, 3, 100], 95)).toBe(100);
    });
    test("API error envelope omits sensitive details", () => {
        const result = envelope({
            statusCode: 400,
            requestId: "r",
            details: { token: "x", field: "name" },
        });
        expect(result.error.details).toEqual({ field: "name" });
    });
    test("HMAC IP pseudonymization is disabled by default", () => {
        expect(pseudonymizeIp("192.0.2.1")).toBeNull();
    });
    test("HMAC IP pseudonymization is deterministic but secret-bound", () => {
        const secret = "a".repeat(32);
        expect(
            pseudonymizeIp("192.0.2.1", { mode: "hmac", secret }),
        ).toHaveLength(64);
        expect(pseudonymizeIp("192.0.2.1", { mode: "hmac", secret })).not.toBe(
            pseudonymizeIp("192.0.2.1", {
                mode: "hmac",
                secret: "b".repeat(32),
            }),
        );
    });
    test("Turnstile context and freshness are fail-closed", () => {
        const now = Date.now();
        expect(
            validateTurnstileResult(
                {
                    success: true,
                    hostname: "staging.example",
                    action: "lead-submit",
                    challenge_ts: new Date(now - 1000).toISOString(),
                },
                { hostname: "staging.example", action: "lead-submit", now },
            ).valid,
        ).toBe(true);
        expect(
            validateTurnstileResult(
                {
                    success: true,
                    hostname: "evil.example",
                    action: "lead-submit",
                    challenge_ts: new Date(now).toISOString(),
                },
                { hostname: "staging.example", action: "lead-submit", now },
            ).valid,
        ).toBe(false);
    });
    test("event public barrier rejects incomplete saga states", () => {
        expect(
            isEventPublic({
                status: "published",
                visibility: "public",
                publicStatus: "published",
                publishedAt: "2026-01-01",
                publicationState: "publishing",
            }),
        ).toBe(false);
        expect(
            isEventPublic({
                status: "published",
                visibility: "public",
                publicStatus: "published",
                publishedAt: "2026-01-01",
                publicationState: "published",
            }),
        ).toBe(true);
    });
    test("all evidence executables exist", () => {
        for (const file of [
            "tenant-escape.js",
            "failure-injection.js",
            "load-profile.js",
            "stripe-proof.js",
            "ses-proof.js",
            "waf-proof.js",
            "restore-proof.js",
            "security-assessment.js",
        ]) {
            expect(fs.existsSync(path.join("scripts/phase4.5g", file))).toBe(
                true,
            );
        }
    });
    test("sanitizeDetails does not retain credential-like keys", () => {
        expect(sanitizeDetails({ apiKey: "x", value: 1 })).toEqual({
            value: 1,
        });
    });
});
