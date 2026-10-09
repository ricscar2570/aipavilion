"use strict";

const { corsHeaders } = require("./cors");

const SENSITIVE_KEY =
    /(authorization|cookie|token|secret|password|credential|clientSecret|api[-_]?key|session)/i;

function requestIdFrom(event = {}, context = {}) {
    return (
        event?.requestId ||
        event?.requestContext?.requestId ||
        event?.requestContext?.extendedRequestId ||
        context?.awsRequestId ||
        "unavailable"
    );
}

function sanitizeDetails(value, depth = 0) {
    if (depth > 5 || value === undefined) {
        return undefined;
    }
    if (
        value === null ||
        ["string", "number", "boolean"].includes(typeof value)
    ) {
        return value;
    }
    if (Array.isArray(value)) {
        return value
            .slice(0, 50)
            .map((item) => sanitizeDetails(item, depth + 1));
    }
    if (typeof value !== "object") {
        return String(value);
    }
    const result = {};
    for (const [key, child] of Object.entries(value)) {
        if (SENSITIVE_KEY.test(key)) {
            continue;
        }
        const sanitized = sanitizeDetails(child, depth + 1);
        if (sanitized !== undefined) {
            result[key] = sanitized;
        }
    }
    return result;
}

function codeForStatus(statusCode) {
    if (statusCode === 400) {
        return "INVALID_REQUEST";
    }
    if (statusCode === 401) {
        return "AUTHENTICATION_REQUIRED";
    }
    if (statusCode === 403) {
        return "FORBIDDEN";
    }
    if (statusCode === 404) {
        return "NOT_FOUND";
    }
    if (statusCode === 409) {
        return "CONFLICT";
    }
    if (statusCode === 413) {
        return "EXPORT_LIMIT_EXCEEDED";
    }
    if (statusCode === 428) {
        return "PRECONDITION_REQUIRED";
    }
    if (statusCode === 429) {
        return "RATE_LIMITED";
    }
    if (statusCode >= 500) {
        return "INTERNAL_ERROR";
    }
    return "REQUEST_FAILED";
}

function envelope({
    statusCode = 500,
    code,
    message,
    requestId,
    retryable,
    details,
} = {}) {
    const safeCode = String(code || codeForStatus(statusCode))
        .replace(/[^A-Z0-9_:-]/gi, "_")
        .toUpperCase();
    const safeMessage =
        statusCode >= 500
            ? "The service could not complete the request."
            : String(message || "The request could not be completed.");
    const error = {
        code: safeCode,
        message: safeMessage,
        requestId: String(requestId || "unavailable"),
        retryable: retryable ?? (statusCode === 429 || statusCode >= 500),
    };
    const safeDetails = sanitizeDetails(details);
    if (
        safeDetails !== undefined &&
        (typeof safeDetails !== "object" ||
            safeDetails === null ||
            Object.keys(safeDetails).length > 0)
    ) {
        error.details = safeDetails;
    }
    return {
        error,
        message: safeMessage,
        requestId: error.requestId,
    };
}

function parseBody(body) {
    if (typeof body !== "string") {
        return body;
    }
    try {
        return JSON.parse(body);
    } catch {
        return { message: body };
    }
}

function normalizeApiResponse(response, event, context) {
    if (!response || Number(response.statusCode) < 400) {
        return response;
    }
    const payload = parseBody(response.body);
    const safePayload = payload && typeof payload === "object" ? payload : {};
    const objectError =
        safePayload.error && typeof safePayload.error === "object"
            ? safePayload.error
            : {};
    const stringError =
        typeof safePayload.error === "string" ? safePayload.error : null;
    const normalized = envelope({
        statusCode: Number(response.statusCode),
        code: objectError.code || stringError || safePayload.code,
        message: objectError.message || safePayload.message,
        requestId:
            objectError.requestId ||
            safePayload.requestId ||
            requestIdFrom(event, context),
        retryable: objectError.retryable ?? safePayload.retryable,
        details: objectError.details ?? safePayload.details,
    });
    return {
        ...response,
        headers: {
            "Content-Type": "application/json",
            ...(response.headers || {}),
        },
        body: JSON.stringify(normalized),
    };
}

function unhandledResponse(error, event, context) {
    const requestId = requestIdFrom(event, context);
    console.error(
        JSON.stringify({
            level: "error",
            message: "Unhandled API error",
            requestId,
            name: error?.name || "Error",
            code: error?.code || null,
        }),
    );
    return {
        statusCode: 500,
        headers: {
            ...corsHeaders({ ...event, requestId }),
            "X-Request-Id": requestId,
        },
        body: JSON.stringify(envelope({ statusCode: 500, requestId })),
    };
}

function withApiErrorContract(handler) {
    return async function apiErrorContractHandler(event, context) {
        try {
            return normalizeApiResponse(
                await handler(event, context),
                event,
                context,
            );
        } catch (error) {
            return unhandledResponse(error, event, context);
        }
    };
}

module.exports = {
    envelope,
    normalizeApiResponse,
    requestIdFrom,
    sanitizeDetails,
    unhandledResponse,
    withApiErrorContract,
};
