"use strict";

const mockSend = jest.fn();

process.env.ORGANIZATIONS_TABLE = "organizations";
process.env.MEMBERSHIPS_TABLE = "memberships";
process.env.ENTITLEMENTS_TABLE = "entitlements";
process.env.AUDIT_TABLE = "audit";
process.env.EVENTS_TABLE = "events";
process.env.STANDS_TABLE = "stands";
process.env.INVITATIONS_TABLE = "invitations";
process.env.LEADS_TABLE = "leads";

jest.mock("@aws-sdk/client-dynamodb", () => ({
    DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock("@aws-sdk/lib-dynamodb", () => ({
    DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
    GetCommand: jest.fn((input) => ({ type: "Get", input })),
    PutCommand: jest.fn((input) => ({ type: "Put", input })),
    QueryCommand: jest.fn((input) => ({ type: "Query", input })),
    UpdateCommand: jest.fn((input) => ({ type: "Update", input })),
    DeleteCommand: jest.fn((input) => ({ type: "Delete", input })),
    TransactWriteCommand: jest.fn((input) => ({
        type: "TransactWrite",
        input,
    })),
}));

const organizations =
    require("../../backend/lambda/organizations/index").handler;
const events = require("../../backend/lambda/events/index").handler;
const invitations = require("../../backend/lambda/invitations/index").handler;
const exhibitorStands =
    require("../../backend/lambda/exhibitor-stands/index").handler;
const exhibitorLeads =
    require("../../backend/lambda/exhibitor-leads/index").handler;
const publicEvents =
    require("../../backend/lambda/public-events/index").handler;

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
                    sub: "user-a",
                    email: "user-a@example.com",
                    "cognito:groups": "organizer",
                },
            },
        },
        ...overrides,
    };
}

function membership(role = "owner", organizationId = "org-a") {
    return {
        userId: "user-a",
        organizationId,
        membershipKey: `${role}#user-a`,
        role,
        status: "active",
    };
}

beforeEach(() => {
    mockSend.mockReset();
});

