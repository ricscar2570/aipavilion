"use strict";

const mockDynamoSend = jest.fn();
const mockSecretSend = jest.fn();
const mockStripeCreate = jest.fn();
const mockStripeRetrieve = jest.fn();
const mockStripeConstructEvent = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
    DynamoDBClient: jest.fn(() => ({ send: mockDynamoSend })),
    PutItemCommand: jest.fn((input) => ({ type: "PutItem", input })),
    GetItemCommand: jest.fn((input) => ({ type: "GetItem", input })),
    UpdateItemCommand: jest.fn((input) => ({ type: "UpdateItem", input })),
    DeleteItemCommand: jest.fn((input) => ({ type: "DeleteItem", input })),
    BatchGetItemCommand: jest.fn((input) => ({ type: "BatchGetItem", input })),
}));

jest.mock("@aws-sdk/util-dynamodb", () => ({
    marshall: jest.fn((value) => value),
    unmarshall: jest.fn((value) => value),
}));

jest.mock("@aws-sdk/client-secrets-manager", () => ({
    SecretsManagerClient: jest.fn(() => ({ send: mockSecretSend })),
    GetSecretValueCommand: jest.fn((input) => ({ type: "Secret", input })),
}));

jest.mock("stripe", () =>
    jest.fn(() => ({
        paymentIntents: {
            create: mockStripeCreate,
            retrieve: mockStripeRetrieve,
        },
        webhooks: { constructEvent: mockStripeConstructEvent },
    })),
);

const REQUEST_ID = "checkout-request-00000001";
const CATALOGUE_RESPONSE = {
    Responses: {
        "ai-pavilion-stands-test": [
            {
                stand_id: "stand-1",
                status: "approved",
                visibility: "public",
                products: [
                    { id: "prod-1", name: "Game", price: 59.99 },
                    {
                        productId: "prod-2",
                        name: "Controller",
                        priceInCents: 3499,
                    },
                ],
            },
        ],
    },
};
const VALID_ITEMS = [
    { standId: "stand-1", productId: "prod-1", quantity: 1 },
    { standId: "stand-1", productId: "prod-2", quantity: 2 },
];

function makeEvent(overrides = {}) {
    return {
        httpMethod: "POST",
        path: "/checkout/create-intent",
        headers: {
            origin: "https://test.cloudfront.net",
            "Idempotency-Key": REQUEST_ID,
        },
        body: null,
        requestContext: { authorizer: { claims: { sub: "user-123" } } },
        ...overrides,
    };
}

function createBody(overrides = {}) {
    return JSON.stringify({
        items: VALID_ITEMS,
        customerEmail: "buyer@test.com",
        checkoutRequestId: REQUEST_ID,
        ...overrides,
    });
}

