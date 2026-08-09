"use strict";

const mockDynamoSend = jest.fn();
const mockCognitoSend = jest.fn();

process.env.COGNITO_USER_POOL_ID = "eu-west-1_TestPool";
process.env.USERS_TABLE = "users";
process.env.ORDERS_TABLE = "orders";
process.env.SAVED_STANDS_TABLE = "saved-stands";
process.env.MEMBERSHIPS_TABLE = "memberships";
process.env.STANDS_TABLE = "stands";
process.env.OWNER_STANDS_INDEX = "owner-stands-index";

jest.mock("@aws-sdk/client-dynamodb", () => ({
    DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock("@aws-sdk/lib-dynamodb", () => ({
    DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockDynamoSend })) },
    QueryCommand: jest.fn((input) => ({ type: "Query", input })),
    BatchWriteCommand: jest.fn((input) => ({ type: "BatchWrite", input })),
    UpdateCommand: jest.fn((input) => ({ type: "Update", input })),
    DeleteCommand: jest.fn((input) => ({ type: "Delete", input })),
}));

jest.mock("@aws-sdk/client-cognito-identity-provider", () => ({
    CognitoIdentityProviderClient: jest.fn(() => ({ send: mockCognitoSend })),
    AdminDeleteUserCommand: jest.fn((input) => ({
        type: "AdminDeleteUser",
        input,
    })),
}));

const handler = require("../../backend/lambda/user-account/index").handler;

function accountEvent(overrides = {}) {
    return {
        httpMethod: "DELETE",
        path: "/user/account",
        headers: { origin: "http://localhost:3000" },
        requestContext: {
            authorizer: {
                claims: {
                    sub: "user-1",
                    "cognito:username": "alice",
                },
            },
        },
        ...overrides,
    };
}

function queryResult(command, { memberships = [], stands = [], saved = [], orders = [] } = {}) {
    if (command.input.TableName === "memberships") return { Items: memberships };
    if (command.input.TableName === "stands") return { Items: stands };
    if (command.input.TableName === "saved-stands") return { Items: saved };
    if (command.input.TableName === "orders") return { Items: orders };
    return {};
}

beforeEach(() => {
    mockDynamoSend.mockReset();
    mockCognitoSend.mockReset();
});

describe("user account lifecycle", () => {
    test("handles preflight and rejects unsupported methods", async () => {
        expect((await handler(accountEvent({ httpMethod: "OPTIONS" }))).statusCode).toBe(204);
        expect((await handler(accountEvent({ httpMethod: "PATCH" }))).statusCode).toBe(405);
    });

    test("requires Cognito identity", async () => {
        const response = await handler(accountEvent({ requestContext: {} }));
        expect(response.statusCode).toBe(401);
    });

    test("reports ownership and assigned-stand blockers", async () => {
        mockDynamoSend.mockImplementation((command) =>
            Promise.resolve(
                command.type === "Query"
                    ? queryResult(command, {
                          memberships: [
                              {
                                  userId: "user-1",
                                  organizationId: "org-1",
                                  role: "owner",
                                  status: "active",
                              },
                          ],
                          stands: [
                              {
                                  stand_id: "stand-1",
                                  organizationId: "org-1",
                                  eventId: "event-1",
                                  name: "Owned stand",
                              },
                          ],
                      })
                    : {},
            ),
        );
        const response = await handler(accountEvent({ httpMethod: "GET" }));
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.ready).toBe(false);
        expect(body.blockers.map((item) => item.code)).toEqual([
            "OWNERSHIP_TRANSFER_REQUIRED",
            "STAND_REASSIGNMENT_REQUIRED",
        ]);
    });

    test("refuses deletion while the user owns tenant resources", async () => {
        mockDynamoSend.mockImplementation((command) =>
            Promise.resolve(
                command.type === "Query"
                    ? queryResult(command, {
                          memberships: [
                              {
                                  userId: "user-1",
                                  organizationId: "org-1",
                                  role: "owner",
                                  status: "active",
                              },
                          ],
                      })
                    : {},
            ),
        );
        const response = await handler(accountEvent());
        expect(response.statusCode).toBe(409);
        expect(mockCognitoSend).not.toHaveBeenCalled();
    });

    test("deletes memberships and personal data when no blockers remain", async () => {
        const memberships = [
            {
                userId: "user-1",
                organizationId: "org-1",
                role: "organizer",
                status: "active",
            },
        ];
        mockDynamoSend.mockImplementation((command) => {
            if (command.type === "Query") {
                return Promise.resolve(
                    queryResult(command, {
                        memberships,
                        stands: [],
                        saved: Array.from({ length: 26 }, (_, index) => ({
                            userId: "user-1",
                            standId: `s${index}`,
                        })),
                        orders: [{ orderId: "o1" }, { orderId: "o2" }],
                    }),
                );
            }
            return Promise.resolve({});
        });
        mockCognitoSend.mockResolvedValue({});

        const response = await handler(accountEvent());
        expect(response.statusCode).toBe(204);
        const commandTypes = mockDynamoSend.mock.calls.map((call) => call[0].type);
        expect(commandTypes.filter((type) => type === "BatchWrite")).toHaveLength(3);
        expect(commandTypes.filter((type) => type === "Update")).toHaveLength(2);
        expect(commandTypes.filter((type) => type === "Delete")).toHaveLength(1);
        expect(mockCognitoSend).toHaveBeenCalledWith(
            expect.objectContaining({ type: "AdminDeleteUser" }),
        );
    });

    test("does not delete Cognito when cleanup fails", async () => {
        mockDynamoSend.mockRejectedValue(new Error("database unavailable"));
        const response = await handler(accountEvent());
        expect(response.statusCode).toBe(500);
        expect(mockCognitoSend).not.toHaveBeenCalled();
    });
});