describe("Phase 3 tenant authorization", () => {
    test("lists only memberships belonging to the current authenticated user", async () => {
        mockSend
            .mockResolvedValueOnce({
                Items: [membership()],
                LastEvaluatedKey: undefined,
            })
            .mockResolvedValueOnce({
                Item: {
                    organizationId: "org-a",
                    name: "Org A",
                    status: "active",
                },
            });
        const response = await organizations(
            apiEvent({ httpMethod: "GET", path: "/me/memberships" }),
        );
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.memberships[0].organizationId).toBe("org-a");
        expect(
            mockSend.mock.calls[0][0].input.ExpressionAttributeValues,
        ).toEqual({
            ":userId": "user-a",
        });
    });

    test("requires platform admin to create an organization", async () => {
        const denied = await organizations(
            apiEvent({
                httpMethod: "POST",
                path: "/platform/organizations",
                body: JSON.stringify({
                    name: "New Org",
                    ownerUserId: "owner-user",
                }),
            }),
        );
        expect(denied.statusCode).toBe(403);
        expect(mockSend).not.toHaveBeenCalled();

        mockSend.mockResolvedValue({});
        const created = await organizations(
            apiEvent({
                httpMethod: "POST",
                path: "/platform/organizations",
                body: JSON.stringify({
                    name: "New Org",
                    ownerUserId: "owner-user",
                    ownerEmail: "owner@example.com",
                }),
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: "admin-user",
                            email: "admin@example.com",
                            "cognito:groups": "admin",
                        },
                    },
                },
            }),
        );
        expect(created.statusCode).toBe(201);
        expect(mockSend.mock.calls[0][0].type).toBe("TransactWrite");
    });

    test("denies an organizer attempting to access a different tenant", async () => {
        mockSend.mockResolvedValueOnce({}); // no membership for org-b
        const response = await events(
            apiEvent({
                path: "/organizations/org-b/events",
                httpMethod: "GET",
            }),
        );
        expect(response.statusCode).toBe(403);
        expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test("creates a tenant-scoped draft event within plan limits", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({
                Item: {
                    organizationId: "org-a",
                    status: "active",
                    maxActiveEvents: 2,
                },
            })
            .mockResolvedValueOnce({ Count: 1 })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});
        const response = await events(
            apiEvent({
                path: "/organizations/org-a/events",
                httpMethod: "POST",
                body: JSON.stringify({
                    name: "Pilot Event",
                    startsAt: "2026-09-01T08:00:00.000Z",
                    endsAt: "2026-09-01T18:00:00.000Z",
                    timezone: "Europe/Rome",
                    visibility: "public",
                }),
            }),
        );
        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.event).toMatchObject({
            organizationId: "org-a",
            name: "Pilot Event",
            status: "draft",
            publicStatus: "draft",
        });
        expect(mockSend.mock.calls[3][0].type).toBe("Put");
    });

    test("publishes only a stand that is pending review and makes it queryable", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({
                Item: {
                    eventId: "event-a",
                    organizationId: "org-a",
                    status: "published",
                    visibility: "public",
                },
            })
            .mockResolvedValueOnce({
                Item: {
                    stand_id: "stand-a",
                    organizationId: "org-a",
                    eventId: "event-a",
                    status: "pending_review",
                    visibility: "public",
                },
            })
            .mockResolvedValueOnce({
                Attributes: {
                    stand_id: "stand-a",
                    status: "published",
                    publicStatus: "published",
                },
            })
            .mockResolvedValueOnce({});
        const response = await events(
            apiEvent({
                path: "/organizations/org-a/events/event-a/stands/stand-a/moderation",
                httpMethod: "PATCH",
                body: JSON.stringify({
                    status: "published",
                    moderationNote: "Approved",
                }),
            }),
        );
        expect(response.statusCode).toBe(200);
        const update = mockSend.mock.calls[3][0].input;
        expect(update.ExpressionAttributeValues).toMatchObject({
            ":publicStatus": "published",
            ":pendingReview": "pending_review",
        });
        expect(update.ConditionExpression).toContain(
            "#status = :pendingReview",
        );
    });

    test("does not allow an organizer to bypass stand submission", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({
                Item: {
                    eventId: "event-a",
                    organizationId: "org-a",
                    status: "published",
                },
            })
            .mockResolvedValueOnce({
                Item: {
                    stand_id: "stand-a",
                    organizationId: "org-a",
                    eventId: "event-a",
                    status: "draft",
                    visibility: "public",
                },
            });
        const response = await events(
            apiEvent({
                path: "/organizations/org-a/events/event-a/stands/stand-a/moderation",
                httpMethod: "PATCH",
                body: JSON.stringify({ status: "published" }),
            }),
        );
        expect(response.statusCode).toBe(409);
        expect(JSON.parse(response.body).error).toBe(
            "STAND_NOT_PENDING_REVIEW",
        );
        expect(mockSend).toHaveBeenCalledTimes(3);
    });

    test("an exhibitor membership cannot create organizer events", async () => {
        mockSend.mockResolvedValueOnce({ Item: membership("exhibitor") });
        const response = await events(
            apiEvent({
                path: "/organizations/org-a/events",
                httpMethod: "POST",
                body: JSON.stringify({
                    name: "Attempt",
                    startsAt: "2026-09-01T08:00:00.000Z",
                    endsAt: "2026-09-01T18:00:00.000Z",
                }),
            }),
        );
        expect(response.statusCode).toBe(403);
    });
});

