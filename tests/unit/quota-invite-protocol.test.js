"use strict";

const quota = require("../../backend/lambda/common/quota-model");
const invite = require("../../backend/lambda/common/invite-policy");

describe("QUOTA-01 pure model", () => {
    test("reservation and consumption preserve the invariant", () => {
        const reserved = quota.reserve({
            limit: 3,
            used: 1,
            reserved: 0,
            available: 2,
        });
        expect(reserved).toEqual({
            limit: 3,
            used: 1,
            reserved: 1,
            available: 1,
        });
        expect(quota.consumeReservation(reserved)).toEqual({
            limit: 3,
            used: 2,
            reserved: 0,
            available: 1,
        });
    });
    test("cannot reserve over the limit", () => {
        expect(() =>
            quota.reserve({ limit: 1, used: 1, reserved: 0, available: 0 }),
        ).toThrow("quota");
    });
});

describe("INVITE-01 policy", () => {
    const invitation = {
        status: "pending",
        email: "person@example.com",
        expiresAt: 4102444800,
    };
    const profile = { email: "Person@Example.com", emailVerified: true };
    test("an absent membership is a valid first acceptance", () => {
        expect(
            invite.assertInvitationAcceptable({
                invitation,
                profile,
                actorUserId: "u1",
            }).membershipClass,
        ).toBe("absent");
    });
    test.each(["inactive", "suspended", "pending"])(
        "blocks a %s membership",
        (status) => {
            expect(() =>
                invite.assertInvitationAcceptable({
                    invitation,
                    profile,
                    membership: { status },
                    actorUserId: "u1",
                }),
            ).toThrow("reactivated");
        },
    );
    test("blocks another email identity", () => {
        expect(() =>
            invite.assertInvitationAcceptable({
                invitation,
                profile: { ...profile, email: "other@example.com" },
                actorUserId: "u1",
            }),
        ).toThrow("another identity");
    });
});
