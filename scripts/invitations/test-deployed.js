#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const {
    CognitoIdentityProviderClient,
    InitiateAuthCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const { readStackOutputs } = require("../dev/stack-outputs");

const outputs = readStackOutputs();
const region = process.env.AWS_REGION || "eu-west-1";
const base = String(process.env.API_URL || outputs.ApiEndpoint || "").replace(
    /\/$/,
    "",
);
const organizationId = process.env.ORGANIZATION_ID || "org_atlas";
const eventId = process.env.EVENT_ID || "evt_atlas_2026";
const cognito = new CognitoIdentityProviderClient({ region });
let accessToken = process.env.ACCESS_TOKEN || "";

function readOrganizer() {
    const filePath =
        process.env.TEST_USERS_FILE ||
        process.env.DEV_TEST_USERS_FILE ||
        ".artifacts/staging-test-users.json";
    if (!fs.existsSync(filePath)) {
        throw new Error(
            `Pilot test users not found at ${filePath}; prepare staging fixtures first`,
        );
    }
    const users = JSON.parse(fs.readFileSync(filePath, "utf8")).users || [];
    const organizer = users.find((item) =>
        item.email.startsWith("organizer.atlas."),
    );
    if (!organizer) {
        throw new Error("Atlas organizer test identity is missing");
    }
    return organizer;
}

async function resolveAccessToken() {
    if (accessToken) {
        return accessToken;
    }
    const organizer = readOrganizer();
    const result = await cognito.send(
        new InitiateAuthCommand({
            ClientId: outputs.UserPoolClientId,
            AuthFlow: "USER_PASSWORD_AUTH",
            AuthParameters: {
                USERNAME: organizer.email,
                PASSWORD: organizer.password,
            },
        }),
    );
    accessToken = result.AuthenticationResult?.AccessToken || "";
    if (!accessToken) {
        throw new Error("Cognito returned no organizer access token");
    }
    return accessToken;
}

async function request(path, options = {}) {
    const token = await resolveAccessToken();
    const response = await fetch(`${base}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });
    const text = await response.text();
    let body;
    try {
        body = JSON.parse(text);
    } catch {
        body = text;
    }
    return { status: response.status, body, headers: response.headers };
}

async function main() {
    const email =
        process.env.INVITE_TEST_EMAIL || `invite-${Date.now()}@example.invalid`;
    const key = crypto.randomUUID();
    const path = `/organizations/${organizationId}/events/${eventId}/invitations`;
    const first = await request(path, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ email, role: "exhibitor" }),
    });
    assert.ok([200, 201, 202].includes(first.status), JSON.stringify(first));
    const second = await request(path, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ email, role: "exhibitor" }),
    });
    assert.ok([200, 201, 202].includes(second.status), JSON.stringify(second));
    const firstId =
        first.body.invitationId ||
        first.body.invitation?.invitationId ||
        first.body.id;
    const secondId =
        second.body.invitationId ||
        second.body.invitation?.invitationId ||
        second.body.id;
    assert.ok(firstId, "The first request returned no invitationId");
    assert.strictEqual(
        secondId,
        firstId,
        "The idempotent replay created another invitation",
    );
    console.log(
        JSON.stringify(
            { result: "PASS", invitationId: firstId, idempotencyKey: key },
            null,
            2,
        ),
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