describe("Phase 3 invitation and resource ownership", () => {
    test("rejects invitation acceptance by a different email address", async () => {
        mockSend.mockResolvedValueOnce({
            Item: {
                invitationId: "inv-1",
                organizationId: "org-a",
                eventId: "event-a",
                email: "expected@example.com",
                status: "pending",
                expiresAt: "2099-01-01T00:00:00.000Z",
            },
        });
        const response = await invitations(
            apiEvent({
                path: "/invitations/inv-1/accept",
                httpMethod: "POST",
            }),
        );
        expect(response.statusCode).toBe(403);
        expect(JSON.parse(response.body).error).toBe(
            "INVITATION_EMAIL_MISMATCH",
        );
    });

    test("an exhibitor cannot read or update another user's stand", async () => {
        mockSend.mockResolvedValue({
            Item: {
                stand_id: "stand-b",
                ownerUserId: "user-b",
                organizationId: "org-b",
            },
        });
        const read = await exhibitorStands(
            apiEvent({ path: "/exhibitor/stands/stand-b", httpMethod: "GET" }),
        );
        expect(read.statusCode).toBe(404);
        const update = await exhibitorStands(
            apiEvent({
                path: "/exhibitor/stands/stand-b",
                httpMethod: "PUT",
                body: JSON.stringify({ name: "Forged" }),
            }),
        );
        expect(update.statusCode).toBe(404);
    });

    test("lead access is hidden when the stand belongs to another tenant", async () => {
        mockSend
            .mockResolvedValueOnce({
                Item: {
                    stand_id: "stand-b",
                    ownerUserId: "user-b",
                    organizationId: "org-b",
                },
            })
            .mockResolvedValueOnce({});
        const response = await exhibitorLeads(
            apiEvent({
                path: "/exhibitor/leads",
                httpMethod: "GET",
                queryStringParameters: { standId: "stand-b" },
            }),
        );
        expect(response.statusCode).toBe(404);
        expect(mockSend).toHaveBeenCalledTimes(2);
    });
});

describe("Phase 3 public event boundaries", () => {
    test("returns only published public events", async () => {
        mockSend.mockResolvedValueOnce({
            Items: [
                {
                    eventId: "event-public",
                    organizationId: "org-a",
                    name: "Public",
                    status: "published",
                    visibility: "public",
                    publicStatus: "published",
                    startsAt: "2026-09-01T00:00:00.000Z",
                },
                {
                    eventId: "event-private",
                    status: "draft",
                    visibility: "public",
                },
            ],
        });
        const response = await publicEvents(
            apiEvent({ path: "/events", requestContext: {} }),
        );
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).events).toHaveLength(1);
    });

    test("hides a draft event even when its identifier is known", async () => {
        mockSend.mockResolvedValueOnce({
            Item: {
                eventId: "event-draft",
                status: "draft",
                visibility: "public",
            },
        });
        const response = await publicEvents(
            apiEvent({ path: "/events/event-draft", requestContext: {} }),
        );
        expect(response.statusCode).toBe(404);
    });
});