function orderRecord(overrides = {}) {
    return {
        orderId: "order-1",
        paymentIntentId: "pi-1",
        userId: "user-123",
        customerEmail: "buyer@test.com",
        status: "pending",
        amountInCents: 5999,
        currency: "eur",
        items: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

function conditionalError() {
    const error = new Error("conditional");
    error.name = "ConditionalCheckFailedException";
    return error;
}

describe("Checkout Lambda", () => {
    let handler;

    beforeAll(() => {
        process.env.ALLOWED_ORIGIN = "https://test.cloudfront.net";
        process.env.ORDERS_TABLE = "ai-pavilion-orders-test";
        process.env.STANDS_TABLE = "ai-pavilion-stands-test";
        process.env.PAYMENT_EVENTS_TABLE = "payment-events-test";
        process.env.STRIPE_SECRET_KEY_ARN = "secret-arn";
        process.env.PAYMENT_MODE = "stripe";
        handler = require("../../backend/lambda/checkout/index").handler;
    });

    beforeEach(() => {
        mockDynamoSend.mockReset();
        mockSecretSend.mockReset();
        mockStripeCreate.mockReset();
        mockStripeRetrieve.mockReset();
        mockStripeConstructEvent.mockReset();
        process.env.PAYMENT_MODE = "stripe";
        mockSecretSend.mockResolvedValue({
            SecretString: JSON.stringify({
                stripeSecretKey: "sk_test_fake",
                stripeWebhookSecret: "whsec_test",
            }),
        });
    });

    test("requires a matching idempotency key", async () => {
        const missing = await handler(
            makeEvent({
                headers: {},
                body: JSON.stringify({
                    items: VALID_ITEMS,
                    customerEmail: "buyer@test.com",
                }),
            }),
        );
        const mismatch = await handler(
            makeEvent({
                body: createBody({
                    checkoutRequestId: "different-request-0001",
                }),
            }),
        );
        expect(missing.statusCode).toBe(400);
        expect(mismatch.statusCode).toBe(400);
    });

    test("creates one intent from authoritative public catalogue prices", async () => {
        mockDynamoSend
            .mockResolvedValueOnce(CATALOGUE_RESPONSE)
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});
        mockStripeCreate.mockResolvedValue({
            id: "pi-1",
            client_secret: "secret-1",
        });

        const result = await handler(makeEvent({ body: createBody() }));
        const body = JSON.parse(result.body);
        expect(result.statusCode).toBe(200);
        expect(body.amountInCents).toBe(12997);
        expect(body.currency).toBe("eur");
        expect(mockStripeCreate).toHaveBeenCalledWith(
            expect.objectContaining({ amount: 12997, currency: "eur" }),
            expect.objectContaining({
                idempotencyKey: `ai-pavilion-user-123-${REQUEST_ID}`,
            }),
        );
        expect(mockDynamoSend.mock.calls[1][0].input.Item.status).toBe(
            "creating",
        );
        expect(
            mockDynamoSend.mock.calls[2][0].input.UpdateExpression,
        ).toContain("paymentIntentId");
    });

    test("rejects fields outside the documented checkout schema", async () => {
        const extraBodyField = await handler(
            makeEvent({ body: createBody({ currency: "usd" }) }),
        );
        const extraItemField = await handler(
            makeEvent({
                body: createBody({
                    items: VALID_ITEMS.map((item) => ({
                        ...item,
                        priceInCents: 1,
                    })),
                }),
            }),
        );
        expect(extraBodyField.statusCode).toBe(400);
        expect(extraItemField.statusCode).toBe(400);
        expect(mockDynamoSend).not.toHaveBeenCalled();
        expect(mockStripeCreate).not.toHaveBeenCalled();
    });

    test("rejects draft stands and missing products", async () => {
        mockDynamoSend.mockResolvedValueOnce({
            Responses: {
                "ai-pavilion-stands-test": [
                    {
                        ...CATALOGUE_RESPONSE.Responses[
                            "ai-pavilion-stands-test"
                        ][0],
                        status: "draft",
                    },
                ],
            },
        });
        const draft = await handler(makeEvent({ body: createBody() }));
        expect(draft.statusCode).toBe(409);

        mockDynamoSend.mockResolvedValueOnce(CATALOGUE_RESPONSE);
        const missing = await handler(
            makeEvent({
                body: createBody({
                    items: [
                        {
                            standId: "stand-1",
                            productId: "missing",
                            quantity: 1,
                        },
                    ],
                }),
            }),
        );
        expect(missing.statusCode).toBe(409);
    });

    test("returns the existing order on an idempotent replay", async () => {
        const existing = orderRecord({
            orderId: "ord_existing",
            checkoutRequestId: REQUEST_ID,
            cartFingerprint:
                require("../../backend/lambda/checkout/index").__private.cartFingerprint(
                    [
                        {
                            standId: "stand-1",
                            productId: "prod-1",
                            quantity: 1,
                            priceInCents: 5999,
                            name: "Game",
                        },
                        {
                            standId: "stand-1",
                            productId: "prod-2",
                            quantity: 2,
                            priceInCents: 3499,
                            name: "Controller",
                        },
                    ],
                    12997,
                ),
            amountInCents: 12997,
            clientSecret: "same-secret",
        });
        mockDynamoSend
            .mockResolvedValueOnce(CATALOGUE_RESPONSE)
            .mockRejectedValueOnce(conditionalError())
            .mockResolvedValueOnce({ Item: existing });

        const result = await handler(makeEvent({ body: createBody() }));
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).idempotentReplay).toBe(true);
        expect(mockStripeCreate).not.toHaveBeenCalled();
    });

    test("rejects reuse of an idempotency key for a different cart", async () => {
        mockDynamoSend
            .mockResolvedValueOnce(CATALOGUE_RESPONSE)
            .mockRejectedValueOnce(conditionalError())
            .mockResolvedValueOnce({
                Item: orderRecord({
                    checkoutRequestId: REQUEST_ID,
                    cartFingerprint: "different",
                }),
            });
        const result = await handler(makeEvent({ body: createBody() }));
        expect(result.statusCode).toBe(409);
        expect(JSON.parse(result.body).error).toBe("IDEMPOTENCY_CONFLICT");
    });

    test("confirms a succeeded payment with a conditional state transition", async () => {
        mockDynamoSend
            .mockResolvedValueOnce({ Item: orderRecord() })
            .mockResolvedValueOnce({ Item: orderRecord() })
            .mockResolvedValueOnce({});
        mockStripeRetrieve.mockResolvedValue({
            status: "succeeded",
            metadata: { orderId: "order-1", userId: "user-123" },
        });
        const result = await handler(
            makeEvent({
                path: "/checkout/confirm-order",
                body: JSON.stringify({
                    orderId: "order-1",
                    paymentIntentId: "pi-1",
                }),
            }),
        );
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).status).toBe("paid");
    });

    test("denies another user and rejects incomplete payments", async () => {
        mockDynamoSend.mockResolvedValueOnce({
            Item: orderRecord({ userId: "other" }),
        });
        const denied = await handler(
            makeEvent({
                path: "/checkout/confirm-order",
                body: JSON.stringify({
                    orderId: "order-1",
                    paymentIntentId: "pi-1",
                }),
            }),
        );
        expect(denied.statusCode).toBe(403);

        mockDynamoSend.mockResolvedValueOnce({ Item: orderRecord() });
        mockStripeRetrieve.mockResolvedValue({
            status: "requires_payment_method",
            metadata: { orderId: "order-1", userId: "user-123" },
        });
        const incomplete = await handler(
            makeEvent({
                path: "/checkout/confirm-order",
                body: JSON.stringify({
                    orderId: "order-1",
                    paymentIntentId: "pi-1",
                }),
            }),
        );
        expect(incomplete.statusCode).toBe(402);
    });

    test("does not expose private order fields", async () => {
        mockDynamoSend.mockResolvedValueOnce({
            Item: orderRecord({
                status: "paid",
                clientSecret: "secret",
                checkoutRequestId: REQUEST_ID,
                cartFingerprint: "hash",
            }),
        });
        const result = await handler(
            makeEvent({ httpMethod: "GET", path: "/checkout/order/order-1" }),
        );
        const body = JSON.parse(result.body);
        expect(result.statusCode).toBe(200);
        for (const field of [
            "paymentIntentId",
            "customerEmail",
            "clientSecret",
            "checkoutRequestId",
            "cartFingerprint",
        ]) {
            expect(body[field]).toBeUndefined();
        }
    });

    test("creates and confirms a simulated payment without Stripe", async () => {
        process.env.PAYMENT_MODE = "simulated";
        mockDynamoSend
            .mockResolvedValueOnce(CATALOGUE_RESPONSE)
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});
        const created = await handler(makeEvent({ body: createBody() }));
        const createdBody = JSON.parse(created.body);
        expect(created.statusCode).toBe(200);
        expect(createdBody.paymentIntentId).toMatch(/^pi_sim_/);
        expect(mockStripeCreate).not.toHaveBeenCalled();

        mockDynamoSend
            .mockResolvedValueOnce({
                Item: orderRecord({
                    orderId: createdBody.orderId,
                    paymentIntentId: createdBody.paymentIntentId,
                }),
            })
            .mockResolvedValueOnce({
                Item: orderRecord({
                    orderId: createdBody.orderId,
                    paymentIntentId: createdBody.paymentIntentId,
                }),
            })
            .mockResolvedValueOnce({});
        const confirmed = await handler(
            makeEvent({
                path: "/checkout/confirm-order",
                body: JSON.stringify({
                    orderId: createdBody.orderId,
                    paymentIntentId: createdBody.paymentIntentId,
                }),
            }),
        );
        expect(confirmed.statusCode).toBe(200);
    });

    test("deduplicates webhook event IDs and ignores stale transitions", async () => {
        const stripeEvent = {
            id: "evt_1",
            type: "payment_intent.succeeded",
            data: { object: { metadata: { orderId: "order-1" } } },
        };
        mockStripeConstructEvent.mockReturnValue(stripeEvent);
        mockDynamoSend
            .mockResolvedValueOnce({}) // claim
            .mockResolvedValueOnce({ Item: orderRecord() })
            .mockResolvedValueOnce({}) // order transition
            .mockResolvedValueOnce({}) // mark event processed
            .mockRejectedValueOnce(conditionalError()); // duplicate claim

        const webhook = makeEvent({
            path: "/checkout/webhook",
            headers: { "stripe-signature": "valid" },
            body: "{}",
            requestContext: {},
        });
        const first = await handler(webhook);
        const second = await handler(webhook);
        expect(first.statusCode).toBe(200);
        expect(JSON.parse(second.body).duplicate).toBe(true);
    });

    test("rejects invalid webhook signatures", async () => {
        mockStripeConstructEvent.mockImplementation(() => {
            throw new Error("bad signature");
        });
        const response = await handler(
            makeEvent({
                path: "/checkout/webhook",
                headers: { "stripe-signature": "bad" },
                body: "{}",
                requestContext: {},
            }),
        );
        expect(response.statusCode).toBe(400);
    });
});
