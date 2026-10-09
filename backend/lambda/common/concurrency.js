"use strict";

const LEGACY_REVISION = 1;
const MAX_REVISION = Number.MAX_SAFE_INTEGER;

function headerValue(event = {}, name) {
    const headers = event.headers || {};
    const wanted = String(name || "").toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (String(key).toLowerCase() === wanted) {
            return value;
        }
    }
    return undefined;
}

function normalizeRevision(value, fallback = LEGACY_REVISION) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_REVISION) {
        return fallback;
    }
    return parsed;
}

function revisionOf(item) {
    return normalizeRevision(item?.revision, LEGACY_REVISION);
}

function parseIfMatch(rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
        return { ok: false, missing: true, code: "PRECONDITION_REQUIRED" };
    }
    const value = String(rawValue).trim();
    const match = value.match(/^"([1-9][0-9]*)"$/);
    if (!match) {
        return { ok: false, missing: false, code: "INVALID_IF_MATCH" };
    }
    const revision = Number.parseInt(match[1], 10);
    if (!Number.isSafeInteger(revision) || revision > MAX_REVISION) {
        return { ok: false, missing: false, code: "INVALID_IF_MATCH" };
    }
    return { ok: true, revision };
}

function expectedRevision(event) {
    return parseIfMatch(headerValue(event, "if-match"));
}

function etagForRevision(revision) {
    return `"${normalizeRevision(revision)}"`;
}

function revisionHeaders(itemOrRevision) {
    const revision =
        typeof itemOrRevision === "object"
            ? revisionOf(itemOrRevision)
            : normalizeRevision(itemOrRevision);
    return { ETag: etagForRevision(revision) };
}

function revisionCondition({
    expected,
    revisionName = "#revision",
    expectedValue = ":expectedRevision",
    legacyValue = ":legacyRevision",
} = {}) {
    if (!Number.isSafeInteger(expected) || expected < 1) {
        throw new TypeError("A positive expected revision is required");
    }
    return {
        expression: `((${revisionName} = ${expectedValue}) OR (attribute_not_exists(${revisionName}) AND ${expectedValue} = ${legacyValue}))`,
        names: { [revisionName]: "revision" },
        values: {
            [expectedValue]: expected,
            [legacyValue]: LEGACY_REVISION,
        },
    };
}

function nextRevision(current) {
    const revision = normalizeRevision(current);
    if (revision >= MAX_REVISION) {
        throw new RangeError("Revision exhausted");
    }
    return revision + 1;
}

function isConditionalConflict(error) {
    if (!error) {
        return false;
    }
    if (error.name === "ConditionalCheckFailedException") {
        return true;
    }
    if (error.name !== "TransactionCanceledException") {
        return false;
    }
    const reasons = Array.isArray(error.CancellationReasons)
        ? error.CancellationReasons
        : [];
    return (
        reasons.length === 0 ||
        reasons.some((reason) => reason?.Code === "ConditionalCheckFailed")
    );
}

module.exports = {
    LEGACY_REVISION,
    headerValue,
    normalizeRevision,
    revisionOf,
    parseIfMatch,
    expectedRevision,
    etagForRevision,
    revisionHeaders,
    revisionCondition,
    nextRevision,
    isConditionalConflict,
};