describe("Phase 3 organization and event operations", () => {
    test("reads an organization only after membership authorization", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: membership("exhibitor") })
            .mockResolvedValueOnce({
                Item: {
                    organizationId: "org-a",
                    name: "Org A",
                    slug: "org-a",
                    status: "active",
                    ownerEmail: "private@example.com",
                },
            });
        const response = await organizations(
            apiEvent({ path: "/organizations/org-a", httpMethod: "GET" }),
        );
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.organization.name).toBe("Org A");
        expect(body.organization.ownerEmail).toBeUndefined();
        expect(body.membership.role).toBe("exhibitor");
    });

    test("lists organization members and entitlement for organizers", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({
                Items: [membership("owner"), membership("exhibitor")],
            });
        const members = await organizations(
            apiEvent({
                path: "/organizations/org-a/memberships",
                httpMethod: "GET",
            }),
        );
        expect(members.statusCode).toBe(200);
        expect(JSON.parse(members.body).count).toBe(2);

        mockSend.mockReset();
        mockSend
            .mockResolvedValueOnce({ Item: membership("organizer") })
            .mockResolvedValueOnce({
                Item: {
                    organizationId: "org-a",
                    plan: "pilot",
                    status: "active",
                },
            });
        const entitlement = await organizations(
            apiEvent({
                path: "/organizations/org-a/entitlement",
                httpMethod: "GET",
            }),
        );
        expect(entitlement.statusCode).toBe(200);
        expect(JSON.parse(entitlement.body).entitlement.plan).toBe("pilot");
    });

    test("lists, reads and updates tenant events", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: membership("exhibitor") })
            .mockResolvedValueOnce({
                Items: [
                    {
                        eventId: "event-a",
                        organizationId: "org-a",
                        name: "Event A",
                        status: "draft",
                        startsAt: "2026-09-01T08:00:00.000Z",
                    },
                ],
            });
        const listed = await events(
            apiEvent({
                path: "/organizations/org-a/events",
                httpMethod: "GET",
            }),
        );
        expect(listed.statusCode).toBe(200);
        expect(JSON.parse(listed.body).events).toHaveLength(1);

        mockSend.mockReset();
        mockSend
            .mockResolvedValueOnce({ Item: membership("exhibitor") })
            .mockResolvedValueOnce({
                Item: {
                    eventId: "event-a",
                    organizationId: "org-a",
                    name: "Event A",
                    status: "draft",
                },
            });
        const read = await events(
            apiEvent({
                path: "/organizations/org-a/events/event-a",
                httpMethod: "GET",
            }),
        );
        expect(read.statusCode).toBe(200);

        mockSend.mockReset();
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({
                Item: {
                    eventId: "event-a",
                    organizationId: "org-a",
                    name: "Old Name",
                    description: "Old",
                    startsAt: "2026-09-01T08:00:00.000Z",
                    endsAt: "2026-09-01T18:00:00.000Z",
                    timezone: "Europe/Rome",
                    visibility: "public",
                    status: "draft",
                },
            })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});
        const updated = await events(
            apiEvent({
                path: "/organizations/org-a/events/event-a",
                httpMethod: "PUT",
                body: JSON.stringify({ name: "Updated Name" }),
            }),
        );
        expect(updated.statusCode).toBe(200);
        expect(JSON.parse(updated.body).event.name).toBe("Updated Name");
    });

    test("publishes events and lists their moderation queue", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({
                Item: {
                    eventId: "event-a",
                    organizationId: "org-a",
                    status: "draft",
                    visibility: "public",
                },
            })
            .mockResolvedValueOnce({
                Attributes: {
                    eventId: "event-a",
                    organizationId: "org-a",
                    status: "published",
                    publicStatus: "published",
                },
            })
            .mockResolvedValueOnce({});
        const published = await events(
            apiEvent({
                path: "/organizations/org-a/events/event-a/publish",
                httpMethod: "POST",
                body: "{}",
            }),
        );
        expect(published.statusCode).toBe(200);
        expect(JSON.parse(published.body).event.status).toBe("published");

        mockSend.mockReset();
        mockSend
            .mockResolvedValueOnce({ Item: membership("organizer") })
            .mockResolvedValueOnce({
                Item: {
                    eventId: "event-a",
                    organizationId: "org-a",
                    status: "published",
                },
            })
            .mockResolvedValueOnce({
                Items: [
                    {
                        stand_id: "stand-a",
                        eventId: "event-a",
                        organizationId: "org-a",
                        status: "pending_review",
                    },
                ],
            });
        const stands = await events(
            apiEvent({
                path: "/organizations/org-a/events/event-a/stands",
                httpMethod: "GET",
            }),
        );
        expect(stands.statusCode).toBe(200);
        expect(JSON.parse(stands.body).count).toBe(1);
    });
});

