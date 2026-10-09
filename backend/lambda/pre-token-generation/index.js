"use strict";

const { AUTH_SCOPES, parseScopes } = require("../common/auth-scopes");

const SUPPORTED_TRIGGER_SOURCES = new Set([
    "TokenGeneration_HostedAuth",
    "TokenGeneration_Authentication",
    "TokenGeneration_NewPasswordChallenge",
    "TokenGeneration_AuthenticateDevice",
    "TokenGeneration_RefreshTokens",
]);

function groupsFrom(event = {}) {
    const groups = event.request?.groupConfiguration?.groupsToOverride || [];
    return Array.isArray(groups)
        ? groups.map(String)
        : String(groups || "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
}

function scopesFor(event = {}) {
    const scopes = [AUTH_SCOPES.USER, AUTH_SCOPES.TENANT];
    if (groupsFrom(event).includes("admin")) {
        scopes.push(AUTH_SCOPES.PLATFORM_ADMIN);
    }
    return scopes;
}

exports.handler = async (event = {}) => {
    if (!SUPPORTED_TRIGGER_SOURCES.has(event.triggerSource)) {
        return event;
    }
    if (!["2", "3"].includes(String(event.version || ""))) {
        throw new Error("PRE_TOKEN_TRIGGER_REQUIRES_V2_OR_V3");
    }

    const current =
        event.response?.claimsAndScopeOverrideDetails?.accessTokenGeneration ||
        {};
    const scopesToAdd = [
        ...new Set([...parseScopes(current.scopesToAdd), ...scopesFor(event)]),
    ];

    event.response = {
        ...(event.response || {}),
        claimsAndScopeOverrideDetails: {
            ...(event.response?.claimsAndScopeOverrideDetails || {}),
            accessTokenGeneration: {
                ...current,
                scopesToAdd,
            },
        },
    };
    return event;
};

exports.groupsFrom = groupsFrom;
exports.scopesFor = scopesFor;
