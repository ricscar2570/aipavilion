"use strict";

class QuotaError extends Error {
    constructor(code, message, statusCode = 409, details = {}) {
        super(message);
        this.name = "QuotaError";
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}

function integer(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeCounter(item = {}) {
    const limit = integer(item.limit, 0);
    const used = integer(item.used, 0);
    const reserved = integer(item.reserved, 0);
    const available = Math.max(
        0,
        integer(item.available, Math.max(0, limit - used - reserved)),
    );
    return { limit, used, reserved, available };
}

function assertCounterInvariant(counter) {
    const normalized = normalizeCounter(counter);
    if (
        normalized.used + normalized.reserved + normalized.available !==
        normalized.limit
    ) {
        throw new QuotaError(
            "QUOTA_COUNTER_DRIFT",
            "The quota counter is internally inconsistent.",
            503,
            normalized,
        );
    }
    return normalized;
}

function canReserve(counter, amount = 1) {
    const normalized = assertCounterInvariant(counter);
    const requested = integer(amount, 1);
    return requested > 0 && normalized.available >= requested;
}

function reserve(counter, amount = 1) {
    const normalized = assertCounterInvariant(counter);
    const requested = integer(amount, 1);
    if (!canReserve(normalized, requested)) {
        throw new QuotaError(
            "QUOTA_EXCEEDED",
            "The plan quota has been reached.",
            409,
            normalized,
        );
    }
    return {
        ...normalized,
        reserved: normalized.reserved + requested,
        available: normalized.available - requested,
    };
}

function consumeReservation(counter, amount = 1) {
    const normalized = assertCounterInvariant(counter);
    const requested = integer(amount, 1);
    if (normalized.reserved < requested) {
        throw new QuotaError(
            "QUOTA_RESERVATION_MISSING",
            "No matching quota reservation exists.",
            409,
            normalized,
        );
    }
    return {
        ...normalized,
        reserved: normalized.reserved - requested,
        used: normalized.used + requested,
    };
}

function releaseReserved(counter, amount = 1) {
    const normalized = assertCounterInvariant(counter);
    const requested = integer(amount, 1);
    if (normalized.reserved < requested) {
        return normalized;
    }
    return {
        ...normalized,
        reserved: normalized.reserved - requested,
        available: normalized.available + requested,
    };
}

function releaseUsed(counter, amount = 1) {
    const normalized = assertCounterInvariant(counter);
    const requested = integer(amount, 1);
    if (normalized.used < requested) {
        return normalized;
    }
    return {
        ...normalized,
        used: normalized.used - requested,
        available: normalized.available + requested,
    };
}

module.exports = {
    QuotaError,
    integer,
    normalizeCounter,
    assertCounterInvariant,
    canReserve,
    reserve,
    consumeReservation,
    releaseReserved,
    releaseUsed,
};
