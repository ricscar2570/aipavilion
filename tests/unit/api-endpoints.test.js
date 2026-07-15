"use strict";

const mockSend = jest.fn();
const mockScanAll = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
    DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock("@aws-sdk/lib-dynamodb", () => ({
    DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
    GetCommand: jest.fn((input) => ({ type: "Get", input })),
    PutCommand: jest.fn((input) => ({ type: "Put", input })),
    QueryCommand: jest.fn((input) => ({ type: "Query", input })),
}));

jest.mock("../../backend/lambda/common/dynamo", () => ({
    scanAll: (...args) => mockScanAll(...args),
}));

const getStands = require("../../backend/lambda/get-stands/index").handler;
const getStandDetail =
    require("../../backend/lambda/get-stand-detail/index").handler;
const searchStands =
    require("../../backend/lambda/search-stands/index").handler;
const trackInteraction =
    require("../../backend/lambda/track-interaction/index").handler;
const contactStand =
    require("../../backend/lambda/contact-stand/index").handler;
const userOrders = require("../../backend/lambda/user-orders/index").handler;

function publicStand(overrides = {}) {
    return {
        stand_id: "s1",
        name: "Alpha",
        status: "approved",
        visibility: "public",
        ...overrides,
    };
}

function event(overrides = {}) {
    return {
        httpMethod: "GET",
        path: "/stands",
        headers: { origin: "http://localhost:3000" },
        queryStringParameters: null,
        pathParameters: null,
        requestContext: { authorizer: { claims: { sub: "user-1" } } },
        body: null,
        ...overrides,
    };
}

beforeEach(() => {
    mockSend.mockReset();
    mockScanAll.mockReset();
});

describe("public stand endpoints", () => {
    test("lists only public approved/published stands", async () => {
        mockSend.mockResolvedValue({
            Items: [
                publicStand({
                    is_sponsored: true,
                    ownerId: "private-owner",
                    internalNotes: "private-note",
                    products: [
                        {
                            id: "p1",
                            name: "Game",
                            priceInCents: 1000,
                            wholesaleCost: 100,
                        },
                    ],
                }),
                publicStand({ stand_id: "s2", status: "published" }),
                publicStand({ stand_id: "draft", status: "draft" }),
                publicStand({ stand_id: "private", visibility: "private" }),
            ],
        });
        const response = await getStands(event());
        const body = JSON.parse(response.body);
        expect(body.count).toBe(2);
        expect(body.stands.map((stand) => stand.stand_id)).toEqual([
            "s1",
            "s2",
        ]);
        expect(body.stands[0].ownerId).toBeUndefined();
        expect(body.stands[0].internalNotes).toBeUndefined();
        expect(body.stands[0].products[0].wholesaleCost).toBeUndefined();
    });

    test("filters sponsored only after visibility filtering", async () => {
        mockSend.mockResolvedValue({
            Items: [
                publicStand({ is_sponsored: true }),
                publicStand({
                    stand_id: "draft",
                    status: "draft",
                    is_sponsored: true,
                }),
            ],
        });
        const response = await getStands(event({ path: "/stands/sponsored" }));
        expect(JSON.parse(response.body).count).toBe(1);
    });

    test("returns public detail and hides non-public detail as 404", async () => {
        mockSend.mockResolvedValueOnce({ Item: publicStand() });
        const found = await getStandDetail(
            event({ path: "/stands/s1", pathParameters: { standId: "s1" } }),
        );
        expect(found.statusCode).toBe(200);

        mockSend.mockResolvedValueOnce({
            Item: publicStand({ status: "draft" }),
        });
        const hidden = await getStandDetail(
            event({ path: "/stands/s1", pathParameters: { standId: "s1" } }),
        );
        expect(hidden.statusCode).toBe(404);
    });

    test("search excludes hidden stands", async () => {
        mockSend.mockResolvedValue({
            Items: [
                publicStand({ name: "Strategy Games", tags: ["strategy"] }),
                publicStand({
                    stand_id: "draft",
                    name: "Strategy Draft",
                    status: "draft",
                }),
            ],
        });
        const response = await searchStands(
            event({
                path: "/stands/search",
                queryStringParameters: { q: "strategy" },
            }),
        );
        const body = JSON.parse(response.body);
        expect(body.count).toBe(1);
        expect(body.stands[0].stand_id).toBe("s1");
    });

    test("handles validation and backend errors safely", async () => {
        const missing = await searchStands(event({ path: "/stands/search" }));
        expect(missing.statusCode).toBe(400);
        mockSend.mockRejectedValue(new Error("secret database detail"));
        const failed = await getStands(event());
        expect(failed.statusCode).toBe(500);
        expect(failed.body).not.toContain("secret database detail");
    });
});