describe("Phase 3 invitation lifecycle", () => {
    test("organizer creates a bounded exhibitor invitation", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({
                Item: {
                    eventId: "event-a",
                    organizationId: "org-a",
                    status: "published",
                },
            })
            .mockResolvedValueOnce({
                Item: {
                    organizationId: "org-a",
                    name: "Org A",
                    status: "active",
                },
            })
            .mockResolvedValueOnce({
                Item: {
                    organizationId: "org-a",
                    status: "active",
                    maxStandsPerEvent: 20,
                },
            })
            .mockResolvedValueOnce({ Count: 2 })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});
        const response = await invitations(
            apiEvent({
                path: "/organizations/org-a/events/event-a/invitations",
                httpMethod: "POST",
                body: JSON.stringify({
                    email: "invited@example.com",
                    standName: "Invited Stand",
                    expiresInDays: 7,
                }),
            }),
        );
        expect(response.statusCode).toBe(201);
        const invitation = JSON.parse(response.body).invitation;
        expect(invitation).toMatchObject({
            organizationId: "org-a",
            eventId: "event-a",
            email: "invited@example.com",
            role: "exhibitor",
            status: "pending",
        });
    });

    test("invited account atomically creates its membership and draft stand", async () => {
        const invitation = {
            invitationId: "inv-accept",
            organizationId: "org-a",
            eventId: "event-a",
            email: "user-a@example.com",
            status: "pending",
            standName: "Accepted Stand",
            standSlug: "accepted-stand",
            invitedBy: "organizer-user",
            expiresAt: "2099-01-01T00:00:00.000Z",
        };
        mockSend
            .mockResolvedValueOnce({ Item: invitation })
            .mockResolvedValueOnce({
                Item: { organizationId: "org-a", status: "active" },
            })
            .mockResolvedValueOnce({
                Item: {
                    eventId: "event-a",
                    organizationId: "org-a",
                    status: "published",
                },
            })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});
        const response = await invitations(
            apiEvent({
                path: "/invitations/inv-accept/accept",
                httpMethod: "POST",
                body: "{}",
            }),
        );
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.accepted).toBe(true);
        expect(body.stand).toMatchObject({
            organizationId: "org-a",
            eventId: "event-a",
            ownerUserId: "user-a",
            status: "draft",
        });
        expect(mockSend.mock.calls[4][0].type).toBe("TransactWrite");
        expect(mockSend.mock.calls[4][0].input.TransactItems).toHaveLength(3);
    });

    test("replaying an accepted invitation is idempotent", async () => {
        mockSend.mockResolvedValueOnce({
            Item: {
                invitationId: "inv-used",
                organizationId: "org-a",
                eventId: "event-a",
                email: "user-a@example.com",
                status: "accepted",
                acceptedBy: "user-a",
                standId: "stand-a",
            },
        });
        const response = await invitations(
            apiEvent({
                path: "/invitations/inv-used/accept",
                httpMethod: "POST",
                body: "{}",
            }),
        );
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toMatchObject({
            accepted: true,
            duplicate: true,
            standId: "stand-a",
        });
        expect(mockSend).toHaveBeenCalledTimes(1);
    });
});

describe("Phase 3 exhibitor stand workflow", () => {
    const ownedDraft = {
        stand_id: "stand-a",
        organizationId: "org-a",
        eventId: "event-a",
        ownerUserId: "user-a",
        name: "Stand A",
        description: "Complete description",
        category: "games",
        status: "draft",
        visibility: "public",
        products: [],
        tags: [],
    };

    test("lists and reads only stands owned by the current exhibitor", async () => {
        mockSend.mockResolvedValueOnce({ Items: [ownedDraft] });
        const list = await exhibitorStands(
            apiEvent({ path: "/exhibitor/stands", httpMethod: "GET" }),
        );
        expect(list.statusCode).toBe(200);
        expect(JSON.parse(list.body).stands).toHaveLength(1);

        mockSend.mockReset();
        mockSend.mockResolvedValueOnce({ Item: ownedDraft });
        const read = await exhibitorStands(
            apiEvent({
                path: "/exhibitor/stands/stand-a",
                httpMethod: "GET",
            }),
        );
        expect(read.statusCode).toBe(200);
        expect(JSON.parse(read.body).stand.stand_id).toBe("stand-a");
    });

    test("updates an editable stand and writes an audit event", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: ownedDraft })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});
        const response = await exhibitorStands(
            apiEvent({
                path: "/exhibitor/stands/stand-a",
                httpMethod: "PUT",
                body: JSON.stringify({
                    name: "Updated Stand",
                    category: "role-playing-games",
                    description: "Updated description",
                    tags: ["rpg", "pilot"],
                    products: [
                        {
                            id: "product-a",
                            name: "Product A",
                            priceInCents: 1200,
                            currency: "eur",
                        },
                    ],
                }),
            }),
        );
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).stand.name).toBe("Updated Stand");
        expect(mockSend.mock.calls[1][0].input.Item.products[0]).toMatchObject({
            productId: "product-a",
            priceInCents: 1200,
        });
    });

    test("submits a complete draft for review", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: ownedDraft })
            .mockResolvedValueOnce({
                Item: {
                    eventId: "event-a",
                    organizationId: "org-a",
                    status: "published",
                },
            })
            .mockResolvedValueOnce({
                Attributes: { ...ownedDraft, status: "pending_review" },
            })
            .mockResolvedValueOnce({});
        const response = await exhibitorStands(
            apiEvent({
                path: "/exhibitor/stands/stand-a/submit",
                httpMethod: "POST",
                body: "{}",
            }),
        );
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).stand.status).toBe("pending_review");
    });
});

