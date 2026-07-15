"use strict";

const mockVerify = jest.fn();
const mockDynamoSend = jest.fn();
const mockCognitoSend = jest.fn();
const mockScanAll = jest.fn();
const mockScanPage = jest.fn();

process.env.COGNITO_USER_POOL_ID = "eu-west-1_TestPool";
process.env.COGNITO_CLIENT_ID = "client123456";

jest.mock("aws-jwt-verify", () => ({
    CognitoJwtVerifier: {
        create: jest.fn(() => ({ verify: mockVerify })),
    },
}));

jest.mock("@aws-sdk/client-dynamodb", () => ({
    DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock("@aws-sdk/lib-dynamodb", () => ({
    DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockDynamoSend })) },
    GetCommand: jest.fn((input) => ({ type: "Get", input })),
    PutCommand: jest.fn((input) => ({ type: "Put", input })),
    UpdateCommand: jest.fn((input) => ({ type: "Update", input })),
    DeleteCommand: jest.fn((input) => ({ type: "Delete", input })),
}));

jest.mock("@aws-sdk/client-cognito-identity-provider", () => ({
    CognitoIdentityProviderClient: jest.fn(() => ({ send: mockCognitoSend })),
    ListUsersCommand: jest.fn((input) => ({ type: "ListUsers", input })),
}));

jest.mock("../../backend/lambda/common/dynamo", () => ({
    scanAll: (...args) => mockScanAll(...args),
    scanPage: (...args) => mockScanPage(...args),
}));

const handler = require("../../backend/lambda/admin/index").handler;

function adminEvent(overrides = {}) {
    return {
        httpMethod: "GET",
        path: "/admin/dashboard",
        pathParameters: null,
        queryStringParameters: null,
        headers: {
            Authorization: "Bearer valid-token",
            origin: "http://localhost:3000",
        },
        body: null,
        ...overrides,
    };
}

beforeEach(() => {
    mockVerify
        .mockReset()
        .mockResolvedValue({ sub: "admin-1", "cognito:groups": ["admin"] });
    mockDynamoSend.mockReset();
    mockCognitoSend.mockReset();
    mockScanAll.mockReset();
    mockScanPage.mockReset();
});

