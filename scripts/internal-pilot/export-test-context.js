#!/usr/bin/env node
"use strict";

const fs = require("fs");
const {
    CognitoIdentityProviderClient,
    InitiateAuthCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const { readStackOutputs } = require("../dev/stack-outputs");

const outputs = readStackOutputs();
const region = process.env.AWS_REGION || "eu-west-1";
const usersFile =
    process.env.TEST_USERS_FILE ||
    process.env.DEV_TEST_USERS_FILE ||
    ".artifacts/staging-test-users.json";
const githubEnv = process.env.GITHUB_ENV || "";
const client = new CognitoIdentityProviderClient({ region });

function users() {
    if (!fs.existsSync(usersFile)) {
        throw new Error(`Pilot test identities not found at ${usersFile}`);
    }
    return JSON.parse(fs.readFileSync(usersFile, "utf8")).users || [];
}

function findUser(items, predicate, label) {
    const item = items.find(predicate);
    if (!item) {
        throw new Error(`Missing pilot test identity: ${label}`);
    }
    return item;
}

async function login(user) {
    const result = await client.send(
        new InitiateAuthCommand({
            ClientId: outputs.UserPoolClientId,
            AuthFlow: "USER_PASSWORD_AUTH",
            AuthParameters: {
                USERNAME: user.email,
                PASSWORD: user.password,
            },
        }),
    );
    const token = result.AuthenticationResult?.AccessToken;
    if (!token) {
        throw new Error(`Cognito returned no access token for ${user.email}`);
    }
    return token;
}

function appendEnvironment(values) {
    if (!githubEnv) {
        return;
    }
    for (const value of Object.values(values)) {
        process.stdout.write(`::add-mask::${value}\n`);
    }
    fs.appendFileSync(
        githubEnv,
        `${Object.entries(values)
            .map(([key, value]) => `${key}=${value}`)
            .join("\n")}\n`,
        { mode: 0o600 },
    );
}

async function main() {
    const items = users();
    const owner = findUser(
        items,
        (item) => item.email.startsWith("organizer.atlas."),
        "Atlas organizer",
    );
    const exhibitor = findUser(
        items,
        (item) => item.email.startsWith("exhibitor.atlas."),
        "Atlas exhibitor",
    );
    const visitor = findUser(
        items,
        (item) => item.group === "visitor",
        "visitor",
    );
    const [ownerToken, exhibitorToken, userToken] = await Promise.all([
        login(owner),
        login(exhibitor),
        login(visitor),
    ]);
    appendEnvironment({
        ACCESS_TOKEN: ownerToken,
        TENANT_ACCESS_TOKEN: ownerToken,
        TENANT_A_OWNER_TOKEN: ownerToken,
        TENANT_A_EXHIBITOR_TOKEN: exhibitorToken,
        USER_A_TOKEN: userToken,
    });
    process.stdout.write(
        `${JSON.stringify(
            {
                status: "PASS",
                usersFile,
                tokenContexts: [
                    "tenant-owner",
                    "tenant-exhibitor",
                    "visitor",
                ],
            },
            null,
            2,
        )}\n`,
    );
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
