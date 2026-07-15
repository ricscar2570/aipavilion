"use strict";

const PUBLIC_STATUSES = new Set(["approved", "published"]);
const PUBLIC_STAND_FIELDS = [
    "stand_id",
    "eventId",
    "name",
    "status",
    "visibility",
    "description",
    "long_description",
    "category",
    "image_url",
    "images",
    "products",
    "documents",
    "videos",
    "tags",
    "is_sponsored",
    "ar_enabled",
    "tour_enabled",
    "booth_number",
    "rating",
    "contact",
    "contact_email",
    "contact_phone",
    "website",
    "created_at",
    "updated_at",
    "schemaVersion",
];
const PUBLIC_PRODUCT_FIELDS = [
    "id",
    "productId",
    "product_id",
    "name",
    "description",
    "category",
    "price",
    "priceInCents",
    "currency",
    "image_url",
    "imageUrl",
    "status",
];

function isPublicStand(stand) {
    if (!stand || typeof stand !== "object") {
        return false;
    }
    const status = String(stand.status || "").toLowerCase();
    const visibility = String(stand.visibility || "public").toLowerCase();
    const eventStatus = String(stand.eventStatus || "published").toLowerCase();
    const publicStatus = String(
        stand.publicStatus || "published",
    ).toLowerCase();
    return (
        PUBLIC_STATUSES.has(status) &&
        visibility === "public" &&
        eventStatus === "published" &&
        publicStatus === "published"
    );
}

function pick(source, fields) {
    return Object.fromEntries(
        fields
            .filter((field) => source[field] !== undefined)
            .map((field) => [field, source[field]]),
    );
}

function toPublicProduct(product) {
    if (!product || typeof product !== "object") {
        return null;
    }
    return pick(product, PUBLIC_PRODUCT_FIELDS);
}

function toPublicStand(stand) {
    if (!isPublicStand(stand)) {
        return null;
    }
    const result = pick(stand, PUBLIC_STAND_FIELDS);
    if (Array.isArray(result.products)) {
        result.products = result.products.map(toPublicProduct).filter(Boolean);
    }
    return result;
}

module.exports = {
    PUBLIC_STATUSES,
    PUBLIC_STAND_FIELDS,
    PUBLIC_PRODUCT_FIELDS,
    isPublicStand,
    toPublicProduct,
    toPublicStand,
};