describe("Phase 3 exhibitor lead workflow", () => {
    const stand = {
        stand_id: "stand-a",
        organizationId: "org-a",
        eventId: "event-a",
        ownerUserId: "user-a",
    };
    const lead = {
        leadId: "lead-a",
        standId: "stand-a",
        organizationId: "org-a",
        eventId: "event-a",
        name: "Lead A",
        email: "lead@example.com",
        message: "Interested",
        status: "new",
        createdAt: "2026-07-14T10:00:00.000Z",
        sourceHash: "private",
        ttl: 123,
    };

    test("lists and exports leads for an owned stand", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: stand })
            .mockResolvedValueOnce({ Items: [lead] });
        const response = await exhibitorLeads(
            apiEvent({
                path: "/exhibitor/leads",
                httpMethod: "GET",
                queryStringParameters: { standId: "stand-a" },
            }),
        );
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.leads[0].sourceHash).toBeUndefined();

        mockSend.mockReset();
        mockSend
            .mockResolvedValueOnce({ Item: stand })
            .mockResolvedValueOnce({ Items: [lead] });
        const csv = await exhibitorLeads(
            apiEvent({
                path: "/exhibitor/leads/export",
                httpMethod: "GET",
                queryStringParameters: { standId: "stand-a" },
            }),
        );
        expect(csv.statusCode).toBe(200);
        expect(csv.headers["Content-Type"]).toContain("text/csv");
        expect(csv.body).toContain("lead@example.com");
    });

    test("updates a lead after verifying stand ownership", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: lead })
            .mockResolvedValueOnce({ Item: stand })
            .mockResolvedValueOnce({
                Attributes: { ...lead, status: "contacted", notes: "Called" },
            })
            .mockResolvedValueOnce({});
        const response = await exhibitorLeads(
            apiEvent({
                path: "/exhibitor/leads/lead-a",
                httpMethod: "PATCH",
                body: JSON.stringify({ status: "contacted", notes: "Called" }),
            }),
        );
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).lead.status).toBe("contacted");
    });
});

describe("Phase 3 public event detail", () => {
    const publishedEvent = {
        eventId: "event-public",
        organizationId: "org-a",
        name: "Public Event",
        description: "Description",
        status: "published",
        visibility: "public",
        publicStatus: "published",
        startsAt: "2026-09-01T08:00:00.000Z",
        endsAt: "2026-09-01T18:00:00.000Z",
        timezone: "Europe/Rome",
    };

    test("returns a public event detail", async () => {
        mockSend.mockResolvedValueOnce({ Item: publishedEvent });
        const response = await publicEvents(
            apiEvent({
                path: "/events/event-public",
                httpMethod: "GET",
                requestContext: {},
            }),
        );
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).event.name).toBe("Public Event");
    });

    test("returns only public stands belonging to a public event", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: publishedEvent })
            .mockResolvedValueOnce({
                Items: [
                    {
                        stand_id: "stand-public",
                        eventId: "event-public",
                        name: "Public Stand",
                        status: "published",
                        publicStatus: "published",
                        eventStatus: "published",
                        visibility: "public",
                    },
                    {
                        stand_id: "stand-hidden",
                        eventId: "event-public",
                        name: "Hidden Stand",
                        status: "draft",
                        visibility: "public",
                    },
                ],
            });
        const response = await publicEvents(
            apiEvent({
                path: "/events/event-public/stands",
                httpMethod: "GET",
                requestContext: {},
            }),
        );
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).stands).toHaveLength(1);
    });
});

