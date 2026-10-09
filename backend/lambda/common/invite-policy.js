"use strict";

class InvitePolicyError extends Error {
    constructor(code, message, statusCode = 409, details = {}) {
        super(message);
        this.name = "InvitePolicyError";
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}

function normalizeEmail(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function normalizeStatus(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function isExpired(invitation, nowSeconds = Math.floor(Date.now() / 1000)) {
    const raw = invitation?.expiresAt ?? invitation?.expires_at;
    if (raw === undefined || raw === null || raw === "") {
        return false;
    }
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
        return numeric <= nowSeconds;
    }
    const millis = Date.parse(String(raw));
    return Number.isFinite(millis) && Math.floor(millis / 1000) <= nowSeconds;
}

function classifyMembership(membership) {
    if (!membership) {
        return "absent";
    }
    const status = normalizeStatus(
        membership.status || membership.membershipStatus || "active",
    );
    if (["active", "accepted", "enabled"].includes(status)) {
        return "active";
    }
    if (["inactive", "disabled", "removed"].includes(status)) {
        return "inactive";
    }
    if (["suspended", "blocked"].includes(status)) {
        return "suspended";
    }
    if (["pending", "invited"].includes(status)) {
        return "pending";
    }
    return "unknown";
}

function assertInvitationAcceptable({
    invitation,
    profile,
    membership,
    actorUserId,
    nowSeconds,
}) {
    if (!invitation) {
        throw new InvitePolicyError(
            "INVITATION_NOT_FOUND",
            "The invitation does not exist.",
            404,
        );
    }
    const status = normalizeStatus(invitation.status || "pending");
    if (status === "accepted") {
        throw new InvitePolicyError(
            "INVITATION_ALREADY_ACCEPTED",
            "The invitation has already been accepted.",
            409,
        );
    }
    if (["revoked", "cancelled", "canceled"].includes(status)) {
        throw new InvitePolicyError(
            "INVITATION_REVOKED",
            "The invitation has been revoked.",
            410,
        );
    }
    if (status !== "pending") {
        throw new InvitePolicyError(
            "INVITATION_NOT_PENDING",
            "The invitation is not pending.",
            409,
            { status },
        );
    }
    if (isExpired(invitation, nowSeconds)) {
        throw new InvitePolicyError(
            "INVITATION_EXPIRED",
            "The invitation has expired.",
            410,
        );
    }
    if (!actorUserId) {
        throw new InvitePolicyError(
            "AUTHENTICATION_REQUIRED",
            "Authentication is required.",
            401,
        );
    }
    if (
        !profile ||
        profile.deletedAt ||
        normalizeStatus(profile.status) === "deleted"
    ) {
        throw new InvitePolicyError(
            "PROFILE_REQUIRED",
            "A valid application profile is required.",
            409,
        );
    }
    const verified =
        profile.emailVerified ??
        profile.email_verified ??
        profile.isEmailVerified;
    if (verified === false || verified === "false") {
        throw new InvitePolicyError(
            "PROFILE_EMAIL_NOT_VERIFIED",
            "The profile email is not verified.",
            403,
        );
    }
    const expected = normalizeEmail(
        invitation.email || invitation.recipientEmail,
    );
    const actual = normalizeEmail(profile.email);
    if (!expected || !actual || expected !== actual) {
        throw new InvitePolicyError(
            "INVITATION_IDENTITY_MISMATCH",
            "The invitation belongs to another identity.",
            403,
        );
    }
    const membershipClass = classifyMembership(membership);
    if (
        ["inactive", "suspended", "pending", "unknown"].includes(
            membershipClass,
        )
    ) {
        throw new InvitePolicyError(
            "MEMBERSHIP_REACTIVATION_REQUIRED",
            "The existing organization membership must be reactivated by an organizer before accepting this invitation.",
            409,
            { membershipStatus: membershipClass },
        );
    }
    return { membershipClass, normalizedEmail: actual };
}

module.exports = {
    InvitePolicyError,
    normalizeEmail,
    normalizeStatus,
    isExpired,
    classifyMembership,
    assertInvitationAcceptable,
};
