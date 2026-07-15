"use strict";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,119}$/;

function cleanText(value, maxLength) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function slugify(value) {
    return cleanText(value, 120)
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}

function validSlug(value) {
    return SLUG_PATTERN.test(String(value || ""));
}

function validId(value) {
    return ID_PATTERN.test(String(value || ""));
}

function validIsoDate(value) {
    if (!value || typeof value !== "string") {
        return false;
    }
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function publicEvent(event) {
    if (
        !event ||
        event.status !== "published" ||
        event.visibility !== "public"
    ) {
        return null;
    }
    const fields = [
        "eventId",
        "organizationId",
        "name",
        "slug",
        "description",
        "startsAt",
        "endsAt",
        "timezone",
        "status",
        "visibility",
        "branding",
        "publishedAt",
        "createdAt",
        "updatedAt",
    ];
    return Object.fromEntries(
        fields
            .filter((field) => event[field] !== undefined)
            .map((field) => [field, event[field]]),
    );
}

module.exports = {
    SLUG_PATTERN,
    ID_PATTERN,
    cleanText,
    slugify,
    validSlug,
    validId,
    validIsoDate,
    publicEvent,
};
