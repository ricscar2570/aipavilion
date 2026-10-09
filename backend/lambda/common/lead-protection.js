"use strict";

const crypto = require("crypto");

function normalize(value) {
    return String(value || "").trim();
}

function pseudonymizeIp(sourceIp, { mode = "disabled", secret } = {}) {
    const normalizedMode = normalize(mode).toLowerCase();
    if (!sourceIp || normalizedMode === "disabled") {
        return null;
    }
    if (normalizedMode !== "hmac") {
        throw new Error("Unsupported lead IP pseudonymization mode");
    }
    if (!secret || String(secret).length < 32) {
        throw new Error(
            "A lead IP HMAC secret of at least 32 characters is required",
        );
    }
    return crypto
        .createHmac("sha256", secret)
        .update(String(sourceIp))
        .digest("hex");
}

function validateTurnstileResult(
    result,
    { hostname, action, maxAgeSeconds = 300, now = Date.now() } = {},
) {
    if (!result || result.success !== true) {
        return { valid: false, reason: "challenge_failed" };
    }
    if (
        hostname &&
        normalize(result.hostname).toLowerCase() !==
            normalize(hostname).toLowerCase()
    ) {
        return { valid: false, reason: "hostname_mismatch" };
    }
    if (action && normalize(result.action) !== normalize(action)) {
        return { valid: false, reason: "action_mismatch" };
    }
    if (maxAgeSeconds > 0) {
        const challengeTime = Date.parse(result.challenge_ts || "");
        if (!Number.isFinite(challengeTime)) {
            return { valid: false, reason: "invalid_challenge_timestamp" };
        }
        if (challengeTime > now + 30000) {
            return { valid: false, reason: "challenge_timestamp_in_future" };
        }
        const age = Math.max(0, now - challengeTime) / 1000;
        if (age > maxAgeSeconds) {
            return { valid: false, reason: "challenge_expired" };
        }
    }
    return { valid: true, reason: "verified" };
}

module.exports = { pseudonymizeIp, validateTurnstileResult };
