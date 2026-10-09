"use strict";

const PUBLIC = "published";
const HIDDEN = "hidden";

function publicationTargetStatus(event) {
    return event?.visibility === "public" ? PUBLIC : "private";
}

function isEventPublic(event) {
    return Boolean(
        event &&
        event.status === PUBLIC &&
        event.visibility === "public" &&
        event.publicStatus === PUBLIC &&
        event.publicationState === PUBLIC &&
        typeof event.publishedAt === "string" &&
        event.publishedAt.length > 0,
    );
}

function beginPublishing(event, operationId, now) {
    return {
        ...event,
        status: "publishing",
        publicationState: "publishing",
        publicStatus: HIDDEN,
        publishOperationId: operationId,
        publishStartedAt: event.publishStartedAt || now,
        publishUpdatedAt: now,
        publishCheckpoint: event.publishCheckpoint || {
            lastEvaluatedKey: null,
            processedStands: 0,
            pages: 0,
        },
        publishFailure: null,
    };
}

function resumePublishing(event, now) {
    if (!["publishing", "publish_failed"].includes(event?.publicationState)) {
        throw new Error("Event is not in a resumable publication state");
    }
    return {
        ...event,
        status: "publishing",
        publicationState: "publishing",
        publicStatus: HIDDEN,
        publishUpdatedAt: now,
        publishFailure: null,
    };
}

function completePublishing(event, now) {
    return {
        ...event,
        status: PUBLIC,
        publicStatus: publicationTargetStatus(event),
        publicationState: PUBLIC,
        publishedAt: event.publishedAt || now,
        publishUpdatedAt: now,
        publishCompletedAt: now,
        publishCheckpoint: null,
        publishFailure: null,
    };
}

function failPublishing(event, failure, now) {
    return {
        ...event,
        status: "publish_failed",
        publicationState: "publish_failed",
        publicStatus: HIDDEN,
        publishUpdatedAt: now,
        publishFailure: {
            code: String(failure?.code || "PUBLISH_FAILED")
                .replace(/[^A-Z0-9_:-]/gi, "_")
                .toUpperCase(),
            requestId: String(failure?.requestId || "unavailable"),
        },
    };
}

module.exports = {
    beginPublishing,
    completePublishing,
    failPublishing,
    isEventPublic,
    publicationTargetStatus,
    resumePublishing,
};
