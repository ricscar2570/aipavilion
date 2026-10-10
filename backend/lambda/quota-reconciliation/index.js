"use strict";

const {
    scanAll,
    calculateEventUsage,
    calculateStandUsage,
    readEntitlement,
    extractLimit,
    setCounterAbsolute,
    releaseOccupancy,
    requiredEnv,
    releaseSourceReservation,
} = require("../common/quota-store");

async function desiredForCounter(counter) {
    if (counter.kind === "events") {
        const limit = extractLimit(
            await readEntitlement(counter.organizationId),
            "events",
        );
        const used = await calculateEventUsage(counter.organizationId, true);
        return {
            limit,
            used,
            reserved: 0,
            available: Math.max(0, limit - used),
        };
    }
    const limit = extractLimit(
        await readEntitlement(counter.organizationId),
        "stands",
    );
    const usage = await calculateStandUsage(counter.eventId, true);
    return {
        limit,
        ...usage,
        available: Math.max(0, limit - usage.used - usage.reserved),
    };
}

function differs(current, desired) {
    return ["limit", "used", "reserved", "available"].some(
        (key) => Number(current[key] || 0) !== Number(desired[key] || 0),
    );
}

async function expireReservations(apply) {
    const items = await scanAll({
        TableName: requiredEnv("QUOTA_RESERVATIONS_TABLE"),
        ConsistentRead: true,
        FilterExpression:
            "#status = :reserved AND (reservationExpiresAt <= :now OR invitationExpiresAt <= :now)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
            ":reserved": "reserved",
            ":now": Math.floor(Date.now() / 1000),
        },
    });
    const expired = [];
    for (const item of items) {
        expired.push(item.reservationId);
        if (!apply) {
            continue;
        }
        if (String(item.reservationId).startsWith("OCC#INVITATION#")) {
            await releaseOccupancy(
                "INVITATION",
                item.invitationId || item.resourceId,
                "reservation_expired",
            );
        } else if (String(item.reservationId).startsWith("RES#")) {
            await releaseSourceReservation(
                item.reservationId,
                "reservation_expired",
            );
        }
    }
    return expired;
}

async function reconcile({ apply = false } = {}) {
    // Release expired capacity before taking the counter snapshot; doing this
    // after repair would decrement capacity that has already been corrected.
    const expiredReservations = await expireReservations(apply);
    const counters = await scanAll({
        TableName: requiredEnv("QUOTA_COUNTERS_TABLE"),
        ConsistentRead: true,
    });
    const activeSources = await scanAll({
        TableName: requiredEnv("QUOTA_RESERVATIONS_TABLE"),
        ConsistentRead: true,
        FilterExpression:
            "#status = :reserved AND begins_with(reservationId, :source)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
            ":reserved": "reserved",
            ":source": "RES#",
        },
    });
    const busyCounters = new Set(activeSources.map((item) => item.counterKey));
    const deferredCounters = [];
    const drift = [];
    const conflicts = [];
    const errors = [];
    for (const counter of counters) {
        if (busyCounters.has(counter.counterKey)) {
            deferredCounters.push(counter.counterKey);
            continue;
        }
        try {
            const desired = await desiredForCounter(counter);
            if (!differs(counter, desired)) {
                continue;
            }
            const record = {
                counterKey: counter.counterKey,
                current: counter,
                desired,
            };
            drift.push(record);
            if (apply) {
                try {
                    await setCounterAbsolute(counter, counter, desired);
                } catch (error) {
                    conflicts.push({
                        counterKey: counter.counterKey,
                        error: error.name,
                    });
                }
            }
        } catch (error) {
            errors.push({
                counterKey: counter.counterKey,
                error: error.code || error.name,
                message: error.message,
            });
        }
    }
    const overLimit = drift.filter(
        (item) =>
            item.desired.used + item.desired.reserved > item.desired.limit,
    ).length;
    return {
        apply,
        checked: counters.length,
        drift,
        conflicts,
        errors,
        expiredReservations,
        deferredCounters,
        overLimit,
    };
}

// Metrics are emitted through CloudWatch Embedded Metric Format (EMF).
function publishMetrics(report) {
    const namespace = process.env.QUOTA_METRIC_NAMESPACE || "AI-Pavilion/Quota";
    const timestamp = Date.now();
    console.log(
        JSON.stringify({
            _aws: {
                Timestamp: timestamp,
                CloudWatchMetrics: [
                    {
                        Namespace: namespace,
                        Dimensions: [["Service"]],
                        Metrics: [
                            { Name: "QuotaDriftItems", Unit: "Count" },
                            {
                                Name: "QuotaReconciliationConflicts",
                                Unit: "Count",
                            },
                            {
                                Name: "QuotaReconciliationErrors",
                                Unit: "Count",
                            },
                            { Name: "QuotaOverLimitCounters", Unit: "Count" },
                            { Name: "QuotaExpiredReservations", Unit: "Count" },
                        ],
                    },
                ],
            },
            Service: "quota-reconciliation",
            QuotaDriftItems: report.drift.length,
            QuotaReconciliationConflicts: report.conflicts.length,
            QuotaReconciliationErrors: report.errors.length,
            QuotaOverLimitCounters: report.overLimit,
            QuotaExpiredReservations: report.expiredReservations.length,
        }),
    );
}

exports.reconcile = reconcile;
exports.handler = async () => {
    const report = await reconcile({
        apply:
            String(process.env.QUOTA_RECONCILIATION_APPLY || "true") === "true",
    });
    publishMetrics(report);
    if (report.errors.length) {
        throw new Error(
            `Quota reconciliation failed for ${report.errors.length} counter(s).`,
        );
    }
    return report;
};
