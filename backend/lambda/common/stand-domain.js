"use strict";

const { cleanText, validId } = require("./domain");

const STAND_SCHEMA_VERSION = 4;
const STAND_STATUSES = new Set([
    "draft",
    "pending_review",
    "published",
    "rejected",
    "archived",
    "removed",
]);
const MODERATION_STATUSES = new Set([
    "draft",
    "pending",
    "approved",
    "rejected",
]);
const PUBLIC_STATUSES = new Set(["draft", "published", "archived"]);

function defaultPublicContact() {
    return {
        showEmail: false,
        showPhone: false,
        showWebsite: false,
    };
}

function createDraftStand({
    standId,
    organizationId,
    eventId,
    ownerUserId,
    name,
    slug = "",
    eventStatus = "draft",
    now = new Date().toISOString(),
}) {
    if (
        !validId(standId) ||
        !validId(organizationId) ||
        !validId(eventId) ||
        !validId(ownerUserId)
    ) {
        throw new TypeError("Canonical stand identifiers are required");
    }
    const cleanName = cleanText(name, 160);
    if (!cleanName) {
        throw new TypeError("A canonical stand name is required");
    }
    return {
        stand_id: standId,
        organizationId,
        eventId,
        ownerUserId,
        exhibitorUserId: ownerUserId,
        name: cleanName,
        slug: cleanText(slug, 120),
        description: "",
        category: "general",
        status: "draft",
        moderationStatus: "draft",
        eventStatus,
        visibility: "public",
        publicStatus: "draft",
        publicationKey: `draft#${now}`,
        publicContact: defaultPublicContact(),
        products: [],
        images: [],
        createdAt: now,
        updatedAt: now,
        created_at: now,
        updated_at: now,
        schemaVersion: STAND_SCHEMA_VERSION,
        revision: 1,
    };
}

function deriveStandPublication({
    status,
    moderationStatus,
    visibility,
    eventStatus,
    eventPublicStatus,
    now = new Date().toISOString(),
}) {
    const publicStatus =
        status === "published" &&
        moderationStatus === "approved" &&
        visibility === "public" &&
        eventStatus === "published" &&
        eventPublicStatus === "published"
            ? "published"
            : "draft";
    return {
        publicStatus,
        publicationKey: `${
            publicStatus === "published" ? "published" : status
        }#${now}`,
    };
}

function canonicalStandProblems(stand) {
    const problems = [];
    if (!stand || typeof stand !== "object") {
        return ["stand must be an object"];
    }
    for (const field of [
        "stand_id",
        "organizationId",
        "eventId",
        "ownerUserId",
    ]) {
        if (!validId(stand[field])) {
            problems.push(`${field} is invalid`);
        }
    }
    if (!cleanText(stand.name, 160)) {
        problems.push("name is required");
    }
    if (!STAND_STATUSES.has(stand.status)) {
        problems.push("status is invalid");
    }
    if (!MODERATION_STATUSES.has(stand.moderationStatus)) {
        problems.push("moderationStatus is invalid");
    }
    if (!PUBLIC_STATUSES.has(stand.publicStatus)) {
        problems.push("publicStatus is invalid");
    }
    if (!["public", "private"].includes(stand.visibility)) {
        problems.push("visibility is invalid");
    }
    if (stand.schemaVersion !== STAND_SCHEMA_VERSION) {
        problems.push(`schemaVersion must be ${STAND_SCHEMA_VERSION}`);
    }
    if (!Number.isSafeInteger(stand.revision) || stand.revision < 1) {
        problems.push("revision must be a positive integer");
    }
    if (
        stand.publicStatus === "published" &&
        !(
            stand.status === "published" &&
            stand.moderationStatus === "approved" &&
            stand.visibility === "public" &&
            stand.eventStatus === "published" &&
            String(stand.publicationKey || "").startsWith("published#")
        )
    ) {
        problems.push("published stand invariants are not satisfied");
    }
    return problems;
}

function assertCanonicalStand(stand) {
    const problems = canonicalStandProblems(stand);
    if (problems.length) {
        const error = new Error(
            `Non-canonical stand ${stand?.stand_id || "(unknown)"}: ${problems.join(", ")}`,
        );
        error.code = "NON_CANONICAL_STAND";
        error.problems = problems;
        throw error;
    }
    return stand;
}

module.exports = {
    STAND_SCHEMA_VERSION,
    defaultPublicContact,
    createDraftStand,
    deriveStandPublication,
    canonicalStandProblems,
    assertCanonicalStand,
};
