"use strict";

/**
 * Coarse Cognito scopes used at the API Gateway boundary.
 *
 * These scopes do not replace tenant membership, application roles,
 * resource ownership or entitlement checks. They only select the broad API
 * surface that an access token is allowed to invoke.
 */
const AUTH_SCOPES = Object.freeze({
    USER: "aipavilion/user",
    TENANT: "aipavilion/tenant",
    PLATFORM_ADMIN: "aipavilion/platform-admin",
});

function parseScopes(value) {
    if (Array.isArray(value)) {
        return [
            ...new Set(
                value
                    .map(String)
                    .map((item) => item.trim())
                    .filter(Boolean),
            ),
        ];
    }
    return [
        ...new Set(
            String(value || "")
                .split(/\s+/)
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    ];
}

function hasScope(value, expected) {
    return parseScopes(value).includes(expected);
}

function expectedScopeForRoute(route) {
    const value = String(route || "");
    if (value.startsWith("/admin/") || value.startsWith("/platform/")) {
        return AUTH_SCOPES.PLATFORM_ADMIN;
    }
    if (
        value.startsWith("/organizations/") ||
        value.startsWith("/exhibitor/")
    ) {
        return AUTH_SCOPES.TENANT;
    }
    if (
        value.startsWith("/user/") ||
        value.startsWith("/me/") ||
        value.startsWith("/invitations/") ||
        [
            "/checkout/create-intent",
            "/checkout/confirm-order",
            "/checkout/order/{orderId}",
        ].includes(value)
    ) {
        return AUTH_SCOPES.USER;
    }
    return null;
}

module.exports = {
    AUTH_SCOPES,
    parseScopes,
    hasScope,
    expectedScopeForRoute,
};
