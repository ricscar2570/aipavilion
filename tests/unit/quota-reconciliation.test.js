"use strict";

jest.mock("../../backend/lambda/common/quota-store", () => ({
    scanAll: jest.fn(),
    calculateEventUsage: jest.fn(),
    calculateStandUsage: jest.fn(),
    readEntitlement: jest.fn(),
    extractLimit: jest.fn(),
    setCounterAbsolute: jest.fn(),
    releaseOccupancy: jest.fn(),
    releaseSourceReservation: jest.fn(),
    requiredEnv: (name) => name,
}));
const quota = require("../../backend/lambda/common/quota-store");
const {
    reconcile,
    handler,
} = require("../../backend/lambda/quota-reconciliation");
const eventCounter = {
    counterKey: "org-events",
    organizationId: "org",
    kind: "events",
    limit: 3,
    used: 0,
    reserved: 0,
    available: 3,
    revision: 1,
};
const standCounter = {
    ...eventCounter,
    counterKey: "event-stands",
    kind: "stands",
    eventId: "event",
};
let counters, expired, activeSources;
beforeEach(() => {
    jest.resetAllMocks();
    counters = [{ ...eventCounter }, { ...standCounter }];
    expired = [];
    activeSources = [];
    quota.scanAll.mockImplementation(
        async ({ TableName, ExpressionAttributeValues }) =>
            TableName === "QUOTA_COUNTERS_TABLE"
                ? counters
                : ExpressionAttributeValues[":source"]
                  ? activeSources
                  : expired,
    );
    quota.extractLimit.mockReturnValue(3);
    quota.readEntitlement.mockResolvedValue({});
    quota.calculateEventUsage.mockResolvedValue(0);
    quota.calculateStandUsage.mockResolvedValue({ used: 0, reserved: 0 });
});

test("a consistent snapshot produces no writes", async () => {
    const result = await reconcile();
    expect(result).toMatchObject({
        apply: false,
        checked: 2,
        drift: [],
        conflicts: [],
        errors: [],
        expiredReservations: [],
        overLimit: 0,
    });
    expect(quota.setCounterAbsolute).not.toHaveBeenCalled();
});
test("plan mode reports drift and expiry without mutating either", async () => {
    quota.calculateEventUsage.mockResolvedValue(2);
    quota.calculateStandUsage.mockResolvedValue({ used: 3, reserved: 1 });
    expired = [
        { reservationId: "OCC#INVITATION#i", invitationId: "i" },
        { reservationId: "RES#r" },
    ];
    const result = await reconcile();
    expect(result.drift).toHaveLength(2);
    expect(result.overLimit).toBe(1);
    expect(result.drift[0].desired).toEqual({
        limit: 3,
        used: 2,
        reserved: 0,
        available: 1,
    });
    expect(result.expiredReservations).toHaveLength(2);
    expect(quota.setCounterAbsolute).not.toHaveBeenCalled();
    expect(quota.releaseOccupancy).not.toHaveBeenCalled();
    expect(quota.releaseSourceReservation).not.toHaveBeenCalled();
});
test("apply uses conditional writes and releases each expired reservation by kind", async () => {
    quota.calculateEventUsage.mockResolvedValue(1);
    expired = [
        { reservationId: "OCC#INVITATION#i", resourceId: "i" },
        { reservationId: "RES#r" },
        { reservationId: "unrecognized" },
    ];
    await reconcile({ apply: true });
    expect(quota.setCounterAbsolute).toHaveBeenCalledWith(
        counters[0],
        counters[0],
        { limit: 3, used: 1, reserved: 0, available: 2 },
    );
    expect(quota.releaseOccupancy).toHaveBeenCalledWith(
        "INVITATION",
        "i",
        "reservation_expired",
    );
    expect(quota.releaseSourceReservation).toHaveBeenCalledWith(
        "RES#r",
        "reservation_expired",
    );
});
test("concurrent counter changes are reported without blindly overwriting them", async () => {
    quota.calculateEventUsage.mockResolvedValue(1);
    quota.setCounterAbsolute.mockRejectedValue(
        Object.assign(new Error("changed"), {
            name: "ConditionalCheckFailedException",
        }),
    );
    const result = await reconcile({ apply: true });
    expect(result.conflicts).toEqual([
        { counterKey: "org-events", error: "ConditionalCheckFailedException" },
    ]);
});
test("one failed counter does not prevent inspecting the others", async () => {
    quota.calculateEventUsage.mockRejectedValue(
        Object.assign(new Error("unavailable"), {
            code: "QUOTA_LIMIT_MISSING",
        }),
    );
    quota.calculateStandUsage.mockResolvedValue({ used: 1, reserved: 0 });
    const result = await reconcile();
    expect(result.errors).toEqual([
        {
            counterKey: "org-events",
            error: "QUOTA_LIMIT_MISSING",
            message: "unavailable",
        },
    ]);
    expect(result.drift).toHaveLength(1);
});
test("scheduled execution emits metrics and fails when a counter cannot be inspected", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    process.env.QUOTA_RECONCILIATION_APPLY = "false";
    expect((await handler()).apply).toBe(false);
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
        Service: "quota-reconciliation",
        QuotaDriftItems: 0,
    });
    quota.calculateEventUsage.mockRejectedValue(new Error("read failure"));
    await expect(handler()).rejects.toThrow("1 counter");
    delete process.env.QUOTA_RECONCILIATION_APPLY;
    log.mockRestore();
});

test("releases expired capacity before reading the snapshot and never repairs an in-flight writer", async () => {
    expired = [{ reservationId: "RES#expired" }];
    activeSources = [{ reservationId: "RES#busy", counterKey: "org-events" }];
    counters[0].reserved = 1;
    counters[0].available = 2;
    const result = await reconcile({ apply: true });
    expect(result.deferredCounters).toEqual(["org-events"]);
    expect(quota.calculateEventUsage).not.toHaveBeenCalled();
    expect(quota.setCounterAbsolute).not.toHaveBeenCalled();
    expect(
        quota.releaseSourceReservation.mock.invocationCallOrder[0],
    ).toBeLessThan(quota.scanAll.mock.invocationCallOrder[1]);
    expect(quota.calculateStandUsage).toHaveBeenCalledWith("event", true);
});
