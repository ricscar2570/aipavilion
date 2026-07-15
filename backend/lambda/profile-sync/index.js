"use strict";

const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../common/dynamo");
const { cleanText } = require("../common/domain");

const USERS_TABLE = process.env.USERS_TABLE;
const SUPPORTED_TRIGGERS = new Set([
    "PostConfirmation_ConfirmSignUp",
    "PostConfirmation_ConfirmForgotPassword",
]);

function displayName(attributes = {}) {
    const fullName = [attributes.given_name, attributes.family_name]
        .map((value) => cleanText(value, 80))
        .filter(Boolean)
        .join(" ");
    return fullName || cleanText(attributes.name || attributes.email, 160);
}

exports.handler = async (event = {}) => {
    if (!SUPPORTED_TRIGGERS.has(event.triggerSource)) {
        return event;
    }

    const attributes = event.request?.userAttributes || {};
    const userId = cleanText(attributes.sub || event.userName, 160);
    const email = cleanText(attributes.email, 320).toLowerCase();
    if (!USERS_TABLE || !userId || !email) {
        throw new Error("PROFILE_SYNC_CONFIGURATION_ERROR");
    }

    const now = new Date().toISOString();
    await docClient
        .send(
            new PutCommand({
                TableName: USERS_TABLE,
                Item: {
                    userId,
                    email,
                    displayName: displayName(attributes),
                    company: cleanText(attributes["custom:company"], 160),
                    status: "active",
                    role: "visitor",
                    createdAt: now,
                    updatedAt: now,
                    schemaVersion: 3,
                },
                ConditionExpression: "attribute_not_exists(userId)",
            }),
        )
        .catch((error) => {
            if (error?.name !== "ConditionalCheckFailedException") {
                throw error;
            }
        });

    return event;
};
