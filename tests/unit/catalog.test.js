"use strict";

const {
    isPublicStand,
    toPublicStand,
    searchableText,
} = require("../../backend/lambda/common/catalog");
const { publicEvent } = require("../../backend/lambda/common/domain");

function publishedStand(overrides = {}) {
    return {
        stand_id: "stand-1",
        eventId: "event-1",
        name: "Publisher",
        status: "published",
        moderationStatus: "approved",
        visibility: "public",
        eventStatus: "published",
        publicStatus: "published",
        publicationKey: "published#2026-08-01T00:00:00.000Z",
        contact_email: "private@example.com",
        contact_phone: "+3900000000",
        website: "https://example.com",
        products: [
            { productId: "p1", name: "Visible Game", status: "active" },
            { productId: "p2", name: "Hidden Game", status: "hidden" },
        ],
        ...overrides,
    };
}

describe("fail-closed public catalog", () => {
    test.each([
        ["status", undefined],
        ["moderationStatus", undefined],
        ["visibility", undefined],
        ["eventStatus", undefined],
        ["publicStatus", undefined],
        ["publicationKey", undefined],
        ["eventId", undefined],
    ])("rejects a stand when %s is missing", (field, value) => {
        expect(isPublicStand(publishedStand({ [field]: value }))).toBe(false);
    });

    test("requires the exact published state", () => {
        expect(isPublicStand(publishedStand({ status: "approved" }))).toBe(
            false,
        );
        expect(isPublicStand(publishedStand())).toBe(true);
    });

    test("keeps contact details private unless individually opted in", () => {
        const hidden = toPublicStand(publishedStand());
        expect(hidden.contact).toBeUndefined();
        expect(hidden.contact_email).toBeUndefined();
        expect(hidden.website).toBeUndefined();

        const publicWebsite = toPublicStand(
            publishedStand({
                publicContact: {
                    showEmail: false,
                    showPhone: false,
                    showWebsite: true,
                },
            }),
        );
        expect(publicWebsite.contact).toEqual({
            website: "https://example.com",
        });
    });

    test("does not publish hidden products and searches visible product text", () => {
        const safe = toPublicStand(publishedStand());
        expect(safe.products).toHaveLength(1);
        expect(searchableText(publishedStand())).toContain("visible game");
        expect(searchableText(publishedStand())).not.toContain("hidden game");
    });
});

describe("fail-closed public events", () => {
    const event = {
        eventId: "event-1",
        organizationId: "org-1",
        name: "Expo",
        status: "published",
        visibility: "public",
        publicStatus: "published",
        publicationState: "published",
        publishedAt: "2026-08-01T00:00:00.000Z",
    };

    test("requires explicit public status and publication timestamp", () => {
        expect(publicEvent(event)).not.toBeNull();
        expect(publicEvent({ ...event, publicStatus: undefined })).toBeNull();
        expect(publicEvent({ ...event, publishedAt: undefined })).toBeNull();
    });
});
