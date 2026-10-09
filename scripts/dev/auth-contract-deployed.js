"use strict";

const fs = require("fs");
const {
    CognitoIdentityProviderClient,
    InitiateAuthCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const { readStackOutputs } = require("./stack-outputs");

const outputs = readStackOutputs();
const region =
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-west-1";
const apiBase = outputs.ApiEndpoint.replace(/\/$/, "");
const cognito = new CognitoIdentityProviderClient({ region });

function readCredentials() {
    const filePath =
        process.env.TEST_USERS_FILE ||
        process.env.DEV_TEST_USERS_FILE ||
        ".artifacts/dev-test-users.json";
    if (!fs.existsSync(filePath)) {
        throw new Error(`Development test users not found at ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8")).users;
}

async function login(email, password) {
    const result = await cognito.send(
        new InitiateAuthCommand({
            ClientId: outputs.UserPoolClientId,
            AuthFlow: "USER_PASSWORD_AUTH",
            AuthParameters: { USERNAME: email, PASSWORD: password },
        }),
    );
    const idToken = result.AuthenticationResult?.IdToken;
    const accessToken = result.AuthenticationResult?.AccessToken;
    const refreshToken = result.AuthenticationResult?.RefreshToken;
    if (!idToken || !accessToken || !refreshToken) {
        throw new Error(`Cognito did not return complete tokens for ${email}`);
    }
    return { idToken, accessToken, refreshToken };
}

async function refresh(refreshToken) {
    const result = await cognito.send(
        new InitiateAuthCommand({
            ClientId: outputs.UserPoolClientId,
            AuthFlow: "REFRESH_TOKEN_AUTH",
            AuthParameters: { REFRESH_TOKEN: refreshToken },
        }),
    );
    const accessToken = result.AuthenticationResult?.AccessToken;
    if (!accessToken) {
        throw new Error("Cognito refresh did not return an access token");
    }
    return accessToken;
}

function decodeJwtPayload(token) {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) {
        throw new Error("Cognito returned a malformed JWT");
    }
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

function tokenScopes(payload) {
    return new Set(
        String(payload.scope || "")
            .split(/\s+/)
            .filter(Boolean),
    );
}

function assertAccessToken(token, { required = [], forbidden = [] } = {}) {
    const payload = decodeJwtPayload(token);
    if (payload.token_use !== "access") {
        throw new Error(
            `Expected an access token, received ${payload.token_use || "unknown"}`,
        );
    }
    if (payload.client_id !== outputs.UserPoolClientId) {
        throw new Error(
            "Access token belongs to an unexpected Cognito app client",
        );
    }
    const expectedIssuer = `https://cognito-idp.${region}.amazonaws.com/${outputs.UserPoolId}`;
    if (payload.iss !== expectedIssuer) {
        throw new Error(
            `Unexpected access-token issuer ${payload.iss || "missing"}`,
        );
    }
    const scopes = tokenScopes(payload);
    for (const scope of required) {
        if (!scopes.has(scope)) {
            throw new Error(`Access token is missing required scope ${scope}`);
        }
    }
    for (const scope of forbidden) {
        if (scopes.has(scope)) {
            throw new Error(
                `Access token unexpectedly contains scope ${scope}`,
            );
        }
    }
    return payload;
}

async function apiRequest(path, token) {
    const response = await fetch(`${apiBase}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    let body = null;
    if (text) {
        try {
            body = JSON.parse(text);
        } catch {
            body = text;
        }
    }
    return { status: response.status, body };
}

function expectStatus(result, expected, label) {
    const accepted = Array.isArray(expected) ? expected : [expected];
    if (!accepted.includes(result.status)) {
        throw new Error(
            `${label} returned ${result.status}; expected ${accepted.join(
                " or ",
            )}: ${JSON.stringify(result.body)}`,
        );
    }
}

function findUser(users, predicate, label) {
    const user = users.find(predicate);
    if (!user) {
        throw new Error(`Missing deployed test identity: ${label}`);
    }
    return user;
}

async function main() {
    const users = readCredentials();
    const visitor = findUser(
        users,
        (item) => item.group === "visitor",
        "visitor",
    );
    const admin = findUser(users, (item) => item.group === "admin", "admin");
    const organizer = findUser(
        users,
        (item) => item.email.startsWith("organizer.atlas."),
        "Atlas organizer",
    );

    const [visitorTokens, organizerTokens, adminTokens] = await Promise.all([
        login(visitor.email, visitor.password),
        login(organizer.email, organizer.password),
        login(admin.email, admin.password),
    ]);

    const userScope = outputs.CognitoUserScope || "aipavilion/user";
    const tenantScope = outputs.CognitoTenantScope || "aipavilion/tenant";
    const adminScope =
        outputs.CognitoPlatformAdminScope || "aipavilion/platform-admin";

    assertAccessToken(visitorTokens.accessToken, {
        required: [userScope, tenantScope],
        forbidden: [adminScope],
    });
    assertAccessToken(organizerTokens.accessToken, {
        required: [userScope, tenantScope],
        forbidden: [adminScope],
    });
    assertAccessToken(adminTokens.accessToken, {
        required: [userScope, tenantScope, adminScope],
    });

    const [refreshedOrganizerToken, refreshedAdminToken] = await Promise.all([
        refresh(organizerTokens.refreshToken),
        refresh(adminTokens.refreshToken),
    ]);
    assertAccessToken(refreshedOrganizerToken, {
        required: [userScope, tenantScope],
        forbidden: [adminScope],
    });
    assertAccessToken(refreshedAdminToken, {
        required: [userScope, tenantScope, adminScope],
    });

    if (decodeJwtPayload(organizerTokens.idToken).token_use !== "id") {
        throw new Error("Cognito ID-token contract is malformed");
    }

    expectStatus(
        await apiRequest("/me/memberships", organizerTokens.accessToken),
        200,
        "User-scope route with an organizer access token",
    );
    expectStatus(
        await apiRequest(
            "/organizations/org_atlas/events",
            organizerTokens.accessToken,
        ),
        200,
        "Tenant-scope route with an active tenant member",
    );
    expectStatus(
        await apiRequest("/admin/dashboard", adminTokens.accessToken),
        200,
        "Admin-scope route with an admin access token",
    );

    expectStatus(
        await apiRequest("/me/memberships", organizerTokens.idToken),
        [401, 403],
        "Protected route with an ID token",
    );
    expectStatus(
        await apiRequest("/admin/dashboard", organizerTokens.accessToken),
        [401, 403],
        "Admin route without the platform-admin scope",
    );
    expectStatus(
        await apiRequest(
            "/organizations/org_atlas/events",
            visitorTokens.accessToken,
        ),
        403,
        "Tenant route with a coarse scope but no active membership",
    );

    console.log(
        JSON.stringify(
            {
                status: "PASS",
                contract: "scoped-cognito-access-token-v1",
                checkedScopes: [userScope, tenantScope, adminScope],
                evidence: {
                    accessTokenAccepted: true,
                    idTokenRejected: true,
                    missingAdminScopeRejected: true,
                    backendMembershipStillEnforced: true,
                    refreshScopesPreserved: true,
                },
            },
            null,
            2,
        ),
    );
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
