"use strict";

const { QuotaError } = require("../common/quota-model");
const quota = require("../common/quota-store");
const { authorizeQuotaMutation } = require("../common/quota-authorization");
const { respond, corsHeaders } = require("../common/cors");

function method(event) {
    return String(
        event.httpMethod || event.requestContext?.http?.method || "",
    ).toUpperCase();
}

function route(event) {
    return String(
        event.resource || event.routeKey || event.rawPath || event.path || "",
    );
}

function headers(event) {
    const result = {};
    for (const [key, value] of Object.entries(event.headers || {})) {
        result[String(key).toLowerCase()] = value;
    }
    return result;
}

function actorUserId(event) {
    return (
        event.requestContext?.authorizer?.claims?.sub ||
        event.requestContext?.authorizer?.jwt?.claims?.sub ||
        event.requestContext?.authorizer?.principalId
    );
}

function parseBody(event) {
    if (!event.body) {
        return {};
    }
    if (typeof event.body === "object") {
        return event.body;
    }
    try {
        return JSON.parse(event.body);
    } catch {
        return {};
    }
}

function responseStatus(response) {
    return Number(response?.statusCode || 200);
}

function isSuccess(response) {
    const status = responseStatus(response);
    return status >= 200 && status < 300;
}

function parseResponseBody(response) {
    if (!response?.body) {
        return {};
    }
    if (typeof response.body === "object") {
        return response.body;
    }
    try {
        return JSON.parse(response.body);
    } catch {
        return {};
    }
}

function findId(value, keys) {
    if (!value || typeof value !== "object") {
        return undefined;
    }
    for (const key of keys) {
        if (typeof value[key] === "string" && value[key]) {
            return value[key];
        }
    }
    for (const child of Object.values(value)) {
        if (child && typeof child === "object") {
            const found = findId(child, keys);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}

function jsonError(error, event) {
    const statusCode = Number(
        error.statusCode ||
            (error instanceof QuotaError ? error.statusCode : 500),
    );
    return respond(
        statusCode,
        {
            error: {
                code: error.code || "QUOTA_INTERNAL_ERROR",
                message:
                    statusCode >= 500
                        ? "The quota operation could not be completed."
                        : error.message,
                retryable: statusCode >= 500,
            },
        },
        event,
    );
}

function requestKey(event, prefix) {
    const supplied = headers(event)["idempotency-key"];
    if (supplied && String(supplied).length <= 200) {
        return String(supplied);
    }
    return `auto:${prefix}:${quota.requestDigest(`${actorUserId(event)}|${route(event)}|${event.body || ""}`)}`;
}

function isCreateEvent(event) {
    const value = route(event);
    return (
        method(event) === "POST" &&
        /\/organizations\/\{?organizationId\}?\/events\/?$/.test(value) &&
        !event.pathParameters?.eventId
    );
}

function isDuplicateEvent(event) {
    return (
        method(event) === "POST" &&
        /\/events\/\{?eventId\}?\/duplicate\/?$/.test(route(event))
    );
}

function isArchiveEvent(event) {
    return (
        method(event) === "POST" &&
        /\/events\/\{?eventId\}?\/archive\/?$/.test(route(event))
    );
}

function recoveryResponse(reservation, resourceType, event) {
    const replay = quota.replayResponse(reservation);
    if (replay) {
        return {
            ...replay,
            headers: {
                ...replay.headers,
                ...corsHeaders(event),
                "Idempotency-Replayed": "true",
            },
        };
    }
    if (reservation?.resourceId) {
        return respond(
            200,
            {
                [resourceType + "Id"]: reservation.resourceId,
                idempotentReplay: true,
            },
            event,
            { "Idempotency-Replayed": "true" },
        );
    }
    return jsonError(
        new QuotaError(
            "IDEMPOTENCY_RECOVERY_REQUIRED",
            "The previous request is still being reconciled.",
            409,
        ),
        event,
    );
}

function wrap(baseHandler) {
    if (typeof baseHandler !== "function") {
        throw new TypeError("The events handler is not callable.");
    }
    return async function quotaAwareEventsHandler(event, context) {
        if (isArchiveEvent(event)) {
            const response = await baseHandler(event, context);
            if (isSuccess(response) && event.pathParameters?.eventId) {
                await quota.releaseOccupancy(
                    "EVENT",
                    event.pathParameters.eventId,
                    "event_archived",
                );
            }
            return response;
        }

        if (!isCreateEvent(event) && !isDuplicateEvent(event)) {
            return baseHandler(event, context);
        }

        const organizationId = event.pathParameters?.organizationId;
        if (!organizationId) {
            return baseHandler(event, context);
        }
        const key = requestKey(
            event,
            isDuplicateEvent(event) ? "event-duplicate" : "event-create",
        );
        const requestHash = quota.requestDigest(
            JSON.stringify({
                organizationId,
                sourceEventId: event.pathParameters?.eventId,
                body: parseBody(event),
            }),
        );
        let reservation;
        let writerSucceeded = false;
        try {
            await authorizeQuotaMutation(
                event,
                quota.documentClient,
                organizationId,
                event.pathParameters?.eventId,
            );
            const result = await quota.reserveEventSlot({
                organizationId,
                idempotencyKey: key,
                requestHash,
                actorUserId: actorUserId(event),
            });
            reservation = result.reservation;
            if (result.replay) {
                return recoveryResponse(reservation, "event", event);
            }

            const response = await baseHandler(event, context);
            if (!isSuccess(response)) {
                await quota.releaseSourceReservation(
                    reservation.reservationId,
                    `legacy_status_${responseStatus(response)}`,
                );
                return response;
            }
            writerSucceeded = true;
            const eventId = findId(parseResponseBody(response), [
                "eventId",
                "id",
            ]);
            if (!eventId) {
                return jsonError(
                    new QuotaError(
                        "EVENT_ID_MISSING",
                        "The event writer returned no event identifier.",
                        500,
                    ),
                    event,
                );
            }
            await quota.consumeEventReservation(
                reservation.reservationId,
                eventId,
            );
            await quota.storeResponse(reservation.reservationId, response);
            return response;
        } catch (error) {
            if (
                !writerSucceeded &&
                reservation?.reservationId &&
                !["QUOTA_EXCEEDED", "IDEMPOTENCY_KEY_REUSED"].includes(
                    error.code,
                )
            ) {
                try {
                    await quota.releaseSourceReservation(
                        reservation.reservationId,
                        "exception",
                    );
                } catch {
                    /* reconciler owns recovery */
                }
            }
            return jsonError(error, event);
        }
    };
}

module.exports = { wrap };
