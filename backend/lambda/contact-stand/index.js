"use strict";

const { withObservability } = require("../common/observability");
const { createHash } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
} = require("@aws-sdk/lib-dynamodb");
const { respond, preflight } = require("../common/cors");
const {
    SecretsManagerClient,
    GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const { isPublicStand } = require("../common/catalog");
const { standEventIsPublic } = require("../common/public-event-barrier");
const {
    pseudonymizeIp,
    validateTurnstileResult,
} = require("../common/lead-protection");
const {
    parseJsonBody,
    hasExactShape,
    isValidRequestId,
} = require("../common/validation");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secrets = new SecretsManagerClient({});
const STANDS_TABLE = process.env.STANDS_TABLE || "ai-pavilion-stands";
const LEADS_TABLE = process.env.LEADS_TABLE || "ai-pavilion-leads";
const EVENTS_TABLE = process.env.EVENTS_TABLE || "ai-pavilion-events";
const CHALLENGE_MODE = process.env.BOT_CHALLENGE_MODE || "disabled";
const CHALLENGE_EXPECTED_HOSTNAME =
    process.env.BOT_CHALLENGE_EXPECTED_HOSTNAME || "";
const CHALLENGE_EXPECTED_ACTION =
    process.env.BOT_CHALLENGE_EXPECTED_ACTION || "lead-submit";
const parsedChallengeMaxAge = Number.parseInt(
    process.env.BOT_CHALLENGE_MAX_AGE_SECONDS || "300",
    10,
);
const CHALLENGE_MAX_AGE_SECONDS = Number.isFinite(parsedChallengeMaxAge)
    ? Math.max(30, parsedChallengeMaxAge)
    : 300;
const LEAD_IP_MODE = process.env.LEAD_IP_PSEUDONYMIZATION_MODE || "disabled";
let challengeSecret;
let leadIpHmacSecret;

async function loadChallengeSecret() {
    if (challengeSecret) {
        return challengeSecret;
    }
    const result = await secrets.send(
        new GetSecretValueCommand({
            SecretId: process.env.BOT_CHALLENGE_SECRET_ARN,
        }),
    );
    const parsed = JSON.parse(result.SecretString || "{}");
    if (!parsed.turnstileSecret) {
        throw new Error("Bot challenge secret is not configured");
    }
    challengeSecret = parsed.turnstileSecret;
    return challengeSecret;
}

async function verifyChallenge(token, event) {
    if (CHALLENGE_MODE === "disabled") {
        return { valid: true, reason: "disabled" };
    }
    if (CHALLENGE_MODE === "simulated") {
        return {
            valid: token === "test-pass",
            reason: token === "test-pass" ? "simulated" : "challenge_failed",
        };
    }
    if (!token || typeof fetch !== "function") {
        return { valid: false, reason: "challenge_failed" };
    }
    const secret = await loadChallengeSecret();
    const body = new URLSearchParams({ secret, response: token });
    const sourceIp = sourceIpFor(event);
    if (sourceIp) {
        body.set("remoteip", sourceIp);
    }
    const response = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
            signal: AbortSignal.timeout(5000),
        },
    );
    if (!response.ok) {
        return { valid: false, reason: "challenge_service_error" };
    }
    const result = await response.json();
    return validateTurnstileResult(result, {
        hostname: CHALLENGE_EXPECTED_HOSTNAME || undefined,
        action: CHALLENGE_EXPECTED_ACTION || undefined,
        maxAgeSeconds: CHALLENGE_MAX_AGE_SECONDS,
    });
}

function sourceIpFor(event) {
    return (
        event.requestContext?.identity?.sourceIp ||
        event.requestContext?.http?.sourceIp ||
        null
    );
}

async function loadLeadIpHmacSecret() {
    if (leadIpHmacSecret) {
        return leadIpHmacSecret;
    }
    const secretId = process.env.LEAD_IP_HMAC_SECRET_ARN;
    if (!secretId) {
        throw new Error("Lead IP HMAC secret is not configured");
    }
    const result = await secrets.send(
        new GetSecretValueCommand({ SecretId: secretId }),
    );
    const parsed = JSON.parse(result.SecretString || "{}");
    if (!parsed.leadIpHmacSecret) {
        throw new Error("Lead IP HMAC secret is not configured");
    }
    leadIpHmacSecret = parsed.leadIpHmacSecret;
    return leadIpHmacSecret;
}

