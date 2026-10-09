#!/usr/bin/env node
"use strict";

const assert = require("assert/strict");
const Module = require("module");

const calls = [];
let responses = [];
const client = {
    async send(command) {
        calls.push(command);
        if (!responses.length) {
            throw new Error(`Unexpected command ${command.type || "unknown"}`);
        }
        const next = responses.shift();
        if (next instanceof Error) {
            throw next;
        }
        return next;
    },
};

function command(type) {
    return class MockCommand {
        constructor(input) {
            this.type = type;
            this.input = input;
        }
    };
}

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
    if (request === "@aws-sdk/client-dynamodb") {
        return { DynamoDBClient: class DynamoDBClient {} };
    }
    if (request === "@aws-sdk/lib-dynamodb") {
        return {
            DynamoDBDocumentClient: { from: () => client },
            GetCommand: command("Get"),
            PutCommand: command("Put"),
            QueryCommand: command("Query"),
            ScanCommand: command("Scan"),
            UpdateCommand: command("Update"),
            DeleteCommand: command("Delete"),
            TransactWriteCommand: command("TransactWrite"),
        };
    }
    if (request === "@aws-sdk/client-sesv2") {
        return {
            SESv2Client: class SESv2Client {
                async send() {
                    throw new Error(
                        "SES must not run during invitation acceptance",
                    );
                }
            },
            SendEmailCommand: command("SendEmail"),
        };
    }
    return originalLoad(request, parent, isMain);
};

Object.assign(process.env, {
    ORGANIZATIONS_TABLE: "organizations",
    EVENTS_TABLE: "events",
    MEMBERSHIPS_TABLE: "memberships",
    INVITATIONS_TABLE: "invitations",
    ENTITLEMENTS_TABLE: "entitlements",
    STANDS_TABLE: "stands",
    USERS_TABLE: "users",
    AUDIT_TABLE: "audit",
    INVITATION_EMAIL_MODE: "disabled",
    ALLOWED_ORIGIN: "http://127.0.0.1:3000",
});

const { handler } = require("../backend/lambda/invitations");

function event() {
    return {
        httpMethod: "POST",
        path: "/invitations/inv-auth-contract/accept",
        headers: { origin: "http://127.0.0.1:3000" },
        requestContext: {
            requestId: "auth-contract-request",
            authorizer: {
                claims: {
                    sub: "user-auth-contract",
                    token_use: "access",
                    client_id: "client-auth-contract",
                    scope: "aipavilion/user aipavilion/tenant",
                },
            },
        },
    };
}

function invitation() {
    return {
        invitationId: "inv-auth-contract",
        organizationId: "org-auth-contract",
        eventId: "event-auth-contract",
        email: "invited@example.com",
        status: "pending",
        expiresAt: "2099-01-01T00:00:00.000Z",
        standName: "Auth Contract Stand",
        standSlug: "auth-contract-stand",
        invitedBy: "owner-auth-contract",
    };
}

async function acceptsWithoutEmailClaim() {
    calls.length = 0;
    responses = [
        { Item: invitation() },
        {
            Item: {
                userId: "user-auth-contract",
                email: "Invited@Example.com",
                status: "active",
            },
        },
        { Item: { organizationId: "org-auth-contract", status: "active" } },
        {
            Item: {
                eventId: "event-auth-contract",
                organizationId: "org-auth-contract",
                status: "draft",
            },
        },
        {},
        {},
    ];

    const response = await handler(event());
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).accepted, true);
    assert.deepEqual(calls[1].input, {
        TableName: "users",
        Key: { userId: "user-auth-contract" },
        ConsistentRead: true,
    });
    const transaction = calls.find((item) => item.type === "TransactWrite");
    assert.ok(transaction, "Invitation acceptance did not issue a transaction");
    const invitationUpdate = transaction.input.TransactItems.find(
        (item) => item.Update?.TableName === "invitations",
    );
    assert.equal(
        invitationUpdate.Update.ExpressionAttributeValues[":email"],
        "invited@example.com",
    );
}

async function rejectsProfileMismatch() {
    calls.length = 0;
    responses = [
        { Item: invitation() },
        {
            Item: {
                userId: "user-auth-contract",
                email: "different@example.com",
                status: "active",
            },
        },
    ];

    const response = await handler(event());
    assert.equal(response.statusCode, 403);
    assert.equal(
        JSON.parse(response.body).error.code,
        "INVITATION_EMAIL_MISMATCH",
    );
    assert.equal(calls.length, 2);
}

async function main() {
    await acceptsWithoutEmailClaim();
    await rejectsProfileMismatch();
    console.log(
        "Authentication invitation-binding check passed: access-token email is not required and the server-side profile is authoritative.",
    );
}

main()
    .catch((error) => {
        console.error(
            `Authentication invitation-binding check failed: ${error.stack}`,
        );
        process.exitCode = 1;
    })
    .finally(() => {
        Module._load = originalLoad;
    });
