"use strict";

const { randomUUID } = require("crypto");

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function headerValue(headers = {}, name) {
    const target = name.toLowerCase();
    const key = Object.keys(headers).find(
        (candidate) => candidate.toLowerCase() === target,
    );
    return key ? headers[key] : undefined;
}

function requestIdFor(event = {}) {
    const supplied = String(headerValue(event.headers, "x-request-id") || "");
    if (REQUEST_ID_PATTERN.test(supplied)) {
        return supplied;
    }
    return event.requestContext?.requestId || randomUUID();
}

function requestMetadata(event = {}, requestId) {
    return {
        requestId,
        method: event.httpMethod || event.requestContext?.http?.method || null,
        path: event.path || event.rawPath || null,
        routeKey: event.requestContext?.routeKey || null,
    };
}

function write(level, record) {
    const output = JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        service: "ai-pavilion-api",
        ...record,
    });
    if (level === "ERROR") {
        console.error(output);
    } else if (level === "WARN") {
        console.warn(output);
    } else {
        console.log(output);
    }
}

function withObservability(handlerName, handler) {
    return async function observedHandler(event = {}, context = {}) {
        const requestId = requestIdFor(event);
        event.requestId = requestId;
        const startedAt = Date.now();
        const metadata = requestMetadata(event, requestId);

        write("INFO", {
            event: "request.started",
            handler: handlerName,
            ...metadata,
        });

        try {
            const response = await handler(event, context);
            const statusCode = Number(response?.statusCode || 200);
            response.headers = {
                ...(response.headers || {}),
                "X-Request-Id": requestId,
            };
            write("INFO", {
                event: "request.completed",
                handler: handlerName,
                ...metadata,
                statusCode,
                durationMs: Date.now() - startedAt,
            });
            return response;
        } catch (error) {
            write("ERROR", {
                event: "request.failed",
                handler: handlerName,
                ...metadata,
                durationMs: Date.now() - startedAt,
                errorName: error?.name || "Error",
                errorCode: error?.code || null,
            });
            throw error;
        }
    };
}

module.exports = {
    requestIdFor,
    withObservability,
};
