#!/usr/bin/env node
"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const {
    AUTH_SCOPES,
    expectedScopeForRoute,
} = require("../backend/lambda/common/auth-scopes");
const {
    handler: preTokenHandler,
} = require("../backend/lambda/pre-token-generation");

const root = path.resolve(__dirname, "..");
const template = fs.readFileSync(path.join(root, "template.yaml"), "utf8");
const pilotTemplate = fs.readFileSync(
    path.join(root, "infrastructure/backend-pilot.yaml"),
    "utf8",
);
const lines = template.split(/\r?\n/);
const openapi = JSON.parse(
    fs.readFileSync(path.join(root, "docs/api/openapi.json"), "utf8"),
);
const invitationSource = fs.readFileSync(
    path.join(root, "backend/lambda/invitations/index.js"),
    "utf8",
);
const tenantSource = fs.readFileSync(
    path.join(root, "backend/lambda/common/tenant.js"),
    "utf8",
);
const errors = [];

function requireText(source, needle, label = needle) {
    if (!source.includes(needle)) {
        errors.push(`Missing authentication contract: ${label}`);
    }
}

function resourceBlock(source, logicalId) {
    const match = source.match(
        new RegExp(
            `^  ${logicalId}:\\n([\\s\\S]*?)(?=^  [A-Za-z0-9]+:|^Outputs:)`,
            "m",
        ),
    );
    return match?.[0] || "";
}

for (const [needle, label] of [
    ["UserPoolTier: ESSENTIALS", "Cognito Essentials feature plan"],
    ["Type: AWS::Cognito::UserPoolResourceServer", "Cognito resource server"],
    ["PreTokenGenerationConfig:", "pre-token generation configuration"],
    ["LambdaVersion: V2_0", "V2 access-token customization"],
    ["EntryPoints: [pre-token-generation/index.js]", "pre-token Lambda bundle"],
    [
        "SourceAccount: !Ref AWS::AccountId",
        "Cognito trigger source-account restriction",
    ],
    ["ScopeName: user", AUTH_SCOPES.USER],
    ["ScopeName: tenant", AUTH_SCOPES.TENANT],
    ["ScopeName: platform-admin", AUTH_SCOPES.PLATFORM_ADMIN],
    ["USERS_TABLE: !Ref UsersTable", "server-side identity profile table"],
    ["CognitoUserScope:", "user-scope stack output"],
    ["CognitoTenantScope:", "tenant-scope stack output"],
    ["CognitoPlatformAdminScope:", "admin-scope stack output"],
]) {
    requireText(template, needle, label);
}

for (const logicalId of [
    "UserPool",
    "ApiResourceServer",
    "UserPoolClient",
    "AdminGroup",
    "OrganizerGroup",
    "ExhibitorGroup",
    "PreTokenGenerationFunction",
    "PreTokenGenerationPermission",
    "ProfileSyncFunction",
    "ProfileSyncPermission",
]) {
    const block = resourceBlock(pilotTemplate, logicalId);
    requireText(block, `  ${logicalId}:`, `${logicalId} in the pilot template`);
    requireText(
        block,
        "DeletionPolicy: Retain",
        `${logicalId} retained with the persistent Cognito plane`,
    );
    requireText(
        block,
        "UpdateReplacePolicy: Retain",
        `${logicalId} retained on replacement in the persistent Cognito plane`,
    );
}

requireText(
    invitationSource,
    "const actorProfile = await loadActorProfile(actor);",
    "server-side invitation identity binding",
);
if (
    /!actor\.email|invitation\.email\s*!==\s*actor\.email/.test(
        invitationSource,
    )
) {
    errors.push(
        "Invitation acceptance still depends on an email claim from the access token.",
    );
}

const templateScopes = new Map();
for (let index = 0; index < lines.length; index += 1) {
    const pathMatch = lines[index].match(/^\s+Path:\s+(\S+)\s*$/);
    if (!pathMatch) {
        continue;
    }
    const route = pathMatch[1];
    const nearby = lines.slice(index, index + 18).join("\n");
    const method =
        nearby.match(/^\s+Method:\s+(\S+)\s*$/m)?.[1]?.toUpperCase() || null;
    if (!method) {
        errors.push(`Route ${route} has no method near its SAM event.`);
        continue;
    }
    const expected = expectedScopeForRoute(route);
    const actual = nearby.match(/AuthorizationScopes:\s*\n\s+-\s+(\S+)/m)?.[1];
    const key = `${method} ${route}`;
    if (expected) {
        if (!nearby.includes("Authorizer: CognitoAuthorizer")) {
            errors.push(`${key} lacks the Cognito authorizer.`);
        }
        if (actual !== expected) {
            errors.push(
                `${key} requires ${expected}, found ${actual || "no scope"}.`,
            );
        }
        templateScopes.set(key, expected);
    } else if (actual) {
        errors.push(`Public route ${key} unexpectedly declares ${actual}.`);
    }
}