describe("Phase 4 tenant operations", () => {
    test("updates an organization onboarding profile", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({
                Item: {
                    organizationId: "org-a",
                    name: "Old name",
                    status: "active",
                },
            })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});
        const response = await organizations(
            apiEvent({
                httpMethod: "PATCH",
                path: "/organizations/org-a",
                body: JSON.stringify({
                    name: "Updated Org",
                    billingEmail: "billing@example.com",
                    timezone: "Europe/Rome",
                    locale: "it-IT",
                    profileCompleted: true,
                }),
            }),
        );
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).organization).toMatchObject({
            name: "Updated Org",
            billingEmail: "billing@example.com",
            profileCompleted: true,
            schemaVersion: 2,
        });
    });

    test("lists and grants tenant memberships", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({ Items: [membership("owner")] });
        const listed = await organizations(
            apiEvent({
                path: "/organizations/org-a/memberships",
                httpMethod: "GET",
            }),
        );
        expect(listed.statusCode).toBe(200);
        expect(JSON.parse(listed.body).count).toBe(1);

        mockSend.mockReset();
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});
        const created = await organizations(
            apiEvent({
                path: "/organizations/org-a/memberships",
                httpMethod: "POST",
                body: JSON.stringify({
                    userId: "new-organizer-user",
                    role: "organizer",
                }),
            }),
        );
        expect(created.statusCode).toBe(201);
        expect(JSON.parse(created.body).membership.role).toBe("organizer");
    });

    test("an owner suspends and removes a non-owner membership", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({
                Item: {
                    userId: "member-user",
                    organizationId: "org-a",
                    role: "exhibitor",
                    status: "active",
                },
            })
            .mockResolvedValueOnce({
                Attributes: {
                    userId: "member-user",
                    organizationId: "org-a",
                    role: "exhibitor",
                    status: "suspended",
                },
            })
            .mockResolvedValueOnce({});
        const updated = await organizations(
            apiEvent({
                path: "/organizations/org-a/memberships/member-user",
                httpMethod: "PATCH",
                body: JSON.stringify({
                    role: "exhibitor",
                    status: "suspended",
                }),
            }),
        );
        expect(updated.statusCode).toBe(200);
        expect(JSON.parse(updated.body).membership.status).toBe("suspended");

        mockSend.mockReset();
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({
                Item: {
                    userId: "member-user",
                    organizationId: "org-a",
                    role: "exhibitor",
                    status: "suspended",
                },
            })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});
        const removed = await organizations(
            apiEvent({
                path: "/organizations/org-a/memberships/member-user",
                httpMethod: "DELETE",
            }),
        );
        expect(removed.statusCode).toBe(200);
        expect(JSON.parse(removed.body).removed).toBe(true);
        expect(mockSend.mock.calls[2][0].type).toBe("Delete");
    });

    test("returns an organization entitlement", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: membership("organizer") })
            .mockResolvedValueOnce({
                Item: {
                    organizationId: "org-a",
                    plan: "starter",
                    status: "active",
                },
            });
        const response = await organizations(
            apiEvent({
                path: "/organizations/org-a/entitlement",
                httpMethod: "GET",
            }),
        );
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).entitlement.plan).toBe("starter");
    });

    test("duplicates an event as a new draft within entitlement limits", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({
                Item: {
                    eventId: "event-a",
                    organizationId: "org-a",
                    name: "Annual Fair",
                    description: "Source",
                    visibility: "public",
                    status: "published",
                },
            })
            .mockResolvedValueOnce({
                Item: {
                    organizationId: "org-a",
                    status: "active",
                    maxActiveEvents: 3,
                },
            })
            .mockResolvedValueOnce({ Count: 1 })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});
        const response = await events(
            apiEvent({
                path: "/organizations/org-a/events/event-a/duplicate",
                httpMethod: "POST",
                body: JSON.stringify({
                    name: "Annual Fair 2027",
                    startsAt: "2027-09-01T08:00:00.000Z",
                    endsAt: "2027-09-01T18:00:00.000Z",
                    timezone: "Europe/Rome",
                }),
            }),
        );
        expect(response.statusCode).toBe(201);
        expect(JSON.parse(response.body).event).toMatchObject({
            name: "Annual Fair 2027",
            status: "draft",
            duplicatedFrom: "event-a",
        });
    });

    test("archives an event and hides all of its stands", async () => {
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({
                Item: {
                    eventId: "event-a",
                    organizationId: "org-a",
                    name: "Annual Fair",
                    status: "published",
                },
            })
            .mockResolvedValueOnce({
                Attributes: {
                    eventId: "event-a",
                    organizationId: "org-a",
                    name: "Annual Fair",
                    status: "archived",
                },
            })
            .mockResolvedValueOnce({
                Items: [{ stand_id: "stand-a" }, { stand_id: "stand-b" }],
            })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});
        const response = await events(
            apiEvent({
                path: "/organizations/org-a/events/event-a/archive",
                httpMethod: "POST",
                body: JSON.stringify({}),
            }),
        );
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).event.status).toBe("archived");
        expect(mockSend.mock.calls[4][0].input.Key.stand_id).toBe("stand-a");
        expect(mockSend.mock.calls[5][0].input.Key.stand_id).toBe("stand-b");
    });

    test("lists, revokes and resends event invitations", async () => {
        const invitation = {
            invitationId: "inv-manage",
            organizationId: "org-a",
            eventId: "event-a",
            email: "invite@example.com",
            standName: "Managed Stand",
            status: "pending",
        };
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({
                Item: { eventId: "event-a", organizationId: "org-a" },
            })
            .mockResolvedValueOnce({ Items: [invitation] });
        const listed = await invitations(
            apiEvent({
                path: "/organizations/org-a/events/event-a/invitations",
                httpMethod: "GET",
            }),
        );
        expect(listed.statusCode).toBe(200);
        expect(JSON.parse(listed.body).invitations).toHaveLength(1);

        mockSend.mockReset();
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({ Item: invitation })
            .mockResolvedValueOnce({
                Item: { eventId: "event-a", organizationId: "org-a" },
            })
            .mockResolvedValueOnce({ Item: { organizationId: "org-a" } })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});
        const revoked = await invitations(
            apiEvent({
                path: "/organizations/org-a/events/event-a/invitations/inv-manage",
                httpMethod: "DELETE",
            }),
        );
        expect(revoked.statusCode).toBe(200);
        expect(JSON.parse(revoked.body).revoked).toBe(true);

        mockSend.mockReset();
        mockSend
            .mockResolvedValueOnce({ Item: membership("owner") })
            .mockResolvedValueOnce({ Item: invitation })
            .mockResolvedValueOnce({
                Item: {
                    eventId: "event-a",
                    organizationId: "org-a",
                    name: "Annual Fair",
                },
            })
            .mockResolvedValueOnce({
                Item: { organizationId: "org-a", name: "Org A" },
            })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});
        const resent = await invitations(
            apiEvent({
                path: "/organizations/org-a/events/event-a/invitations/inv-manage/resend",
                httpMethod: "POST",
                body: JSON.stringify({}),
            }),
        );
        expect(resent.statusCode).toBe(200);
        expect(JSON.parse(resent.body).resent).toBe(true);
    });
});
