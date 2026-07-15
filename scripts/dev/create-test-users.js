"use strict";

const crypto = require("crypto");
const fs = require("fs");
const {
    CognitoIdentityProviderClient,
    AdminCreateUserCommand,
    AdminGetUserCommand,
    AdminSetUserPasswordCommand,
    AdminAddUserToGroupCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    PutCommand,
    UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const { readStackOutputs } = require("./stack-outputs");

const outputs = readStackOutputs();
const region =
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-west-1";
const cognito = new CognitoIdentityProviderClient({ region });
const documentClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region }),
);

function generatedPassword() {
    return `Dev!${crypto.randomBytes(18).toString("base64url")}9aA`;
}

async function getOrCreateUser(email, name) {
    try {
        return await cognito.send(
            new AdminGetUserCommand({
                UserPoolId: outputs.UserPoolId,
                Username: email,
            }),
        );
    } catch (error) {
        if (error.name !== "UserNotFoundException") {
            throw error;
        }
    }
    await cognito.send(
        new AdminCreateUserCommand({
            UserPoolId: outputs.UserPoolId,
            Username: email,
            MessageAction: "SUPPRESS",
            UserAttributes: [
                { Name: "email", Value: email },
                { Name: "email_verified", Value: "true" },
                { Name: "given_name", Value: name },
            ],
        }),
    );
    return cognito.send(
        new AdminGetUserCommand({
            UserPoolId: outputs.UserPoolId,
            Username: email,
        }),
    );
}

function attribute(user, name) {
    return user.UserAttributes?.find((item) => item.Name === name)?.Value;
}

async function provision({ email, name, group, password }) {
    const user = await getOrCreateUser(email, name);
    await cognito.send(
        new AdminSetUserPasswordCommand({
            UserPoolId: outputs.UserPoolId,
            Username: email,
            Password: password,
            Permanent: true,
        }),
    );
    if (group) {
        await cognito.send(
            new AdminAddUserToGroupCommand({
                UserPoolId: outputs.UserPoolId,
                Username: email,
                GroupName: group,
            }),
        );
    }
    const userId = attribute(user, "sub");
    await documentClient.send(
        new PutCommand({
            TableName: outputs.UsersTableName,
            Item: {
                userId,
                email,
                displayName: name,
                role: group || "visitor",
                createdAt: new Date().toISOString(),
                environment: "dev",
                schemaVersion: 2,
            },
        }),
    );
    return { email, password, group: group || "visitor", userId };
}

async function addMembership(user, organizationId, role) {
    const now = new Date().toISOString();
    await documentClient.send(
        new PutCommand({
            TableName: outputs.MembershipsTableName,
            Item: {
                userId: user.userId,
                organizationId,
                membershipKey: `${role}#${user.userId}`,
                role,
                status: "active",
                joinedAt: now,
                updatedAt: now,
                schemaVersion: 1,
            },
        }),
    );
}

async function setOrganizationOwner(organizationId, owner) {
    await documentClient.send(
        new UpdateCommand({
            TableName: outputs.OrganizationsTableName,
            Key: { organizationId },
            UpdateExpression:
                "SET ownerUserId = :owner, ownerEmail = :email, updatedAt = :now",
            ExpressionAttributeValues: {
                ":owner": owner.userId,
                ":email": owner.email,
                ":now": new Date().toISOString(),
            },
        }),
    );
}

async function assignStands(standIds, exhibitor) {
    for (const standId of standIds) {
        await documentClient.send(
            new UpdateCommand({
                TableName: outputs.StandsTableName,
                Key: { stand_id: standId },
                UpdateExpression:
                    "SET ownerUserId = :userId, exhibitorUserId = :userId, updatedAt = :now, updated_at = :now",
                ExpressionAttributeValues: {
                    ":userId": exhibitor.userId,
                    ":now": new Date().toISOString(),
                },
            }),
        );
    }
}

async function main() {
    const sharedPassword = process.env.DEV_TEST_PASSWORD || generatedPassword();
    const users = [];
    const visitor = await provision({
        email: process.env.DEV_VISITOR_EMAIL || "visitor.dev@example.com",
        name: "Dev Visitor",
        password: sharedPassword,
    });
    const admin = await provision({
        email: process.env.DEV_ADMIN_EMAIL || "admin.dev@example.com",
        name: "Dev Admin",
        group: "admin",
        password: sharedPassword,
    });
    const atlasOrganizer = await provision({
        email: "organizer.atlas.dev@example.com",
        name: "Atlas Organizer",
        group: "organizer",
        password: sharedPassword,
    });
    const atlasExhibitor = await provision({
        email: "exhibitor.atlas.dev@example.com",
        name: "Atlas Exhibitor",
        group: "exhibitor",
        password: sharedPassword,
    });
    const rivalOrganizer = await provision({
        email: "organizer.rival.dev@example.com",
        name: "Rival Organizer",
        group: "organizer",
        password: sharedPassword,
    });
    const rivalExhibitor = await provision({
        email: "exhibitor.rival.dev@example.com",
        name: "Rival Exhibitor",
        group: "exhibitor",
        password: sharedPassword,
    });
    users.push(
        visitor,
        admin,
        atlasOrganizer,
        atlasExhibitor,
        rivalOrganizer,
        rivalExhibitor,
    );

    await Promise.all([
        addMembership(atlasOrganizer, "org_atlas", "owner"),
        addMembership(atlasExhibitor, "org_atlas", "exhibitor"),
        addMembership(rivalOrganizer, "org_rival", "owner"),
        addMembership(rivalExhibitor, "org_rival", "exhibitor"),
        setOrganizationOwner("org_atlas", atlasOrganizer),
        setOrganizationOwner("org_rival", rivalOrganizer),
    ]);
    await assignStands(
        [
            "stand_boardgames_atlas",
            "stand_indie_foundry",
            "stand_rpg_workshop",
            "stand_unpublished_preview",
        ],
        atlasExhibitor,
    );
    await assignStands(["stand_rival_showcase"], rivalExhibitor);

    fs.mkdirSync(".artifacts", { recursive: true });
    fs.writeFileSync(
        ".artifacts/dev-test-users.json",
        `${JSON.stringify({ users }, null, 2)}\n`,
        { mode: 0o600 },
    );
    console.log(
        "Created disposable visitor, admin, organizer and exhibitor users for two isolated tenants.",
    );
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
