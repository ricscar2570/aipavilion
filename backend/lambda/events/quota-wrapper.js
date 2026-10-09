"use strict";

const { QuotaError } = require("../common/quota-model");
const quota = require("../common/quota-store");

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

function jsonError(error) {
    const statusCode = Number(
        error.statusCode ||
            (error instanceof QuotaError ? error.statusCode : 500),
    );
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
        },
        body: JSON.stringify({
            error: {
                code: error.code || "QUOTA_INTERNAL_ERROR",
                message:
                    statusCode >= 500
                        ? "The quota operation could not be completed."
                        : error.message,
                retryable: statusCode >= 500,
            },
        }),
    };
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

function recoveryResponse(reservation, resourceType) {
    const replay = quota.replayResponse(reservation);
    if (replay) {
        return replay;
    }
    if (reservation?.resourceId) {
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Idempotency-Replayed": "true",
            },
            body: JSON.stringify({
                [resourceType + "Id"]: reservation.resourceId,
                idempotentReplay: true,
            }),
        };
    }
    return {
        statusCode: 409,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            error: {
                code: "IDEMPOTENCY_RECOVERY_REQUIRED",
                message: "The previous request is still being reconciled.",
            },
        }),
    };
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
        try {
            const result = await quota.reserveEventSlot({
                organizationId,
                idempotencyKey: key,
                requestHash,
                actorUserId: actorUserId(event),
            });
            reservation = result.reservation;
            if (result.replay && reservation.status !== "reserved") {
                return recoveryResponse(reservation, "event");
            }
            if (result.replay && reservation.responseStatusCode) {
                return recoveryResponse(reservation, "event");
            }

            const response = await baseHandler(event, context);
            if (!isSuccess(response)) {
                await quota.releaseSourceReservation(
                    reservation.reservationId,
                    `legacy_status_${responseStatus(response)}`,
                );
                return response;
            }
            const eventId = findId(parseResponseBody(response), [
                "eventId",
                "id",
            ]);
            if (!eventId) {
                await quota.releaseSourceReservation(
                    reservation.reservationId,
                    "event_id_missing",
                );
                return jsonError(
                    new QuotaError(
                        "EVENT_ID_MISSING",
                        "The event writer returned no event identifier.",
                        500,
                    ),
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
            return jsonError(error);
        }
    };
}

module.exports = { wrap };
