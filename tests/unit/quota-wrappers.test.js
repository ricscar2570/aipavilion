"use strict";

process.env.ALLOWED_ORIGIN = "https://example.com";

const mockSend = jest.fn();
jest.mock("@aws-sdk/client-dynamodb", () => ({ DynamoDBClient: jest.fn() }));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    GetCommand: jest.fn((input) => ({ type: "Get", input })),
    ScanCommand: jest.fn((input) => ({ type: "Scan", input })),
    QueryCommand: jest.fn((input) => ({ type: "Query", input })),
}));
jest.mock("../../backend/lambda/common/quota-store", () => ({
    documentClient: { send: mockSend },
    requestDigest: (value) =>
        require("crypto").createHash("sha256").update(value).digest("hex"),
    reserveEventSlot: jest.fn(),
    reserveStandSlot: jest.fn(),
    releaseSourceReservation: jest.fn(),
    releaseOccupancy: jest.fn(),
    consumeEventReservation: jest.fn(),
    storeResponse: jest.fn(),
    replayResponse: jest.fn(),
    linkInvitationReservation: jest.fn(),
    ensureInvitationOccupancy: jest.fn(),
    consumeInvitationReservation: jest.fn(),
}));
const quota = require("../../backend/lambda/common/quota-store");
const events = require("../../backend/lambda/events/quota-wrapper");
const invitations = require("../../backend/lambda/invitations/invite-wrapper");
const { QuotaError } = require("../../backend/lambda/common/quota-model");

const membership = {
    userId: "owner",
    organizationId: "org-a",
    status: "active",
    role: "owner",
};
const invitation = {
    invitationId: "inv-a",
    organizationId: "org-a",
    eventId: "evt-a",
    email: "owner@example.com",
    status: "pending",
    expiresAt: "2099-01-01T00:00:00Z",
};
let records;
function request(resource, body = {}, parameters = {}) {
    return {
        httpMethod: "POST",
        resource,
        pathParameters: {
            organizationId: "org-a",
            eventId: "evt-a",
            ...parameters,
        },
        headers: {
            Origin: "https://example.com",
            "Idempotency-Key": "request-a",
        },
        requestContext: { authorizer: { claims: { sub: "owner" } } },
        body: JSON.stringify(body),
    };
}
const createEvent = () =>
    request(
        "/organizations/{organizationId}/events",
        { name: "Fair" },
        { eventId: undefined },
    );
const createInvite = () =>
    request("/organizations/{organizationId}/events/{eventId}/invitations", {
        email: "OWNER@example.com",
    });
const acceptInvite = () =>
    request(
        "/invitations/{invitationId}/accept",
        {},
        { invitationId: "inv-a" },
    );
function response(statusCode, body) {
    return { statusCode, body: JSON.stringify(body) };
}
function errorCode(result) {
    return JSON.parse(result.body).error.code;
}

beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(process.env, {
        MEMBERSHIPS_TABLE: "memberships",
        EVENTS_TABLE: "events",
        INVITATIONS_TABLE: "invitations",
        USERS_TABLE: "users",
        ALLOWED_ORIGIN: "https://example.com",
    });
    delete process.env.ORGANIZATION_MEMBERS_INDEX;
    records = {
        memberships: { ...membership },
        events: { eventId: "evt-a", organizationId: "org-a" },
        invitations: { ...invitation },
        users: {
            userId: "owner",
            email: "owner@example.com",
            emailVerified: true,
        },
    };
    mockSend.mockReset().mockImplementation(async ({ type, input }) =>
        type === "Get"
            ? { Item: records[input.TableName] }
            : {
                  Items: records[input.TableName]
                      ? [records[input.TableName]]
                      : [],
              },
    );
    for (const name of [
        "releaseSourceReservation",
        "releaseOccupancy",
        "consumeEventReservation",
        "storeResponse",
        "linkInvitationReservation",
        "ensureInvitationOccupancy",
        "consumeInvitationReservation",
    ]) {
        quota[name].mockReset().mockResolvedValue({});
    }
    quota.reserveEventSlot.mockReset().mockResolvedValue({
        reservation: { reservationId: "res-event", status: "reserved" },
        replay: false,
    });
    quota.reserveStandSlot.mockReset().mockResolvedValue({
        reservation: { reservationId: "res-invite", status: "reserved" },
        replay: false,
    });
    quota.replayResponse.mockReset().mockReturnValue(null);
});

