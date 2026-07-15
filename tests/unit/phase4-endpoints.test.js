"use strict";

const mockSend = jest.fn();
const mockSesSend = jest.fn();

process.env.ORGANIZATIONS_TABLE = "organizations";
process.env.MEMBERSHIPS_TABLE = "memberships";
process.env.ENTITLEMENTS_TABLE = "entitlements";
process.env.PAYMENT_EVENTS_TABLE = "payment-events";
process.env.AUDIT_TABLE = "audit";
process.env.USERS_TABLE = "users";
process.env.ORDERS_TABLE = "orders";
process.env.SAVED_STANDS_TABLE = "saved";
process.env.INVITATIONS_TABLE = "invitations";
process.env.BILLING_MODE = "simulated";
process.env.APP_URL = "http://localhost:3000";
process.env.STRIPE_PRICE_MAP = JSON.stringify({});

jest.mock("@aws-sdk/client-dynamodb", () => ({
    DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock("@aws-sdk/lib-dynamodb", () => ({
    DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
    GetCommand: jest.fn((input) => ({ type: "Get", input })),
    PutCommand: jest.fn((input) => ({ type: "Put", input })),
    QueryCommand: jest.fn((input) => ({ type: "Query", input })),
    UpdateCommand: jest.fn((input) => ({ type: "Update", input })),
}));

jest.mock("@aws-sdk/client-secrets-manager", () => ({
    SecretsManagerClient: jest.fn(() => ({ send: jest.fn() })),
    GetSecretValueCommand: jest.fn((input) => input),
}));

jest.mock("@aws-sdk/client-sesv2", () => ({
    SESv2Client: jest.fn(() => ({ send: mockSesSend })),
    SendEmailCommand: jest.fn((input) => ({ type: "SendEmail", input })),
}));

jest.mock("stripe", () => jest.fn(() => ({})));

const billing = require("../../backend/lambda/billing/index");
const auditView = require("../../backend/lambda/audit-view/index").handler;
const dataExport = require("../../backend/lambda/data-export/index").handler;
const emailEvents = require("../../backend/lambda/email-events/index");

function apiEvent(overrides = {}) {
    return {
        httpMethod: "GET",
        path: "/",
        headers: { origin: "http://localhost:3000" },
        queryStringParameters: null,
        body: null,
        requestContext: {
            authorizer: {
                claims: {
                    sub: "owner-user",
                    email: "owner@example.com",
                    "cognito:groups": "organizer",
                },
            },
        },
        ...overrides,
    };
}

const ownerMembership = {
    userId: "owner-user",
    organizationId: "org-a",
    role: "owner",
    status: "active",
};

beforeEach(() => {
    mockSend.mockReset();
    mockSesSend.mockReset();
});

describe("Phase 4 SaaS billing", () => {
    test("returns a sanitized entitlement to an organization owner", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: ownerMembership })
            .mockResolvedValueOnce({
                Item: {
                    organizationId: "org-a",
                    plan: "starter",
                    status: "active",
                    maxActiveEvents: 3,
                    stripeCustomerId: "cus_private",
                    stripeSubscriptionId: "sub_private",
                },
            });
        const response = await billing.handler(
            apiEvent({ path: "/organizations/org-a/billing" }),
        );
        expect(response.statusCode).toBe(200);
        const entitlement = JSON.parse(response.body).entitlement;
        expect(entitlement.plan).toBe("starter");
        expect(entitlement.stripeCustomerId).toBeUndefined();
        expect(entitlement.stripeSubscriptionId).toBeUndefined();
    });

    test("activates a simulated plan with server-owned limits", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: ownerMembership })
            .mockResolvedValueOnce({
                Item: {
                    organizationId: "org-a",
                    name: "Org A",
                    status: "active",
                },
            })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});
        const response = await billing.handler(
            apiEvent({
                httpMethod: "POST",
                path: "/organizations/org-a/billing/checkout",
                headers: {
                    origin: "http://localhost:3000",
                    "Idempotency-Key": "billing-request-12345678",
                },
                body: JSON.stringify({
                    plan: "professional",
                    billingEmail: "billing@example.com",
                    successUrl: "http://localhost:3000/#/organizer",
                    cancelUrl: "http://localhost:3000/#/organizer",
                }),
            }),
        );
        expect(response.statusCode).toBe(201);
        expect(JSON.parse(response.body).simulated).toBe(true);
        const update = mockSend.mock.calls[2][0].input;
        expect(update.ExpressionAttributeValues[":maxEvents"]).toBe(10);
        expect(update.ExpressionAttributeValues[":maxStands"]).toBe(250);
    });

    test("does not expose a billing portal outside Stripe mode", async () => {
        mockSend.mockResolvedValueOnce({ Item: ownerMembership });
        const response = await billing.handler(
            apiEvent({
                httpMethod: "POST",
                path: "/organizations/org-a/billing/portal",
                body: JSON.stringify({
                    returnUrl: "http://localhost:3000/#/organizer",
                }),
            }),
        );
        expect(response.statusCode).toBe(503);
    });

    test("maps plan limits and subscription state deterministically", async () => {
        expect(billing.PLAN_LIMITS.pilot.maxActiveEvents).toBe(1);
        mockSend.mockResolvedValueOnce({});
        await billing.applyPlan({
            organizationId: "org-a",
            plan: "starter",
            status: "active",
            source: "test",
        });
        expect(
            mockSend.mock.calls[0][0].input.ExpressionAttributeValues,
        ).toMatchObject({
            ":plan": "starter",
            ":maxEvents": 3,
            ":maxStands": 50,
        });
    });

    test("reclaims failed billing webhook events but not in-flight duplicates", async () => {
        const conditionalError = Object.assign(new Error("exists"), {
            name: "ConditionalCheckFailedException",
        });
        mockSend
            .mockRejectedValueOnce(conditionalError)
            .mockResolvedValueOnce({ Item: { status: "failed" } })
            .mockResolvedValueOnce({});
        await expect(
            billing.claimEvent("evt_retry", "invoice.paid"),
        ).resolves.toBe(true);
        expect(mockSend.mock.calls[2][0].input.ConditionExpression).toBe(
            "#status = :failed",
        );

        mockSend.mockReset();
        mockSend
            .mockRejectedValueOnce(conditionalError)
            .mockResolvedValueOnce({ Item: { status: "processing" } });
        await expect(
            billing.claimEvent("evt_duplicate", "invoice.paid"),
        ).resolves.toBe(false);
    });

    test("marks failed billing events so Stripe can retry them", async () => {
        mockSend.mockResolvedValueOnce({});
        await billing.failEvent("evt_failed", new Error("temporary outage"));
        const update = mockSend.mock.calls[0][0].input;
        expect(update.Key).toEqual({ eventId: "billing#evt_failed" });
        expect(update.ExpressionAttributeValues).toMatchObject({
            ":processing": "processing",
            ":failed": "failed",
            ":reason": "temporary outage",
        });
    });

    test("synchronizes checkout and subscription events into entitlements", async () => {
        mockSend.mockResolvedValue({});
        await billing.processStripeEvent({
            type: "checkout.session.completed",
            data: {
                object: {
                    client_reference_id: "org-a",
                    customer: "cus_1",
                    subscription: "sub_1",
                    metadata: { plan: "starter" },
                },
            },
        });
        expect(
            mockSend.mock.calls[0][0].input.ExpressionAttributeValues,
        ).toMatchObject({
            ":plan": "starter",
            ":status": "active",
            ":customerId": "cus_1",
        });

        mockSend.mockReset();
        mockSend.mockResolvedValue({});
        await billing.processStripeEvent({
            type: "customer.subscription.updated",
            data: {
                object: {
                    id: "sub_2",
                    status: "past_due",
                    customer: "cus_2",
                    current_period_end: 1900000000,
                    metadata: { organizationId: "org-a", plan: "professional" },
                    items: { data: [{ price: { id: "price_professional" } }] },
                },
            },
        });
        expect(
            mockSend.mock.calls[0][0].input.ExpressionAttributeValues,
        ).toMatchObject({
            ":plan": "professional",
            ":status": "past_due",
            ":subscriptionId": "sub_2",
        });
    });
});

