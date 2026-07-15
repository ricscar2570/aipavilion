"use strict";

function parseLimit(value, fallback = 25, maximum = 100) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(Math.max(parsed, 1), maximum);
}

function decodeCursor(value) {
    if (!value) {
        return undefined;
    }
    try {
        return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    } catch {
        return null;
    }
}

function encodeCursor(value) {
    return value
        ? Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
        : null;
}

module.exports = { parseLimit, decodeCursor, encodeCursor };