describe("event quota boundary", () => {
    test("requires a callable handler and passes unrelated requests through", async () => {
        expect(() => events.wrap(null)).toThrow(TypeError);
        const base = jest.fn().mockResolvedValue(response(200, {}));
        const input = {
            httpMethod: "GET",
            path: "/organizations/org-a/events",
        };
        await expect(events.wrap(base)(input)).resolves.toEqual(
            response(200, {}),
        );
        expect(base).toHaveBeenCalledWith(input, undefined);
        expect(quota.reserveEventSlot).not.toHaveBeenCalled();
    });
    test("authorizes before capacity reservation, then consumes and stores the result", async () => {
        const result = response(201, { event: { eventId: "evt-new" } });
        const base = jest.fn().mockResolvedValue(result);
        expect(await events.wrap(base)(createEvent())).toBe(result);
        expect(quota.reserveEventSlot).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: "org-a",
                actorUserId: "owner",
                idempotencyKey: "request-a",
            }),
        );
        expect(quota.consumeEventReservation).toHaveBeenCalledWith(
            "res-event",
            "evt-new",
        );
        expect(quota.storeResponse).toHaveBeenCalledWith("res-event", result);
        expect(mockSend.mock.invocationCallOrder[0]).toBeLessThan(
            quota.reserveEventSlot.mock.invocationCallOrder[0],
        );
    });
    test.each([
        null,
        { ...membership, role: "exhibitor" },
        { ...membership, status: "suspended" },
    ])(
        "rejects unauthorized members before reservation or replay",
        async (member) => {
            records.memberships = member;
            const base = jest.fn();
            const result = await events.wrap(base)(createEvent());
            expect(result.statusCode).toBe(403);
            expect(quota.reserveEventSlot).not.toHaveBeenCalled();
            expect(base).not.toHaveBeenCalled();
            expect(result.headers["Access-Control-Allow-Origin"]).toBe(
                "https://example.com",
            );
        },
    );
    test("rejects unauthenticated requests without a database read", async () => {
        const input = createEvent();
        input.requestContext = {};
        expect((await events.wrap(jest.fn())(input)).statusCode).toBe(401);
        expect(mockSend).not.toHaveBeenCalled();
    });
    test("duplication checks source ownership before reserving quota", async () => {
        records.events.organizationId = "org-other";
        const result = await events.wrap(jest.fn())(
            request(
                "/organizations/{organizationId}/events/{eventId}/duplicate",
            ),
        );
        expect(result.statusCode).toBe(404);
        expect(quota.reserveEventSlot).not.toHaveBeenCalled();
    });
    test("a valid duplicate and an absent explicit key preserve the request identity", async () => {
        const input = request(
            "/organizations/{organizationId}/events/{eventId}/duplicate",
        );
        input.headers = {};
        expect(
            (
                await events.wrap(
                    jest.fn().mockResolvedValue({
                        statusCode: 201,
                        body: { id: "copy" },
                    }),
                )(input)
            ).statusCode,
        ).toBe(201);
        expect(quota.reserveEventSlot.mock.calls[0][0].idempotencyKey).toMatch(
            /^auto:event-duplicate:/,
        );
    });
    test.each(["reserved", "released", "linked"])(
        "an existing %s request never executes the writer twice",
        async (status) => {
            quota.reserveEventSlot.mockResolvedValue({
                replay: true,
                reservation: { status },
            });
            const base = jest.fn();
            const result = await events.wrap(base)(createEvent());
            expect(errorCode(result)).toBe("IDEMPOTENCY_RECOVERY_REQUIRED");
            expect(base).not.toHaveBeenCalled();
        },
    );
    test("replays a completed response or a known resource", async () => {
        quota.reserveEventSlot.mockResolvedValue({
            replay: true,
            reservation: { status: "linked", resourceId: "evt-known" },
        });
        const base = jest.fn();
        const result = await events.wrap(base)(createEvent());
        expect(JSON.parse(result.body).eventId).toBe("evt-known");
        quota.replayResponse.mockReturnValue(
            response(201, { eventId: "stored" }),
        );
        expect(await events.wrap(base)(createEvent())).toMatchObject({
            ...response(201, { eventId: "stored" }),
            headers: {
                "Access-Control-Allow-Origin": "https://example.com",
                "Idempotency-Replayed": "true",
            },
        });
        expect(base).not.toHaveBeenCalled();
    });
    test("releases a rejected writer operation", async () => {
        const result = response(400, { error: "bad input" });
        expect(
            await events.wrap(jest.fn().mockResolvedValue(result))(
                createEvent(),
            ),
        ).toBe(result);
        expect(quota.releaseSourceReservation).toHaveBeenCalledWith(
            "res-event",
            "legacy_status_400",
        );
    });
    test.each([undefined, "not-json", "{}"])(
        "holds capacity when a successful writer returns no identifier (%s)",
        async (body) => {
            const result = await events.wrap(
                jest.fn().mockResolvedValue({ statusCode: 201, body }),
            )(createEvent());
            expect(errorCode(result)).toBe("EVENT_ID_MISSING");
            expect(quota.releaseSourceReservation).not.toHaveBeenCalled();
        },
    );
    test("holds capacity after a successful write if consumption fails", async () => {
        quota.consumeEventReservation.mockRejectedValue(
            new Error("private database detail"),
        );
        const result = await events.wrap(
            jest.fn().mockResolvedValue(response(201, { eventId: "created" })),
        )(createEvent());
        expect(result.statusCode).toBe(500);
        expect(result.body).not.toContain("private database detail");
        expect(quota.releaseSourceReservation).not.toHaveBeenCalled();
    });
    test("writer exceptions are compensated, including a failed compensation", async () => {
        quota.releaseSourceReservation.mockRejectedValue(new Error("cleanup"));
        const result = await events.wrap(
            jest.fn().mockRejectedValue(new Error("private")),
        )(createEvent());
        expect(result.statusCode).toBe(500);
        expect(quota.releaseSourceReservation).toHaveBeenCalledWith(
            "res-event",
            "exception",
        );
    });
    test("quota conflicts do not invoke the writer", async () => {
        quota.reserveEventSlot.mockRejectedValue(
            new QuotaError("QUOTA_EXCEEDED", "Capacity reached", 409),
        );
        const base = jest.fn();
        expect(errorCode(await events.wrap(base)(createEvent()))).toBe(
            "QUOTA_EXCEEDED",
        );
        expect(base).not.toHaveBeenCalled();
    });
    test.each([200, 409])(
        "archive releases occupancy only after a successful archive (%s)",
        async (status) => {
            await events.wrap(
                jest.fn().mockResolvedValue(response(status, {})),
            )(
                request(
                    "/organizations/{organizationId}/events/{eventId}/archive",
                ),
            );
            expect(quota.releaseOccupancy).toHaveBeenCalledTimes(
                status === 200 ? 1 : 0,
            );
        },
    );
});

