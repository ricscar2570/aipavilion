"use strict";

const mockSend = jest.fn();

jest.mock("@aws-sdk/lib-dynamodb", () => ({
    PutCommand: jest.fn((input) => ({ type: "Put", input })),
    TransactWriteCommand: jest.fn((input) => ({
        type: "TransactWrite",
        input,
    })),
}));

const {
    buildAuditEvent,
    buildAuditTransactPut,
    transactWithAudit,
} = require("../../backend/lambda/common/audit");

beforeEach(() => mockSend.mockReset());

test("builds tenant-scoped expiring audit events", () => {
    const now = new Date("2026-08-06T10:00:00.000Z");
    const event = buildAuditEvent(
        {
            organizationId: "org-a",
            actorUserId: "user-a",
            action: "event.updated",
            resourceType: "event",
            resourceId: "event-a",
            requestId: "request-a",
        },
        now,
    );
    expect(event).toMatchObject({
        organizationId: "org-a",
        actorUserId: "user-a",
        action: "event.updated",
        resourceType: "event",
        resourceId: "event-a",
        createdAt: now.toISOString(),
    });
    expect(event.auditId).toMatch(/^audit_/);
    expect(event.ttl).toBeGreaterThan(Math.floor(now.getTime() / 1000));
});

test("appends an audit put to the same transaction", async () => {
    const client = { send: mockSend };
    mockSend.mockResolvedValue({});
    await transactWithAudit(
        client,
        [
            {
                Update: {
                    TableName: "events",
                    Key: { eventId: "event-a" },
                    UpdateExpression: "SET #status = :status",
                },
            },
        ],
        "audit",
        {
            organizationId: "org-a",
            action: "event.updated",
            resourceType: "event",
            resourceId: "event-a",
        },
    );
    const command = mockSend.mock.calls[0][0];
    expect(command.type).toBe("TransactWrite");
    expect(command.input.TransactItems).toHaveLength(2);
    expect(command.input.TransactItems[1].Put.TableName).toBe("audit");
});

test("can construct an audit transaction item without executing it", () => {
    const item = buildAuditTransactPut("audit", {
        organizationId: "org-a",
        action: "membership.updated",
        resourceType: "membership",
        resourceId: "user-a",
    });
    expect(item.Put.TableName).toBe("audit");
    expect(item.Put.ConditionExpression).toBe(
        "attribute_not_exists(auditId)",
    );
});
