#!/usr/bin/env node
"use strict";

const assert = require("assert");
const quota = require("../../backend/lambda/common/quota-model");
const invite = require("../../backend/lambda/common/invite-policy");

let counter = { limit: 2, used: 0, reserved: 0, available: 2 };
counter = quota.reserve(counter);
assert.deepStrictEqual(counter, {
    limit: 2,
    used: 0,
    reserved: 1,
    available: 1,
});
counter = quota.consumeReservation(counter);
assert.deepStrictEqual(counter, {
    limit: 2,
    used: 1,
    reserved: 0,
    available: 1,
});
counter = quota.releaseUsed(counter);
assert.deepStrictEqual(counter, {
    limit: 2,
    used: 0,
    reserved: 0,
    available: 2,
});
assert.strictEqual(
    invite.normalizeEmail("  Person@Example.COM "),
    "person@example.com",
);
assert.strictEqual(invite.classifyMembership(undefined), "absent");
assert.strictEqual(invite.classifyMembership({ status: "active" }), "active");
assert.throws(
    () =>
        invite.assertInvitationAcceptable({
            invitation: { status: "pending", email: "a@example.com" },
            profile: { email: "b@example.com", emailVerified: true },
            actorUserId: "user-1",
        }),
    (error) => error.code === "INVITATION_IDENTITY_MISMATCH",
);
assert.throws(
    () =>
        invite.assertInvitationAcceptable({
            invitation: { status: "pending", email: "a@example.com" },
            profile: { email: "a@example.com", emailVerified: true },
            membership: { status: "suspended" },
            actorUserId: "user-1",
        }),
    (error) => error.code === "MEMBERSHIP_REACTIVATION_REQUIRED",
);
const accepted = invite.assertInvitationAcceptable({
    invitation: { status: "pending", email: "a@example.com" },
    profile: { email: "a@example.com", emailVerified: true },
    actorUserId: "user-1",
});
assert.strictEqual(accepted.membershipClass, "absent");
console.log("QUOTA-01 and INVITE-01 pure model self-test: PASS");
