"use strict";

const { withObservability } = require("../common/observability");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
} = require("@aws-sdk/lib-dynamodb");
const { respond, preflight } = require("../common/cors");
const { isPublicStand } = require("../common/catalog");
const { createHash } = require("crypto");
const {
    parseJsonBody,
    hasExactShape,
    isValidRequestId,
} = require("../common/validation");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_INTERACTIONS =
    process.env.TABLE_INTERACTIONS || "ai-pavilion-interactions";
const STANDS_TABLE = process.env.STANDS_TABLE || "ai-pavilion-stands";
const ALLOWED_INTERACTION_TYPES = new Set([
    "view",
    "click",
    "add_to_cart",
    "like",
    "share",
    "download",
    "contact",
]);

function getUserId(event) {
    return event.requestContext?.authorizer?.claims?.sub || null;
}

function getHeader(event, name) {
    return Object.entries(event.headers || {}).find(
        ([key]) => key.toLowerCase() === name.toLowerCase(),
    )?.[1];
}

function interactionIdFor(standId, interactionType, clientRequestId) {
    return `int_${createHash("sha256")
        .update(`${standId}:${interactionType}:${clientRequestId}`)
        .digest("hex")
        .slice(0, 32)}`;
}

function anonymousId(sessionId) {
    if (!sessionId) {
        return null;
    }
    return createHash("sha256")
        .update(String(sessionId))
        .digest("hex")
        .slice(0, 24);
}

const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return preflight(event);
    }

    const parsed = parseJsonBody(event);
    if (parsed.error) {
        return respond(
            400,
            { error: "VALIDATION_ERROR", message: parsed.error },
            event,
        );
    }
    const body = parsed.value;
    if (
        !hasExactShape(body, [
            "standId",
            "interactionType",
            "clientRequestId",
            "sessionId",
        ])
    ) {
        return respond(
            400,
            {
                error: "VALIDATION_ERROR",
                message: "Unexpected interaction fields",
            },
            event,
        );
    }

    const standId = String(body.standId || "")
        .trim()
        .slice(0, 120);
    const interactionType = String(body.interactionType || "").trim();
    const headerRequestId = getHeader(event, "X-Interaction-Id");
    const clientRequestId = String(body.clientRequestId || "");
    if (
        !standId ||
        !ALLOWED_INTERACTION_TYPES.has(interactionType) ||
        !headerRequestId ||
        headerRequestId !== clientRequestId ||
        !isValidRequestId(clientRequestId)
    ) {
        return respond(
            400,
            {
                error: "VALIDATION_ERROR",
                message:
                    "standId, a public interaction type and clientRequestId are required",
            },
            event,
        );
    }

    try {
        const stand = await docClient.send(
            new GetCommand({
                TableName: STANDS_TABLE,
                Key: { stand_id: standId },
            }),
        );
        if (!isPublicStand(stand.Item)) {
            return respond(404, { error: "STAND_NOT_FOUND" }, event);
        }

        const now = new Date();
        const interaction = {
            interactionId: interactionIdFor(
                standId,
                interactionType,
                clientRequestId,
            ),
            userId: getUserId(event),
            anonymousId: getUserId(event) ? null : anonymousId(body.sessionId),
            standId,
            organizationId: stand.Item.organizationId || null,
            eventId: stand.Item.eventId || null,
            interactionType,
            timestamp: now.getTime(),
            createdAt: now.toISOString(),
            schemaVersion: 3,
            ttl: Math.floor(now.getTime() / 1000) + 90 * 24 * 60 * 60,
        };

        await docClient.send(
            new PutCommand({
                TableName: TABLE_INTERACTIONS,
                Item: interaction,
                ConditionExpression: "attribute_not_exists(interactionId)",
            }),
        );
        return respond(
            201,
            { success: true, interactionId: interaction.interactionId },
            event,
        );
    } catch (error) {
        if (error.name === "ConditionalCheckFailedException") {
            return respond(
                200,
                {
                    success: true,
                    duplicate: true,
                    interactionId: interactionIdFor(
                        standId,
                        interactionType,
                        clientRequestId,
                    ),
                },
                event,
            );
        }
        console.error("Error tracking interaction:", error);
        return respond(500, { error: "INTERNAL_ERROR" }, event);
    }
};

exports.handler = withObservability("track-interaction", handler);
