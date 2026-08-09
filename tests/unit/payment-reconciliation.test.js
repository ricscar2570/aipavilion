"use strict";

const mockSend = jest.fn();
const mockSecretSend = jest.fn();
const mockIntentRetrieve = jest.fn();
const mockSubscriptionRetrieve = jest.fn();

process.env.PAYMENT_EVENTS_TABLE = "payment-events";
process.env.ORDERS_TABLE = "orders";
process.env.ENTITLEMENTS_TABLE = "entitlements";
process.env.STRIPE_SECRET_KEY_ARN = "stripe-secret";
process.env.PAYMENT_MODE = "stripe";
process.env.BILLING_MODE = "stripe";
process.env.RECONCILIATION_MAX_ITEMS = "100";
process.env.STALE_ORDER_MINUTES = "15";

jest.mock("@aws-sdk/client-dynamodb", () => ({
    DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock("@aws-sdk/lib-dynamodb", () => ({
    DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
    ScanCommand: jest.fn((input) => ({ type: "Scan", input })),
    UpdateCommand: jest.fn((input) => ({ type: "Update", input })),
}));

jest.mock("@aws-sdk/client-secrets-manager", () => ({
    SecretsManagerClient: jest.fn(() => ({ send: mockSecretSend })),
    GetSecretValueCommand: jest.fn((input) => ({ type: "Secret", input })),
}));

jest.mock("stripe", () =>
    jest.fn(() => ({
        paymentIntents: { retrieve: mockIntentRetrieve },
        subscriptions: { retrieve: mockSubscriptionRetrieve },
    })),
);

const reconciliation = require("../../backend/lambda/payment-reconciliation/index");
const privateApi = reconciliation.__private;

beforeEach(() => {
    mockSend.mockReset();
    mockSecretSend.mockReset();
    mockIntentRetrieve.mockReset();
    mockSubscriptionRetrieve.mockReset();
    mockSecretSend.mockResolvedValue({
        SecretString: JSON.stringify({ stripeSecretKey: "sk_test_fake" }),
    });
});

test("maps Stripe states deterministically", () => {
    expect(privateApi.paymentIntentTarget("succeeded")).toBe("paid");
    expect(privateApi.paymentIntentTarget("canceled")).toBe("cancelled");
    expect(privateApi.paymentIntentTarget("processing")).toBeNull();
    expect(privateApi.subscriptionStatus("trialing")).toBe("active");
    expect(privateApi.subscriptionStatus("past_due")).toBe("past_due");
    expect(privateApi.subscriptionStatus("canceled")).toBe("suspended");
});

test("expires abandoned webhook leases conditionally", async () => {
    mockSend
        .mockResolvedValueOnce({
            Items: [
                {
                    eventId: "evt-1",
                    status: "processing",
                    leaseExpiresAt: 1,
                },
            ],
        })
        .mockResolvedValueOnce({});
    await expect(privateApi.expireAbandonedEventLeases(100)).resolves.toBe(1);
    expect(mockSend.mock.calls[1][0].input.ConditionExpression).toContain(
        "leaseExpiresAt < :nowEpoch",
    );
});

test("reconciles a stale pending order from Stripe", async () => {
    mockSend
        .mockResolvedValueOnce({
            Items: [
                {
                    orderId: "order-1",
                    paymentIntentId: "pi-1",
                    status: "pending",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        })
        .mockResolvedValueOnce({});
    mockIntentRetrieve.mockResolvedValue({ id: "pi-1", status: "succeeded" });
    const result = await privateApi.reconcileOrders();
    expect(result).toEqual({ checked: 1, updated: 1, failed: 0 });
    expect(mockSend.mock.calls[1][0].input.ExpressionAttributeValues).toMatchObject({
        ":target": "paid",
        ":current": "pending",
    });
});

test("marks a stale creating order without an attached intent as failed", async () => {
    mockSend
        .mockResolvedValueOnce({
            Items: [
                {
                    orderId: "order-2",
                    status: "creating",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        })
        .mockResolvedValueOnce({});
    const result = await privateApi.reconcileOrders();
    expect(result.updated).toBe(1);
    expect(mockSend.mock.calls[1][0].input.ExpressionAttributeValues).toMatchObject({
        ":reason": "PAYMENT_INTENT_NOT_ATTACHED",
    });
    expect(mockIntentRetrieve).not.toHaveBeenCalled();
});

test("reconciles entitlement status against the live subscription", async () => {
    mockSend
        .mockResolvedValueOnce({
            Items: [
                {
                    organizationId: "org-a",
                    stripeSubscriptionId: "sub-1",
                    billingSource: "stripe",
                },
            ],
        })
        .mockResolvedValueOnce({});
    mockSubscriptionRetrieve.mockResolvedValue({
        id: "sub-1",
        status: "past_due",
        current_period_end: 1900000000,
    });
    const result = await privateApi.reconcileEntitlements();
    expect(result).toEqual({ checked: 1, updated: 1, failed: 0 });
    expect(mockSend.mock.calls[1][0].input.ExpressionAttributeValues).toMatchObject({
        ":status": "past_due",
        ":subscriptionId": "sub-1",
        ":eventId": "reconcile:sub-1",
    });
    expect(
        mockSend.mock.calls[1][0].input.ExpressionAttributeValues[":eventCreatedAt"],
    ).toEqual(expect.any(Number));
});

test("scanCandidates follows bounded DynamoDB pagination", async () => {
    mockSend
        .mockResolvedValueOnce({
            Items: [],
            LastEvaluatedKey: { eventId: "cursor-1" },
        })
        .mockResolvedValueOnce({
            Items: [{ eventId: "evt-2" }],
        });
    await expect(
        privateApi.scanCandidates({ TableName: "payment-events" }),
    ).resolves.toEqual([{ eventId: "evt-2" }]);
    expect(mockSend.mock.calls[1][0].input.ExclusiveStartKey).toEqual({
        eventId: "cursor-1",
    });
});
