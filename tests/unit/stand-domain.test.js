"use strict";

const {
    createDraftStand,
    deriveStandPublication,
    canonicalStandProblems,
    assertCanonicalStand,
} = require("../../backend/lambda/common/stand-domain");

describe("canonical stand domain", () => {
    test("creates a fail-closed canonical draft with private contacts", () => {
        const stand = createDraftStand({
            standId: "stand-1",
            organizationId: "org-1",
            eventId: "event-1",
            ownerUserId: "user-1",
            name: "Canonical Stand",
            now: "2026-08-24T10:00:00.000Z",
        });
        expect(stand).toMatchObject({
            status: "draft",
            moderationStatus: "draft",
            publicStatus: "draft",
            schemaVersion: 4,
            revision: 1,
        });
        expect(stand.publicContact).toEqual({
            showEmail: false,
            showPhone: false,
            showWebsite: false,
        });
        expect(canonicalStandProblems(stand)).toEqual([]);
    });

    test("publishes only when every fail-closed invariant is explicit", () => {
        const now = "2026-08-24T10:00:00.000Z";
        const published = deriveStandPublication({
            status: "published",
            moderationStatus: "approved",
            visibility: "public",
            eventStatus: "published",
            eventPublicStatus: "published",
            now,
        });
        expect(published).toEqual({
            publicStatus: "published",
            publicationKey: `published#${now}`,
        });

        expect(
            deriveStandPublication({
                status: "published",
                moderationStatus: "approved",
                visibility: "public",
                eventStatus: "published",
                eventPublicStatus: "draft",
                now,
            }).publicStatus,
        ).toBe("draft");
    });

    test("rejects legacy or ambiguous stand records", () => {
        const stand = createDraftStand({
            standId: "stand-1",
            organizationId: "org-1",
            eventId: "event-1",
            ownerUserId: "user-1",
            name: "Canonical Stand",
        });
        stand.status = "approved";
        expect(() => assertCanonicalStand(stand)).toThrow(/status is invalid/);
    });
});
