"use strict";

const mockDynamoSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
    DynamoDBClient: jest.fn(() => ({ send: mockDynamoSend })),
    QueryCommand: jest.fn((input) => ({ type: "LowQuery", input })),
}));

jest.mock("@aws-sdk/lib-dynamodb", () => ({
    DynamoDBDocumentClient: {
        from: jest.fn(() => ({ send: mockDynamoSend })),
    },
    QueryCommand: jest.fn((input) => ({ type: "Query", input })),
    GetCommand: jest.fn((input) => ({ type: "Get", input })),
    PutCommand: jest.fn((input) => ({ type: "Put", input })),
    DeleteCommand: jest.fn((input) => ({ type: "Delete", input })),
}));

jest.mock("@aws-sdk/util-dynamodb", () => ({
    marshall: jest.fn((obj) => obj),
    unmarshall: jest.fn((obj) => obj),
}));

jest.mock("../../backend/lambda/common/cors", () => ({
    corsHeaders: jest.fn(() => ({ "Content-Type": "application/json" })),
    respond: jest.fn((status, body) => ({
        statusCode: status,
        body: JSON.stringify(body),
    })),
    preflight: jest.fn(() => ({ statusCode: 204, body: "" })),
}));

const savedHandler =
    require("../../backend/lambda/user-saved-stands/index").handler;
const statsHandler = require("../../backend/lambda/user-stats/index").handler;

function makeEvent(overrides = {}) {
    return {
        httpMethod: "GET",
        path: "/user/saved-stands",
        headers: { origin: "https://test.example.com" },
        queryStringParameters: null,
        body: null,
        requestContext: { authorizer: { claims: { sub: "user-abc" } } },
        ...overrides,
    };
}

function publicStand(overrides = {}) {
    return {
        stand_id: "stand-99",
        name: "Canonical Stand",
        image_url: "https://example.com/image.jpg",
        status: "approved",
        visibility: "public",
        ...overrides,
    };
}

beforeEach(() => mockDynamoSend.mockReset());

describe("user-saved-stands Lambda", () => {
    test("requires authentication", async () => {
        const response = await savedHandler(makeEvent({ requestContext: {} }));
        expect(response.statusCode).toBe(401);
    });

    test("lists newest saved stands with a cursor", async () => {
        mockDynamoSend.mockResolvedValue({
            Items: [
                {
                    userId: "user-abc",
                    standId: "s1",
                    name: "Alpha",
                    savedAt: "2026-01-02",
                },
            ],
            LastEvaluatedKey: {
                userId: "user-abc",
                standId: "s1",
                savedAt: "2026-01-02",
            },
        });
        const response = await savedHandler(makeEvent());
        const body = JSON.parse(response.body);
        expect(response.statusCode).toBe(200);
        expect(body.count).toBe(1);
        expect(body.nextCursor).toEqual(expect.any(String));
        expect(mockDynamoSend.mock.calls[0][0].input.IndexName).toBe(
            "user-saved-at-index",
        );
    });

    test("rejects invalid pagination cursors", async () => {
        const response = await savedHandler(
            makeEvent({ queryStringParameters: { cursor: "bad" } }),
        );
        expect(response.statusCode).toBe(400);
    });

    test("saves canonical stand data from a standId-only request", async () => {
        mockDynamoSend
            .mockResolvedValueOnce({ Item: publicStand() })
            .mockResolvedValueOnce({});
        const response = await savedHandler(
            makeEvent({
                httpMethod: "POST",
                body: JSON.stringify({ standId: "stand-99" }),
            }),
        );
        const body = JSON.parse(response.body);
        expect(response.statusCode).toBe(201);
        expect(body.stand.name).toBe("Canonical Stand");
        expect(body.stand.imageUrl).toBe("https://example.com/image.jpg");
        expect(mockDynamoSend.mock.calls[1][0].input.Item.schemaVersion).toBe(
            2,
        );
    });

    test("rejects browser-supplied saved-stand metadata", async () => {
        const response = await savedHandler(
            makeEvent({
                httpMethod: "POST",
                body: JSON.stringify({
                    standId: "stand-99",
                    name: "Forged Name",
                    imageUrl: "javascript:alert(1)",
                }),
            }),
        );
        expect(response.statusCode).toBe(400);
        expect(mockDynamoSend).not.toHaveBeenCalled();
    });

    test("does not save draft or missing stands", async () => {
        mockDynamoSend.mockResolvedValueOnce({
            Item: publicStand({ status: "draft" }),
        });
        const response = await savedHandler(
            makeEvent({
                httpMethod: "POST",
                body: JSON.stringify({ standId: "stand-99" }),
            }),
        );
        expect(response.statusCode).toBe(404);
    });

    test("deletes idempotently", async () => {
        mockDynamoSend.mockResolvedValue({});
        const response = await savedHandler(
            makeEvent({
                httpMethod: "DELETE",
                path: "/user/saved-stands/stand-99",
            }),
        );
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).deleted).toBe(true);
    });
});

describe("user-stats Lambda", () => {
    test("counts only paid orders", async () => {
        mockDynamoSend
            .mockResolvedValueOnce({
                Items: [
                    { status: "paid", amountInCents: 2000 },
                    { status: "pending", amountInCents: 5000 },
                    { status: "failed", amountInCents: 7000 },
                    { status: "cancelled", amountInCents: 9000 },
                ],
            })
            .mockResolvedValueOnce({ Count: 3 });
        const response = await statsHandler(makeEvent({ path: "/user/stats" }));
        const body = JSON.parse(response.body);
        expect(response.statusCode).toBe(200);
        expect(body.totalOrders).toBe(1);
        expect(body.totalSpent).toBe(20);
        expect(body.savedStands).toBe(3);
    });

    test("returns zeroes for a new user and 401 without claims", async () => {
        mockDynamoSend
            .mockResolvedValueOnce({ Items: [] })
            .mockResolvedValueOnce({ Count: 0 });
        const empty = await statsHandler(makeEvent({ path: "/user/stats" }));
        expect(JSON.parse(empty.body)).toEqual({
            totalOrders: 0,
            totalSpent: 0,
            savedStands: 0,
        });

        const unauthorized = await statsHandler(
            makeEvent({ path: "/user/stats", requestContext: {} }),
        );
        expect(unauthorized.statusCode).toBe(401);
    });
});