async function sourcePseudonym(event) {
    if (String(LEAD_IP_MODE).toLowerCase() === "disabled") {
        return null;
    }
    return pseudonymizeIp(sourceIpFor(event), {
        mode: LEAD_IP_MODE,
        secret: await loadLeadIpHmacSecret(),
    });
}

function cleanText(value, maxLength) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function getHeader(event, name) {
    return Object.entries(event.headers || {}).find(
        ([key]) => key.toLowerCase() === name.toLowerCase(),
    )?.[1];
}

function leadIdFor(standId, email, clientRequestId) {
    return `lead_${createHash("sha256")
        .update(`${standId}:${email}:${clientRequestId}`)
        .digest("hex")
        .slice(0, 32)}`;
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
            "name",
            "email",
            "message",
            "privacyAccepted",
            "website",
            "clientRequestId",
            "challengeToken",
        ])
    ) {
        return respond(
            400,
            { error: "VALIDATION_ERROR", message: "Unexpected contact fields" },
            event,
        );
    }

    // Hidden honeypot: real users never fill this field.
    if (cleanText(body.website, 300)) {
        return respond(202, { success: true }, event);
    }

    const standId = cleanText(body.standId, 120);
    const name = cleanText(body.name, 120);
    const email = cleanText(body.email, 254).toLowerCase();
    const message = cleanText(body.message, 3000);
    const headerRequestId = getHeader(event, "Idempotency-Key");
    const clientRequestId = cleanText(body.clientRequestId, 128);

    if (
        !standId ||
        !name ||
        !validEmail(email) ||
        message.length < 5 ||
        !headerRequestId ||
        headerRequestId !== clientRequestId ||
        !isValidRequestId(clientRequestId)
    ) {
        return respond(
            400,
            {
                error: "VALIDATION_ERROR",
                message:
                    "standId, name, a valid email, message and matching idempotency key are required",
            },
            event,
        );
    }
    if (body.privacyAccepted !== true) {
        return respond(
            400,
            {
                error: "PRIVACY_ACCEPTANCE_REQUIRED",
                message: "Privacy acknowledgement is required",
            },
            event,
        );
    }
    const challenge = await verifyChallenge(
        cleanText(body.challengeToken, 2048),
        event,
    );
    if (!challenge.valid) {
        return respond(
            403,
            {
                error: "BOT_CHALLENGE_FAILED",
                details: { reason: challenge.reason },
            },
            event,
        );
    }

    try {
        const stand = await client.send(
            new GetCommand({
                TableName: STANDS_TABLE,
                Key: { stand_id: standId },
            }),
        );
        if (
            !isPublicStand(stand.Item) ||
            !(await standEventIsPublic(client, EVENTS_TABLE, stand.Item))
        ) {
            return respond(
                404,
                { error: "STAND_NOT_FOUND", message: "Stand not found" },
                event,
            );
        }

        const now = new Date().toISOString();
        const leadId = leadIdFor(standId, email, clientRequestId);
        const ipPseudonym = await sourcePseudonym(event);
        const lead = {
            leadId,
            clientRequestId,
            standId,
            standName: stand.Item.name || "",
            organizationId: stand.Item.organizationId || null,
            eventId: stand.Item.eventId || null,
            ownerUserId: stand.Item.ownerUserId || null,
            name,
            email,
            message,
            status: "new",
            source: "stand-contact-form",
            ...(ipPseudonym ? { sourcePseudonym: ipPseudonym } : {}),
            schemaVersion: 4,
            privacyAcceptedAt: now,
            ttl: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
            createdAt: now,
            updatedAt: now,
        };

        await client.send(
            new PutCommand({
                TableName: LEADS_TABLE,
                Item: lead,
                ConditionExpression: "attribute_not_exists(leadId)",
            }),
        );
        return respond(201, { success: true, leadId }, event);
    } catch (error) {
        if (error.name === "ConditionalCheckFailedException") {
            return respond(
                200,
                {
                    success: true,
                    duplicate: true,
                    leadId: leadIdFor(standId, email, clientRequestId),
                },
                event,
            );
        }
        console.error("Failed to create stand lead:", error);
        return respond(
            500,
            { error: "INTERNAL_ERROR", message: "Failed to send message" },
            event,
        );
    }
};

exports.handler = withObservability("contact-stand", handler);