describe("invitation quota boundary", () => {
    test("validates the handler and passes list requests through", async () => {
        expect(() => invitations.wrap(1)).toThrow(TypeError);
        const base = jest.fn().mockResolvedValue(response(200, {}));
        await invitations.wrap(base)({
            httpMethod: "GET",
            path: "/invitations",
        });
        expect(base).toHaveBeenCalledTimes(1);
        expect(quota.reserveStandSlot).not.toHaveBeenCalled();
    });
    test.each([null, "invalid-json", "{}"])(
        "invalid invitation input cannot reserve capacity (%s)",
        async (body) => {
            const input = createInvite();
            input.body = body;
            expect(errorCode(await invitations.wrap(jest.fn())(input))).toBe(
                "INVITATION_INPUT_INVALID",
            );
            expect(quota.reserveStandSlot).not.toHaveBeenCalled();
        },
    );
    test("creates one reserved invitation with normalized identity and expiry", async () => {
        const result = response(201, {
            invitation: {
                invitationId: "inv-new",
                expiresAt: invitation.expiresAt,
            },
        });
        const input = createInvite();
        input.headers = {};
        input.body = { recipientEmail: "owner@example.com" };
        expect(
            await invitations.wrap(jest.fn().mockResolvedValue(result))(input),
        ).toBe(result);
        expect(quota.reserveStandSlot.mock.calls[0][0].idempotencyKey).toMatch(
            /^auto:invitation-create:/,
        );
        expect(quota.linkInvitationReservation).toHaveBeenCalledWith(
            "res-invite",
            { invitationId: "inv-new", expiresAt: invitation.expiresAt },
        );
    });
    test("an outsider cannot create, reserve, or replay another tenant's invitation", async () => {
        records.memberships = undefined;
        const base = jest.fn();
        expect((await invitations.wrap(base)(createInvite())).statusCode).toBe(
            403,
        );
        expect(quota.reserveStandSlot).not.toHaveBeenCalled();
        expect(base).not.toHaveBeenCalled();
    });
    test.each(["reserved", "linked"])(
        "an existing %s invitation request cannot call the writer again",
        async (status) => {
            quota.reserveStandSlot.mockResolvedValue({
                replay: true,
                reservation: { status },
            });
            const base = jest.fn();
            expect(
                errorCode(await invitations.wrap(base)(createInvite())),
            ).toBe("IDEMPOTENCY_RECOVERY_REQUIRED");
            expect(base).not.toHaveBeenCalled();
        },
    );
    test("replays an invitation identifier or stored response", async () => {
        quota.reserveStandSlot.mockResolvedValue({
            replay: true,
            reservation: { status: "linked", resourceId: "inv-old" },
        });
        const base = jest.fn();
        expect(
            JSON.parse((await invitations.wrap(base)(createInvite())).body)
                .invitationId,
        ).toBe("inv-old");
        quota.replayResponse.mockReturnValue(
            response(201, { invitationId: "stored" }),
        );
        expect(await invitations.wrap(base)(createInvite())).toMatchObject({
            ...response(201, { invitationId: "stored" }),
            headers: {
                "Access-Control-Allow-Origin": "https://example.com",
                "Idempotency-Replayed": "true",
            },
        });
        expect(base).not.toHaveBeenCalled();
    });
    test("a rejected invitation releases its reservation", async () => {
        expect(
            (
                await invitations.wrap(
                    jest.fn().mockResolvedValue(response(422, {})),
                )(createInvite())
            ).statusCode,
        ).toBe(422);
        expect(quota.releaseSourceReservation).toHaveBeenCalledWith(
            "res-invite",
            "legacy_status_422",
        );
    });
    test("missing IDs and post-write failures retain capacity for recovery", async () => {
        const base = jest
            .fn()
            .mockResolvedValue({ statusCode: 201, body: "invalid" });
        expect(errorCode(await invitations.wrap(base)(createInvite()))).toBe(
            "INVITATION_ID_MISSING",
        );
        quota.linkInvitationReservation.mockRejectedValue(new Error("private"));
        base.mockResolvedValue(response(201, { invitationId: "new" }));
        expect((await invitations.wrap(base)(createInvite())).statusCode).toBe(
            500,
        );
        expect(quota.releaseSourceReservation).not.toHaveBeenCalled();
    });
    test("writer failure is compensated even when cleanup also fails", async () => {
        quota.releaseSourceReservation.mockRejectedValue(new Error("cleanup"));
        expect(
            (
                await invitations.wrap(
                    jest.fn().mockRejectedValue(new Error("private")),
                )(createInvite())
            ).statusCode,
        ).toBe(500);
        expect(quota.releaseSourceReservation).toHaveBeenCalledWith(
            "res-invite",
            "exception",
        );
    });
    test("accepts a verified matching profile and consumes exactly its invitation", async () => {
        const result = response(200, { stand: { standId: "stand-new" } });
        expect(
            await invitations.wrap(jest.fn().mockResolvedValue(result))(
                acceptInvite(),
            ),
        ).toBe(result);
        expect(quota.consumeInvitationReservation).toHaveBeenCalledWith(
            "inv-a",
            "stand-new",
        );
    });
    test.each(["inactive", "suspended", "pending"])(
        "blocks %s membership before consuming capacity",
        async (status) => {
            records.memberships.status = status;
            const base = jest.fn();
            expect(
                errorCode(await invitations.wrap(base)(acceptInvite())),
            ).toBe("MEMBERSHIP_REACTIVATION_REQUIRED");
            expect(quota.ensureInvitationOccupancy).not.toHaveBeenCalled();
            expect(base).not.toHaveBeenCalled();
        },
    );
    test("first-time member may accept; another email identity may not", async () => {
        records.memberships = undefined;
        const base = jest
            .fn()
            .mockResolvedValue(response(200, { standId: "stand-new" }));
        expect((await invitations.wrap(base)(acceptInvite())).statusCode).toBe(
            200,
        );
        records.users.email = "other@example.com";
        expect((await invitations.wrap(base)(acceptInvite())).statusCode).toBe(
            403,
        );
        expect(base).toHaveBeenCalledTimes(1);
    });
    test("unauthenticated accept performs no reads; missing IDs fail explicitly", async () => {
        const input = acceptInvite();
        input.requestContext = {};
        expect((await invitations.wrap(jest.fn())(input)).statusCode).toBe(401);
        expect(mockSend).not.toHaveBeenCalled();
        const missing = acceptInvite();
        delete missing.pathParameters.invitationId;
        expect(errorCode(await invitations.wrap(jest.fn())(missing))).toBe(
            "INVITATION_ID_REQUIRED",
        );
    });
    test("expired invitation releases its occupancy without executing the writer", async () => {
        records.invitations.expiresAt = "2020-01-01T00:00:00Z";
        quota.releaseOccupancy.mockRejectedValue(new Error("cleanup"));
        const base = jest.fn();
        expect(errorCode(await invitations.wrap(base)(acceptInvite()))).toBe(
            "INVITATION_EXPIRED",
        );
        expect(quota.releaseOccupancy).toHaveBeenCalledWith(
            "INVITATION",
            "inv-a",
            "invitation_expired",
        );
        expect(base).not.toHaveBeenCalled();
    });
    test("rejected acceptance and missing stand IDs never consume a slot", async () => {
        const base = jest.fn().mockResolvedValue(response(409, {}));
        expect((await invitations.wrap(base)(acceptInvite())).statusCode).toBe(
            409,
        );
        base.mockResolvedValue({ statusCode: 200, body: {} });
        expect(errorCode(await invitations.wrap(base)(acceptInvite()))).toBe(
            "STAND_ID_MISSING",
        );
        expect(quota.consumeInvitationReservation).not.toHaveBeenCalled();
    });
    test.each([200, 403])(
        "revocation releases a slot only after success (%s)",
        async (status) => {
            const input = request(
                "/organizations/{organizationId}/events/{eventId}/invitations/{invitationId}",
                {},
                { invitationId: "inv-a" },
            );
            input.httpMethod = "DELETE";
            await invitations.wrap(
                jest.fn().mockResolvedValue(response(status, {})),
            )(input);
            expect(quota.releaseOccupancy).toHaveBeenCalledTimes(
                status === 200 ? 1 : 0,
            );
        },
    );
    test("resend checks ownership and pending state before reserving", async () => {
        const input = request(
            "/organizations/{organizationId}/events/{eventId}/invitations/{invitationId}/resend",
            {},
            { invitationId: "inv-a" },
        );
        const base = jest.fn().mockResolvedValue(response(200, {}));
        expect((await invitations.wrap(base)(input)).statusCode).toBe(200);
        records.invitations.status = "accepted";
        expect(errorCode(await invitations.wrap(base)(input))).toBe(
            "INVITATION_NOT_PENDING",
        );
        records.invitations = { ...invitation, organizationId: "other" };
        expect((await invitations.wrap(base)(input)).statusCode).toBe(404);
        records.invitations = undefined;
        expect((await invitations.wrap(base)(input)).statusCode).toBe(404);
        expect(base).toHaveBeenCalledTimes(1);
    });
    test("paginates membership scans and index queries", async () => {
        const defaults = mockSend.getMockImplementation();
        let pages = 0;
        mockSend.mockImplementation(async (command) => {
            if (
                command.type === "Scan" &&
                command.input.TableName === "memberships" &&
                pages++ === 0
            ) {
                return { Items: [], LastEvaluatedKey: { userId: "previous" } };
            }
            return defaults(command);
        });
        const base = jest
            .fn()
            .mockResolvedValue(response(200, { standId: "s" }));
        expect((await invitations.wrap(base)(acceptInvite())).statusCode).toBe(
            200,
        );
        process.env.ORGANIZATION_MEMBERS_INDEX = "org-index";
        expect((await invitations.wrap(base)(acceptInvite())).statusCode).toBe(
            200,
        );
        expect(mockSend.mock.calls.some(([c]) => c.type === "Query")).toBe(
            true,
        );
    });
    test("database failures return a safe error and do not invoke the writer", async () => {
        mockSend.mockRejectedValue(
            Object.assign(new Error("private"), {
                name: "AccessDeniedException",
            }),
        );
        const base = jest.fn();
        const result = await invitations.wrap(base)(acceptInvite());
        expect(result.statusCode).toBe(500);
        expect(result.body).not.toContain("private");
        expect(base).not.toHaveBeenCalled();
    });
});
