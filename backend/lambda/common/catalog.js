"use strict";

const PUBLIC_STAND_FIELDS = [
    "stand_id",
    "eventId",
    "name",
    "status",
    "moderationStatus",
    "visibility",
    "publicStatus",
    "eventStatus",
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
    "booth_number",
    "rating",
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
    return (
        stand.status === "published" &&
        stand.moderationStatus === "approved" &&
        stand.visibility === "public" &&
        stand.eventStatus === "published" &&
        stand.publicStatus === "published" &&
        typeof stand.publicationKey === "string" &&
        stand.publicationKey.startsWith("published#") &&
        typeof stand.stand_id === "string" &&
        stand.stand_id.length > 0 &&
        typeof stand.eventId === "string" &&
        stand.eventId.length > 0 &&
        typeof stand.name === "string" &&
        stand.name.trim().length > 0
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
    if (!product || typeof product !== "object" || product.status === "hidden") {
        return null;
    }
    return pick(product, PUBLIC_PRODUCT_FIELDS);
}

function publicContact(stand) {
    const policy = stand.publicContact;
    if (!policy || typeof policy !== "object") {
        return null;
    }
    const contact = {};
    if (policy.showEmail === true && stand.contact_email) {
        contact.email = stand.contact_email;
    }
    if (policy.showPhone === true && stand.contact_phone) {
        contact.phone = stand.contact_phone;
    }
    if (policy.showWebsite === true && stand.website) {
        contact.website = stand.website;
    }
    return Object.keys(contact).length ? contact : null;
}

function toPublicStand(stand) {
    if (!isPublicStand(stand)) {
        return null;
    }
    const result = pick(stand, PUBLIC_STAND_FIELDS);
    if (Array.isArray(result.products)) {
        result.products = result.products.map(toPublicProduct).filter(Boolean);
    }
    const contact = publicContact(stand);
    if (contact) {
        result.contact = contact;
    }
    return result;
}

function searchableText(stand) {
    const productText = Array.isArray(stand.products)
        ? stand.products
              .filter((product) => product?.status !== "hidden")
              .flatMap((product) => [product?.name, product?.description, product?.category])
        : [];
    const tags = Array.isArray(stand.tags) ? stand.tags : [];
    return [
        stand.name,
        stand.category,
        stand.description,
        stand.long_description,
        ...tags,
        ...productText,
    ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("en");
}

module.exports = {
    PUBLIC_STAND_FIELDS,
    PUBLIC_PRODUCT_FIELDS,
    isPublicStand,
    toPublicProduct,
    toPublicStand,
    searchableText,
};