describe("admin Lambda", () => {
    test("handles preflight without verifying a token", async () => {
        const response = await handler(adminEvent({ httpMethod: "OPTIONS" }));
        expect(response.statusCode).toBe(204);
        expect(mockVerify).not.toHaveBeenCalled();
    });

    test("rejects missing and non-admin tokens", async () => {
        const missing = await handler(adminEvent({ headers: {} }));
        expect(missing.statusCode).toBe(403);

        mockVerify.mockResolvedValue({
            sub: "user-1",
            "cognito:groups": ["visitor"],
        });
        const nonAdmin = await handler(adminEvent());
        expect(nonAdmin.statusCode).toBe(403);
    });

    test("returns 404 for an unknown admin route", async () => {
        const response = await handler(adminEvent({ path: "/admin/unknown" }));
        expect(response.statusCode).toBe(404);
    });

    test("builds dashboard totals from complete stand and order scans", async () => {
        mockScanAll.mockImplementation((_client, params) => {
            if (params.TableName.includes("stands")) {
                return Promise.resolve([
                    { stand_id: "s1" },
                    { stand_id: "s2" },
                ]);
            }
            return Promise.resolve([
                {
                    orderId: "o1",
                    amountInCents: 1200,
                    createdAt: "2026-07-01",
                    status: "paid",
                },
                {
                    orderId: "o2",
                    amountInCents: 800,
                    createdAt: "2026-07-02",
                    status: "pending",
                },
                {
                    orderId: "o3",
                    amountInCents: 900,
                    createdAt: "2026-07-03",
                    status: "failed",
                },
            ]);
        });
        mockCognitoSend
            .mockResolvedValueOnce({
                Users: [{ Username: "u1" }],
                PaginationToken: "next",
            })
            .mockResolvedValueOnce({ Users: [{ Username: "u2" }] });

        const response = await handler(adminEvent());
        const body = JSON.parse(response.body);
        expect(response.statusCode).toBe(200);
        expect(body.totalStands).toBe(2);
        expect(body.totalOrders).toBe(3);
        expect(body.paidOrders).toBe(1);
        expect(body.totalUsers).toBe(2);
        expect(body.totalRevenue).toBe(12);
        expect(body.recentActivity[0].id).toBe("o3");
    });

    test("lists stands with bounded pagination and rejects invalid cursors", async () => {
        const invalid = await handler(
            adminEvent({
                path: "/admin/stands",
                queryStringParameters: { cursor: "not-json" },
            }),
        );
        expect(invalid.statusCode).toBe(400);

        mockScanPage.mockResolvedValue({
            items: [{ stand_id: "s1" }],
            nextKey: { stand_id: "s1" },
        });
        const response = await handler(
            adminEvent({
                path: "/admin/stands",
                queryStringParameters: { limit: "999", status: "approved" },
            }),
        );
        const body = JSON.parse(response.body);
        expect(response.statusCode).toBe(200);
        expect(body.count).toBe(1);
        expect(body.nextCursor).toEqual(expect.any(String));
        expect(mockScanPage.mock.calls[0][1].Limit).toBe(100);
    });

    test("gets an existing stand and returns 404 for a missing one", async () => {
        mockDynamoSend.mockResolvedValueOnce({
            Item: { stand_id: "s1", name: "Alpha" },
        });
        const found = await handler(
            adminEvent({
                path: "/admin/stands/s1",
                pathParameters: { standId: "s1" },
            }),
        );
        expect(found.statusCode).toBe(200);

        mockDynamoSend.mockResolvedValueOnce({});
        const missing = await handler(
            adminEvent({
                path: "/admin/stands/missing",
                pathParameters: { standId: "missing" },
            }),
        );
        expect(missing.statusCode).toBe(404);
    });

    test("validates and creates a stand", async () => {
        const malformed = await handler(
            adminEvent({
                httpMethod: "POST",
                path: "/admin/stands",
                body: "{",
            }),
        );
        expect(malformed.statusCode).toBe(400);

        const incomplete = await handler(
            adminEvent({
                httpMethod: "POST",
                path: "/admin/stands",
                body: JSON.stringify({ name: "Alpha" }),
            }),
        );
        expect(incomplete.statusCode).toBe(400);

        mockDynamoSend.mockResolvedValue({});
        const created = await handler(
            adminEvent({
                httpMethod: "POST",
                path: "/admin/stands",
                body: JSON.stringify({ name: " Alpha ", booth_number: " A1 " }),
            }),
        );
        const body = JSON.parse(created.body);
        expect(created.statusCode).toBe(201);
        expect(body.name).toBe("Alpha");
        expect(body.stand_id).toMatch(/^stand_/);
    });

    test("updates and deletes only existing stands", async () => {
        const missingError = new Error("missing");
        missingError.name = "ConditionalCheckFailedException";
        mockDynamoSend.mockRejectedValueOnce(missingError);
        const updateMissing = await handler(
            adminEvent({
                httpMethod: "PUT",
                path: "/admin/stands/missing",
                pathParameters: { standId: "missing" },
                body: JSON.stringify({ name: "Updated" }),
            }),
        );
        expect(updateMissing.statusCode).toBe(404);

        mockDynamoSend.mockResolvedValueOnce({
            Attributes: { stand_id: "s1", name: "Updated" },
        });
        const updated = await handler(
            adminEvent({
                httpMethod: "PUT",
                path: "/admin/stands/s1",
                pathParameters: { standId: "s1" },
                body: JSON.stringify({ name: "Updated" }),
            }),
        );
        expect(updated.statusCode).toBe(200);

        mockDynamoSend.mockResolvedValueOnce({});
        const deleteMissing = await handler(
            adminEvent({
                httpMethod: "DELETE",
                path: "/admin/stands/missing",
                pathParameters: { standId: "missing" },
            }),
        );
        expect(deleteMissing.statusCode).toBe(404);

        mockDynamoSend.mockResolvedValueOnce({
            Attributes: { stand_id: "s1" },
        });
        const deleted = await handler(
            adminEvent({
                httpMethod: "DELETE",
                path: "/admin/stands/s1",
                pathParameters: { standId: "s1" },
            }),
        );
        expect(deleted.statusCode).toBe(200);
    });

    test("lists Cognito users without arbitrary attributes", async () => {
        mockCognitoSend.mockResolvedValue({
            Users: [
                {
                    Username: "alice",
                    Enabled: true,
                    UserStatus: "CONFIRMED",
                    Attributes: [
                        { Name: "email", Value: "alice@example.com" },
                        { Name: "custom:secret", Value: "hidden" },
                    ],
                },
            ],
            PaginationToken: "next-token",
        });
        const response = await handler(adminEvent({ path: "/admin/users" }));
        const body = JSON.parse(response.body);
        expect(response.statusCode).toBe(200);
        expect(body.users[0]).toEqual(
            expect.objectContaining({
                username: "alice",
                email: "alice@example.com",
            }),
        );
        expect(JSON.stringify(body)).not.toContain("custom:secret");
        expect(body.nextCursor).toEqual(expect.any(String));
    });

    test("lists orders without Stripe payment identifiers", async () => {
        mockScanPage.mockResolvedValue({
            items: [
                {
                    orderId: "o1",
                    paymentIntentId: "pi_private",
                    amountInCents: 500,
                },
            ],
            nextKey: null,
        });
        const response = await handler(adminEvent({ path: "/admin/orders" }));
        const body = JSON.parse(response.body);
        expect(response.statusCode).toBe(200);
        expect(body.orders[0].paymentIntentId).toBeUndefined();
    });

    test("aggregates bounded analytics from interaction records", async () => {
        mockScanAll
            .mockResolvedValueOnce([
                { stand_id: "s1", name: "Alpha", status: "approved" },
                { stand_id: "s2", name: "Beta", status: "pending" },
            ])
            .mockResolvedValueOnce([
                {
                    standId: "s1",
                    interactionType: "view",
                    userId: "u1",
                    createdAt: "2026-07-01T00:00:00.000Z",
                },
                {
                    standId: "s1",
                    interactionType: "view",
                    anonymousId: "a1",
                    createdAt: "2026-07-01T00:01:00.000Z",
                },
                {
                    standId: "s1",
                    interactionType: "contact",
                    userId: "u1",
                    createdAt: "2026-07-01T00:02:00.000Z",
                },
                {
                    standId: "s2",
                    interactionType: "click",
                    anonymousId: "a2",
                    createdAt: "2026-07-01T00:03:00.000Z",
                },
            ]);
        const response = await handler(
            adminEvent({
                path: "/admin/analytics",
                queryStringParameters: { days: "9999" },
            }),
        );
        const body = JSON.parse(response.body);
        expect(response.statusCode).toBe(200);
        expect(body.period).toBe("365 days");
        expect(body.stands.active).toBe(1);
        expect(body.totals).toEqual({ interactions: 4, views: 2, contacts: 1 });
        expect(body.topStands[0]).toEqual(
            expect.objectContaining({
                stand_id: "s1",
                views: 2,
                contacts: 1,
                interactions: 3,
                uniqueVisitors: 2,
            }),
        );
        expect(mockScanAll.mock.calls[1][1]).toEqual(
            expect.objectContaining({
                TableName: expect.stringContaining("interactions"),
                FilterExpression: "createdAt >= :cutoff",
            }),
        );
    });
});
