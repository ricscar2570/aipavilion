"use strict";

const mockSend = jest.fn();
jest.mock("@aws-sdk/client-dynamodb", () => ({ DynamoDBClient: jest.fn() }));
jest.mock("@aws-sdk/lib-dynamodb", () =>
    Object.fromEntries([
        ["DynamoDBDocumentClient", { from: () => ({ send: mockSend }) }],
        ...["Get", "Put", "Query", "Scan", "TransactWrite", "Update"].map(
            (type) => [type + "Command", jest.fn((input) => ({ type, input }))],
        ),
    ]),
);
const quota = require("../../backend/lambda/common/quota-store");
const counter = {
    counterKey: "ORG#org#EVENTS",
    organizationId: "org",
    limit: 3,
    used: 0,
    reserved: 0,
    available: 3,
    revision: 7,
};
const request = {
    organizationId: "org",
    actorUserId: "owner",
    idempotencyKey: "key",
    requestHash: "hash",
};

beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
    Object.assign(process.env, {
        QUOTA_COUNTERS_TABLE: "counters",
        QUOTA_RESERVATIONS_TABLE: "reservations",
        ENTITLEMENTS_TABLE: "entitlements",
        STANDS_TABLE: "stands",
        INVITATIONS_TABLE: "invitations",
    });
    jest.useFakeTimers().setSystemTime(new Date("2026-10-10T12:00:00Z"));
});
afterEach(() => jest.useRealTimers());

test("ISO and numeric expiry have the same boundary and invalid expiry fails closed", () => {
    const now = Date.now() / 1000;
    expect(quota.expirySeconds("2026-10-10T12:00:00Z")).toBe(now);
    for (const expiresAt of [now, String(now), new Date().toISOString()]) {
        expect(
            quota.invitationCountsAsReserved({ status: "pending", expiresAt }),
        ).toBe(false);
    }
    expect(quota.invitationCountsAsReserved({ expiresAt: now + 1 })).toBe(true);
    expect(() => quota.expirySeconds("invalid-date")).toThrow(
        "Invalid invitation expiry",
    );
});

test("usage excludes expired invitations regardless of their array index and bypasses stale indexes", async () => {
    process.env.EVENT_INVITATIONS_INDEX = "event-index";
    process.env.EVENT_STANDS_INDEX = "event-index";
    mockSend.mockImplementation(async ({ input }) => ({
        Items:
            input.TableName === "stands"
                ? [{ status: "draft" }, { status: "archived" }]
                : [
                      { expiresAt: "2026-10-09T00:00:00Z" },
                      { expiresAt: Date.now() / 1000 - 1 },
                      { expiresAt: "2026-10-11T00:00:00Z" },
                      { status: "accepted" },
                  ],
    }));
    await expect(quota.calculateStandUsage("event", true)).resolves.toEqual({
        used: 1,
        reserved: 1,
    });
    expect(
        mockSend.mock.calls.every(
            ([command]) =>
                command.type === "Scan" && command.input.ConsistentRead,
        ),
    ).toBe(true);
    delete process.env.EVENT_INVITATIONS_INDEX;
    delete process.env.EVENT_STANDS_INDEX;
});

test.each(["owner", "other"])(
    "an idempotency record belongs to its original actor: %s",
    async (actorUserId) => {
        mockSend.mockImplementation(async ({ input }) => ({
            Item:
                input.TableName === "counters"
                    ? counter
                    : input.TableName === "entitlements"
                      ? { maxActiveEvents: 3 }
                      : { requestHash: "hash", actorUserId: "owner" },
        }));
        if (actorUserId === "owner") {
            await expect(
                quota.reserveEventSlot({ ...request, actorUserId }),
            ).resolves.toMatchObject({ replay: true });
        } else {
            await expect(
                quota.reserveEventSlot({ ...request, actorUserId }),
            ).rejects.toMatchObject({
                code: "IDEMPOTENCY_KEY_REUSED",
                statusCode: 409,
            });
        }
        expect(
            mockSend.mock.calls.every(([command]) => command.type === "Get"),
        ).toBe(true);
    },
);

test("a raced reservation from a different actor is never replayed", async () => {
    let reads = 0;
    mockSend.mockImplementation(async ({ type, input }) => {
        if (type === "TransactWrite") {
            throw Object.assign(new Error("race"), {
                name: "TransactionCanceledException",
            });
        }
        if (input.TableName === "counters") {
            return { Item: counter };
        }
        if (input.TableName === "entitlements") {
            return { Item: { maxActiveEvents: 3 } };
        }
        return {
            Item:
                ++reads === 1
                    ? undefined
                    : { requestHash: "hash", actorUserId: "other" },
        };
    });
    await expect(quota.reserveEventSlot(request)).rejects.toMatchObject({
        statusCode: 409,
    });
});

test("linked invitation occupancy uses the invitation expiry without retaining the source deadline", async () => {
    mockSend
        .mockResolvedValueOnce({
            Item: {
                reservationId: "RES#source",
                status: "reserved",
                reservationExpiresAt: 100,
                actorUserId: "owner",
            },
        })
        .mockResolvedValueOnce({})
        .mockResolvedValue({});
    const result = await quota.linkInvitationReservation("RES#source", {
        invitationId: "invite",
        expiresAt: "2026-10-11T00:00:00Z",
    });
    expect(result.occupancy.invitationExpiresAt).toBe(
        Date.parse("2026-10-11T00:00:00Z") / 1000,
    );
    expect(result.occupancy.reservationExpiresAt).toBeUndefined();
});

test("repair rejects an ABA counter update even when the numerical counts match", async () => {
    mockSend.mockImplementation(async ({ input }) => {
        const concurrent = { ...counter, revision: 9 };
        if (
            input.ConditionExpression.includes(
                "#revision = :expectedRevision",
            ) &&
            input.ExpressionAttributeValues[":expectedRevision"] !==
                concurrent.revision
        ) {
            throw Object.assign(new Error("concurrent revision"), {
                name: "ConditionalCheckFailedException",
            });
        }
        return { Attributes: concurrent };
    });
    await expect(
        quota.setCounterAbsolute(counter, counter, {
            ...counter,
            used: 1,
            available: 2,
        }),
    ).rejects.toMatchObject({ name: "ConditionalCheckFailedException" });
});
