#!/usr/bin/env node
"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const ROOT = path.resolve(__dirname, "../..");
const { runChecks } = require("../check-legacy-writers");
const {
    createDraftStand,
    deriveStandPublication,
    assertCanonicalStand,
} = require("../../backend/lambda/common/stand-domain");
const {
    assertSyntheticWriteAllowed,
    looksProductionLike,
} = require("../dev/write-guard");

function loadJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function withEnvironment(values, action) {
    const original = { ...process.env };
    try {
        for (const key of [
            "ALLOW_SYNTHETIC_FIXTURES",
            "ENVIRONMENT",
            "TEST_USER_ENVIRONMENT",
            "STAGE",
            "STACK_NAME",
            "STACK_OUTPUTS_FILE",
        ]) {
            delete process.env[key];
        }
        Object.assign(process.env, values);
        return action();
    } finally {
        process.env = original;
    }
}

function verifyWriterBoundary() {
    const result = runChecks();
    assert.equal(result.ok, true, result.errors.join("\n"));
    assert.ok(result.discovered.includes("backend/lambda/events/index.js"));
    assert.ok(
        result.discovered.includes("backend/lambda/invitations/index.js"),
    );
    assert.ok(result.discovered.includes("scripts/dev/seed-dev.js"));
    assert.ok(
        result.readOnlySurfaces.some(
            (surface) => surface.path === "backend/lambda/admin/index.js",
        ),
    );
    return result.discovered.length;
}

function verifyCanonicalStandDomain() {
    const now = "2026-08-24T10:00:00.000Z";
    const draft = createDraftStand({
        standId: "stand-self-test",
        organizationId: "org-self-test",
        eventId: "event-self-test",
        ownerUserId: "user-self-test",
        name: "Canonical Stand",
        now,
    });
    assertCanonicalStand(draft);
    assert.equal(draft.schemaVersion, 4);
    assert.equal(draft.revision, 1);
    assert.equal(draft.publicStatus, "draft");
    assert.deepEqual(draft.publicContact, {
        showEmail: false,
        showPhone: false,
        showWebsite: false,
    });

    const publication = deriveStandPublication({
        status: "published",
        moderationStatus: "approved",
        visibility: "public",
        eventStatus: "published",
        eventPublicStatus: "published",
        now,
    });
    assert.deepEqual(publication, {
        publicStatus: "published",
        publicationKey: `published#${now}`,
    });

    for (const stand of loadJson("data/dev-fixtures.json").stands) {
        assertCanonicalStand(stand);
        assert.equal(Object.hasOwn(stand, "ar_enabled"), false);
        assert.equal(Object.hasOwn(stand, "tour_enabled"), false);
    }
    for (const stand of loadJson("data/sample-data.json").stands) {
        assertCanonicalStand(stand);
        assert.equal(Object.hasOwn(stand, "ar_enabled"), false);
        assert.equal(Object.hasOwn(stand, "tour_enabled"), false);
    }
}

function verifySyntheticWriteGuard() {
    assert.equal(looksProductionLike("production"), true);
    assert.equal(looksProductionLike("ai-pavilion-prod"), true);
    assert.equal(looksProductionLike("staging"), false);

    assert.throws(
        () => withEnvironment({}, () => assertSyntheticWriteAllowed("seed")),
        /ALLOW_SYNTHETIC_FIXTURES=true/,
    );
    assert.throws(
        () =>
            withEnvironment(
                {
                    ALLOW_SYNTHETIC_FIXTURES: "true",
                    ENVIRONMENT: "production",
                },
                () => assertSyntheticWriteAllowed("seed"),
            ),
        /forbidden for production-like/,
    );
    const allowed = withEnvironment(
        {
            ALLOW_SYNTHETIC_FIXTURES: "true",
            ENVIRONMENT: "staging",
            STACK_NAME: "ai-pavilion-staging",
            STACK_OUTPUTS_FILE: ".artifacts/staging-outputs.json",
        },
        () => assertSyntheticWriteAllowed("seed"),
    );
    assert.equal(allowed.environment, "staging");
}

async function verifyAdminRuntimeReadOnly() {
    const originalLoad = Module._load;
    const command = (type) =>
        class MockCommand {
            constructor(input) {
                this.type = type;
                this.input = input;
            }
        };
    Module._load = function load(request, parent, isMain) {
        if (request === "@aws-sdk/client-dynamodb") {
            return { DynamoDBClient: class DynamoDBClient {} };
        }
        if (request === "@aws-sdk/lib-dynamodb") {
            return {
                DynamoDBDocumentClient: {
                    from: () => ({
                        async send() {
                            throw new Error(
                                "A read-only rejection must not access DynamoDB",
                            );
                        },
                    }),
                },
                GetCommand: command("Get"),
                ScanCommand: command("Scan"),
            };
        }
        if (request === "@aws-sdk/client-cognito-identity-provider") {
            return {
                CognitoIdentityProviderClient: class CognitoIdentityProviderClient {},
                ListUsersCommand: command("ListUsers"),
            };
        }
        if (request === "aws-jwt-verify") {
            return {
                CognitoJwtVerifier: {
                    create: () => ({
                        verify: async () => ({
                            sub: "admin-self-test",
                            "cognito:groups": ["admin"],
                        }),
                    }),
                },
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const adminPath = require.resolve("../../backend/lambda/admin");
    delete require.cache[adminPath];
    try {
        const { handler } = require(adminPath);
        const response = await handler({
            httpMethod: "POST",
            path: "/admin/stands",
            headers: { Authorization: "Bearer self-test" },
            requestContext: { requestId: "legacy-admin-self-test" },
        });
        assert.equal(response.statusCode, 405);
        assert.equal(response.headers.Allow, "GET, OPTIONS");
        const body = JSON.parse(response.body);
        assert.equal(body.error.code, "ADMIN_STAND_MUTATIONS_DISABLED");
        assert.match(body.error.message, /mutations are disabled/);
    } finally {
        delete require.cache[adminPath];
        Module._load = originalLoad;
    }
}

async function main() {
    const writerCount = verifyWriterBoundary();
    verifyCanonicalStandDomain();
    verifySyntheticWriteGuard();
    await verifyAdminRuntimeReadOnly();
    console.log(
        `LEGACY-01 dependency-free self-test: PASS (${writerCount} mutation-capable files inventoried; admin mutation rejected at runtime).`,
    );
}

main().catch((error) => {
    console.error(`LEGACY-01 dependency-free self-test: FAIL\n${error.stack}`);
    process.exitCode = 1;
});