describe("interaction tracking", () => {
    const requestBody = {
        standId: "s1",
        interactionType: "view",
        clientRequestId: "interaction-request-0001",
        sessionId: "anonymous-session",
    };

    test("rejects purchase and missing client request IDs", async () => {
        const purchase = await trackInteraction(
            event({
                httpMethod: "POST",
                body: JSON.stringify({
                    ...requestBody,
                    interactionType: "purchase",
                }),
            }),
        );
        const missing = await trackInteraction(
            event({
                httpMethod: "POST",
                body: JSON.stringify({
                    standId: "s1",
                    interactionType: "view",
                }),
            }),
        );
        expect(purchase.statusCode).toBe(400);
        expect(missing.statusCode).toBe(400);
    });

    test("requires matching interaction identifiers and rejects extra fields", async () => {
        const missingHeader = await trackInteraction(
            event({
                httpMethod: "POST",
                body: JSON.stringify(requestBody),
            }),
        );
        const mismatch = await trackInteraction(
            event({
                httpMethod: "POST",
                headers: { "X-Interaction-Id": "interaction-request-0002" },
                body: JSON.stringify(requestBody),
            }),
        );
        const extra = await trackInteraction(
            event({
                httpMethod: "POST",
                headers: { "X-Interaction-Id": requestBody.clientRequestId },
                body: JSON.stringify({ ...requestBody, value: 1 }),
            }),
        );
        expect(missingHeader.statusCode).toBe(400);
        expect(mismatch.statusCode).toBe(400);
        expect(extra.statusCode).toBe(400);
        expect(mockSend).not.toHaveBeenCalled();
    });

    test("derives user identity from claims and validates the stand", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: publicStand() })
            .mockResolvedValueOnce({});
        const response = await trackInteraction(
            event({
                httpMethod: "POST",
                headers: { "X-Interaction-Id": requestBody.clientRequestId },
                body: JSON.stringify(requestBody),
            }),
        );
        expect(response.statusCode).toBe(201);
        const stored = mockSend.mock.calls[1][0].input.Item;
        expect(stored.userId).toBe("user-1");

        const forged = await trackInteraction(
            event({
                httpMethod: "POST",
                headers: { "X-Interaction-Id": requestBody.clientRequestId },
                body: JSON.stringify({ ...requestBody, userId: "forged" }),
            }),
        );
        expect(forged.statusCode).toBe(400);
    });

    test("deduplicates an interaction and hides draft stands", async () => {
        const duplicate = new Error("duplicate");
        duplicate.name = "ConditionalCheckFailedException";
        mockSend
            .mockResolvedValueOnce({ Item: publicStand() })
            .mockRejectedValueOnce(duplicate);
        const response = await trackInteraction(
            event({
                httpMethod: "POST",
                headers: { "X-Interaction-Id": requestBody.clientRequestId },
                body: JSON.stringify(requestBody),
            }),
        );
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).duplicate).toBe(true);

        mockSend.mockResolvedValueOnce({
            Item: publicStand({ status: "draft" }),
        });
        const hidden = await trackInteraction(
            event({
                httpMethod: "POST",
                headers: { "X-Interaction-Id": requestBody.clientRequestId },
                body: JSON.stringify(requestBody),
            }),
        );
        expect(hidden.statusCode).toBe(404);
    });
});

describe("stand contact leads", () => {
    const requestId = "lead-request-00000001";
    const body = {
        standId: "s1",
        name: "Visitor",
        email: "visitor@example.com",
        message: "Please contact me about your games.",
        privacyAccepted: true,
        website: "",
        clientRequestId: requestId,
    };

    test("creates a canonical lead only for public stands", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: publicStand() })
            .mockResolvedValueOnce({});
        const response = await contactStand(
            event({
                httpMethod: "POST",
                path: "/stands/contact",
                headers: { "Idempotency-Key": requestId },
                body: JSON.stringify(body),
            }),
        );
        expect(response.statusCode).toBe(201);
        expect(mockSend.mock.calls[1][0].input.Item.schemaVersion).toBe(3);
    });

    test("requires matching lead idempotency identifiers and an exact schema", async () => {
        const missingHeader = await contactStand(
            event({
                httpMethod: "POST",
                path: "/stands/contact",
                body: JSON.stringify(body),
            }),
        );
        const mismatch = await contactStand(
            event({
                httpMethod: "POST",
                path: "/stands/contact",
                headers: { "Idempotency-Key": "lead-request-00000002" },
                body: JSON.stringify(body),
            }),
        );
        const extra = await contactStand(
            event({
                httpMethod: "POST",
                path: "/stands/contact",
                headers: { "Idempotency-Key": requestId },
                body: JSON.stringify({ ...body, role: "admin" }),
            }),
        );
        expect(missingHeader.statusCode).toBe(400);
        expect(mismatch.statusCode).toBe(400);
        expect(extra.statusCode).toBe(400);
        expect(mockSend).not.toHaveBeenCalled();
    });

    test("honeypot submissions are accepted without persistence", async () => {
        const response = await contactStand(
            event({
                httpMethod: "POST",
                path: "/stands/contact",
                body: JSON.stringify({ ...body, website: "https://spam.test" }),
            }),
        );
        expect(response.statusCode).toBe(202);
        expect(mockSend).not.toHaveBeenCalled();
    });

    test("deduplicates lead requests", async () => {
        const duplicate = new Error("duplicate");
        duplicate.name = "ConditionalCheckFailedException";
        mockSend
            .mockResolvedValueOnce({ Item: publicStand() })
            .mockRejectedValueOnce(duplicate);
        const response = await contactStand(
            event({
                httpMethod: "POST",
                path: "/stands/contact",
                headers: { "Idempotency-Key": requestId },
                body: JSON.stringify(body),
            }),
        );
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).duplicate).toBe(true);
    });
});

describe("user orders", () => {
    test("requires authentication", async () => {
        const response = await userOrders(
            event({ path: "/user/orders", requestContext: {} }),
        );
        expect(response.statusCode).toBe(401);
    });

    test("returns a paginated safe order list", async () => {
        mockSend.mockResolvedValue({
            Items: [
                {
                    orderId: "o1",
                    userId: "user-1",
                    status: "paid",
                    paymentIntentId: "private",
                    customerEmail: "private@example.com",
                },
            ],
        });
        const response = await userOrders(event({ path: "/user/orders" }));
        const order = JSON.parse(response.body).orders[0];
        expect(response.statusCode).toBe(200);
        expect(order.paymentIntentId).toBeUndefined();
        expect(order.customerEmail).toBeUndefined();
    });
});
