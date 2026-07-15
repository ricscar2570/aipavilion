"use strict";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

function parseJsonBody(event) {
    try {
        const value =
            typeof event.body === "string"
                ? JSON.parse(event.body || "{}")
                : event.body || {};
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return { error: "Request body must be a JSON object" };
        }
        return { value };
    } catch {
        return { error: "Invalid JSON body" };
    }
}

function unexpectedKeys(value, allowedKeys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return ["<non-object>"];
    }
    const allowed = new Set(allowedKeys);
    return Object.keys(value).filter((key) => !allowed.has(key));
}

function hasExactShape(value, allowedKeys) {
    return unexpectedKeys(value, allowedKeys).length === 0;
}

function isValidRequestId(value) {
    return REQUEST_ID_PATTERN.test(String(value || ""));
}

module.exports = {
    REQUEST_ID_PATTERN,
    parseJsonBody,
    unexpectedKeys,
    hasExactShape,
    isValidRequestId,
};