describe("Phase 4 audit and privacy export", () => {
    test("lists only audit events for an authorized tenant", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: ownerMembership })
            .mockResolvedValueOnce({
                Items: [
                    {
                        auditId: "audit-1",
                        organizationId: "org-a",
                        createdAt: "2026-07-14T10:00:00.000Z",
                        action: "event.published",
                        ttl: 123,
                    },
                ],
            });
        const response = await auditView(
            apiEvent({
                path: "/organizations/org-a/audit",
                queryStringParameters: { limit: "10" },
            }),
        );
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.events).toHaveLength(1);
        expect(body.events[0].ttl).toBeUndefined();
        expect(mockSend.mock.calls[1][0].input.IndexName).toBe(
            "organization-audit-index",
        );
    });

    test("exports personal data without payment secrets", async () => {
        mockSend
            .mockResolvedValueOnce({
                Item: { userId: "owner-user", email: "owner@example.com" },
            })
            .mockResolvedValueOnce({
                Items: [
                    {
                        orderId: "order-1",
                        userId: "owner-user",
                        status: "paid",
                        paymentIntentId: "pi_secret",
                        customerEmail: "owner@example.com",
                        checkoutRequestId: "checkout-secret",
                    },
                ],
            })
            .mockResolvedValueOnce({ Items: [{ standId: "stand-a" }] })
            .mockResolvedValueOnce({ Items: [ownerMembership] });
        const response = await dataExport(apiEvent({ path: "/user/export" }));
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.profile.email).toBe("owner@example.com");
        expect(body.orders[0].paymentIntentId).toBeUndefined();
        expect(body.orders[0].customerEmail).toBeUndefined();
        expect(body.orders[0].checkoutRequestId).toBeUndefined();
        expect(body.savedStands).toHaveLength(1);
    });

    test("rejects an unauthenticated data export", async () => {
        const response = await dataExport(
            apiEvent({
                path: "/user/export",
                requestContext: { authorizer: { claims: {} } },
            }),
        );
        expect(response.statusCode).toBe(401);
        expect(mockSend).not.toHaveBeenCalled();
    });
});

