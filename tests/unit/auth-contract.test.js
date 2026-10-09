"use strict";

const {
    AUTH_SCOPES,
    parseScopes,
    hasScope,
    expectedScopeForRoute,
} = require("../../backend/lambda/common/auth-scopes");
const { identity } = require("../../backend/lambda/common/tenant");

describe("application access-token scope contract", () => {
    test("parses a Cognito scope claim without duplicates", () => {
        expect(
            parseScopes("aipavilion/user  aipavilion/tenant aipavilion/user"),
        ).toEqual([AUTH_SCOPES.USER, AUTH_SCOPES.TENANT]);
        expect(hasScope("aipavilion/user", AUTH_SCOPES.USER)).toBe(true);
    });

    test.each([
        ["/user/account", AUTH_SCOPES.USER],
        ["/me/memberships", AUTH_SCOPES.USER],
        ["/invitations/inv-1/accept", AUTH_SCOPES.USER],
        ["/organizations/org-1/events", AUTH_SCOPES.TENANT],
        ["/exhibitor/stands", AUTH_SCOPES.TENANT],
        ["/admin/dashboard", AUTH_SCOPES.PLATFORM_ADMIN],
        ["/platform/organizations", AUTH_SCOPES.PLATFORM_ADMIN],
        ["/events", null],
    ])("classifies %s", (route, expected) => {
        expect(expectedScopeForRoute(route)).toBe(expected);
    });

    test("extracts access-token metadata while keeping fine-grained groups separate", () => {
        const actor = identity({
            requestContext: {
                authorizer: {
                    claims: {
                        sub: "user-1",
                        username: "alice",
                        token_use: "access",
                        client_id: "client-1",
                        scope: "aipavilion/user aipavilion/tenant",
                        "cognito:groups": "organizer,exhibitor",
                    },
                },
            },
        });
        expect(actor).toMatchObject({
            userId: "user-1",
            username: "alice",
            tokenUse: "access",
            clientId: "client-1",
            scopes: [AUTH_SCOPES.USER, AUTH_SCOPES.TENANT],
            groups: ["organizer", "exhibitor"],
        });
    });
});