const operations = new Set(["get", "post", "put", "patch", "delete", "head"]);
for (const [route, pathItem] of Object.entries(openapi.paths || {})) {
    const expected = expectedScopeForRoute(route);
    for (const [method, operation] of Object.entries(pathItem)) {
        if (
            !operations.has(method) ||
            !operation ||
            typeof operation !== "object"
        ) {
            continue;
        }
        const actual = operation["x-cognito-authorization-scope"] || null;
        if (expected) {
            if (actual !== expected) {
                errors.push(
                    `OpenAPI ${method.toUpperCase()} ${route} requires ${expected}, found ${actual || "no scope"}.`,
                );
            }
            const security = operation.security || [];
            if (
                !security.some((item) =>
                    Object.prototype.hasOwnProperty.call(
                        item,
                        "CognitoAccessToken",
                    ),
                )
            ) {
                errors.push(
                    `OpenAPI ${method.toUpperCase()} ${route} lacks CognitoAccessToken security.`,
                );
            }
        } else if (actual) {
            errors.push(
                `Public OpenAPI operation ${method.toUpperCase()} ${route} declares ${actual}.`,
            );
        }
    }
}

const scheme = openapi.components?.securitySchemes?.CognitoAccessToken;
if (scheme?.["x-token-use"] !== "access") {
    errors.push(
        "OpenAPI CognitoAccessToken does not declare x-token-use=access.",
    );
}
const documentedScopes = scheme?.["x-cognito-scopes"] || {};
for (const scope of Object.values(AUTH_SCOPES)) {
    if (!documentedScopes[scope]) {
        errors.push(`OpenAPI does not document scope ${scope}.`);
    }
}

function tokenEvent({ groups = [], version = "2", triggerSource } = {}) {
    return {
        version,
        triggerSource: triggerSource || "TokenGeneration_Authentication",
        request: {
            groupConfiguration: { groupsToOverride: groups },
        },
        response: {},
    };
}

async function verifyExecutableContract() {
    const userEvent = tokenEvent();
    await preTokenHandler(userEvent);
    assert.deepEqual(
        userEvent.response.claimsAndScopeOverrideDetails.accessTokenGeneration
            .scopesToAdd,
        [AUTH_SCOPES.USER, AUTH_SCOPES.TENANT],
    );

    const adminEvent = tokenEvent({ groups: ["admin"] });
    await preTokenHandler(adminEvent);
    assert.deepEqual(
        adminEvent.response.claimsAndScopeOverrideDetails.accessTokenGeneration
            .scopesToAdd,
        [AUTH_SCOPES.USER, AUTH_SCOPES.TENANT, AUTH_SCOPES.PLATFORM_ADMIN],
    );

    const refreshEvent = tokenEvent({
        groups: ["admin"],
        triggerSource: "TokenGeneration_RefreshTokens",
    });
    await preTokenHandler(refreshEvent);
    assert.deepEqual(
        refreshEvent.response.claimsAndScopeOverrideDetails
            .accessTokenGeneration.scopesToAdd,
        [AUTH_SCOPES.USER, AUTH_SCOPES.TENANT, AUTH_SCOPES.PLATFORM_ADMIN],
    );

    await assert.rejects(
        () => preTokenHandler(tokenEvent({ version: "1" })),
        /PRE_TOKEN_TRIGGER_REQUIRES_V2_OR_V3/,
    );

    requireText(
        tenantSource,
        "scopes: parseScopes(value.scope)",
        "access-token scope extraction in tenant identity",
    );
    requireText(
        tenantSource,
        "Authorization and invitation binding must not depend on an email",
        "identity/email separation contract",
    );
}

async function main() {
    try {
        await verifyExecutableContract();
    } catch (error) {
        errors.push(
            `Executable authentication contract failed: ${error.message}`,
        );
    }

    if (errors.length) {
        console.error("Authentication contract check failed:\n");
        for (const error of errors) {
            console.error(`- ${error}`);
        }
        process.exit(1);
    }

    console.log(
        `Authentication contract check passed: ${templateScopes.size} protected SAM events use scoped Cognito access tokens, and executable scope/profile invariants hold.`,
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