describe("Phase 4 invitation delivery telemetry", () => {
    test("parses SES tags and delivery statuses", () => {
        const record = {
            Sns: {
                Message: JSON.stringify({
                    eventType: "Delivery",
                    mail: {
                        messageId: "message-1",
                        tags: {
                            invitationId: ["inv-1"],
                            organizationId: ["org-a"],
                        },
                    },
                }),
            },
        };
        expect(emailEvents.parseRecord(record)).toMatchObject({
            eventType: "Delivery",
            invitationId: "inv-1",
            organizationId: "org-a",
        });
        expect(emailEvents.deliveryStatus("Complaint")).toBe("complained");
        expect(emailEvents.deliveryStatus("unknown-event")).toBe("unknown");
    });

    test("updates the invitation and writes a tenant audit event", async () => {
        mockSend.mockResolvedValue({});
        const response = await emailEvents.handler({
            Records: [
                {
                    Sns: {
                        Message: JSON.stringify({
                            eventType: "Bounce",
                            mail: {
                                messageId: "message-2",
                                timestamp: "2026-07-14T12:00:00.000Z",
                                destination: ["bad@example.com"],
                                tags: {
                                    invitationId: ["inv-2"],
                                    organizationId: ["org-a"],
                                },
                            },
                        }),
                    },
                },
            ],
        });
        expect(response.processed).toBe(1);
        expect(response.results[0]).toEqual({
            invitationId: "inv-2",
            status: "bounced",
        });
        expect(
            mockSend.mock.calls[0][0].input.ExpressionAttributeValues[
                ":status"
            ],
        ).toBe("bounced");
        expect(mockSend.mock.calls[1][0].type).toBe("Put");
    });

    test("ignores delivery records without an invitation tag", async () => {
        const response = await emailEvents.handler({
            Records: [{ eventType: "Delivery", mail: {} }],
        });
        expect(response.results).toEqual([{ ignored: true }]);
        expect(mockSend).not.toHaveBeenCalled();
    });
});
