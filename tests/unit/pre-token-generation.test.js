"use strict";

const {
    handler,
    scopesFor,
} = require("../../backend/lambda/pre-token-generation");
const { AUTH_SCOPES } = require("../../backend/lambda/common/auth-scopes");

function tokenEvent(overrides = {}) {
    return {
        version: "2",
        triggerSource: "TokenGeneration_Authentication",
        request: {
            scopes: ["aws.cognito.signin.user.admin"],
            groupConfiguration: { groupsToOverride: [] },
        },
        response: {},
        ...overrides,
    };
}

describe("Cognito pre-token access-scope contract", () => {
    test("adds user and tenant scopes to every authenticated user", async () => {
        const event = tokenEvent();
        await expect(handler(event)).resolves.toBe(event);
        expect(
            event.response.claimsAndScopeOverrideDetails.accessTokenGeneration
                .scopesToAdd,
        ).toEqual([AUTH_SCOPES.USER, AUTH_SCOPES.TENANT]);
    });

    test("adds the platform-admin scope only for the admin Cognito group", async () => {
        const event = tokenEvent({
            request: {
                scopes: ["aws.cognito.signin.user.admin"],
                groupConfiguration: { groupsToOverride: ["admin"] },
            },
        });
        await handler(event);
        expect(scopesFor(event)).toEqual([
            AUTH_SCOPES.USER,
            AUTH_SCOPES.TENANT,
            AUTH_SCOPES.PLATFORM_ADMIN,
        ]);
        expect(
            event.response.claimsAndScopeOverrideDetails.accessTokenGeneration
                .scopesToAdd,
        ).toContain(AUTH_SCOPES.PLATFORM_ADMIN);
    });

    test("preserves existing scope overrides and removes duplicates", async () => {
        const event = tokenEvent({
            response: {
                claimsAndScopeOverrideDetails: {
                    accessTokenGeneration: {
                        scopesToAdd: ["custom/existing", AUTH_SCOPES.USER],
                        claimsToAddOrOverride: { release: "0.8.6" },
                    },
                },
            },
        });
        await handler(event);
        const generation =
            event.response.claimsAndScopeOverrideDetails.accessTokenGeneration;
        expect(generation.scopesToAdd).toEqual([
            "custom/existing",
            AUTH_SCOPES.USER,
            AUTH_SCOPES.TENANT,
        ]);
        expect(generation.claimsToAddOrOverride).toEqual({ release: "0.8.6" });
    });

    test("applies the contract to refreshed tokens", async () => {
        const event = tokenEvent({
            triggerSource: "TokenGeneration_RefreshTokens",
            request: {
                groupConfiguration: { groupsToOverride: ["admin"] },
            },
        });
        await handler(event);
        expect(
            event.response.claimsAndScopeOverrideDetails.accessTokenGeneration
                .scopesToAdd,
        ).toEqual([
            AUTH_SCOPES.USER,
            AUTH_SCOPES.TENANT,
            AUTH_SCOPES.PLATFORM_ADMIN,
        ]);
    });

    test("fails closed when Cognito invokes the trigger with a V1 event", async () => {
        await expect(handler(tokenEvent({ version: "1" }))).rejects.toThrow(
            "PRE_TOKEN_TRIGGER_REQUIRES_V2_OR_V3",
        );
    });

    test("ignores unrelated Lambda trigger events", async () => {
        const event = tokenEvent({
            triggerSource: "PostConfirmation_ConfirmSignUp",
        });
        await expect(handler(event)).resolves.toBe(event);
        expect(event.response).toEqual({});
    });
});
