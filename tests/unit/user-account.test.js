"use strict";

const mockDynamoSend = jest.fn();
const mockCognitoSend = jest.fn();

process.env.COGNITO_USER_POOL_ID = "eu-west-1_TestPool";

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

beforeEach(() => {
    mockDynamoSend.mockReset();
    mockCognitoSend.mockReset();
});

describe("user account deletion", () => {
    test("handles preflight and rejects unsupported methods", async () => {
        const preflight = await handler(
            accountEvent({ httpMethod: "OPTIONS" }),
        );
        expect(preflight.statusCode).toBe(204);

        const method = await handler(accountEvent({ httpMethod: "GET" }));
        expect(method.statusCode).toBe(405);
    });

    test("requires both Cognito user ID and username", async () => {
        const response = await handler(accountEvent({ requestContext: {} }));
        expect(response.statusCode).toBe(401);
    });

    test("deletes saved stands, anonymizes orders, profile, and Cognito user", async () => {
        mockDynamoSend.mockImplementation((command) => {
            if (
                command.type === "Query" &&
                command.input.TableName.includes("saved-stands")
            ) {
                return Promise.resolve({
                    Items: Array.from({ length: 26 }, (_, index) => ({
                        userId: "user-1",
                        standId: `s${index}`,
                    })),
                });
            }
            if (
                command.type === "Query" &&
                command.input.TableName.includes("orders")
            ) {
                return Promise.resolve({
                    Items: [{ orderId: "o1" }, { orderId: "o2" }],
                });
            }
            return Promise.resolve({});
        });
        mockCognitoSend.mockResolvedValue({});

        const response = await handler(accountEvent());
        expect(response.statusCode).toBe(204);

        const commandTypes = mockDynamoSend.mock.calls.map(
            (call) => call[0].type,
        );
        expect(
            commandTypes.filter((type) => type === "BatchWrite"),
        ).toHaveLength(2);
        expect(commandTypes.filter((type) => type === "Update")).toHaveLength(
            2,
        );
        expect(commandTypes.filter((type) => type === "Delete")).toHaveLength(
            1,
        );
        expect(mockCognitoSend).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "AdminDeleteUser",
                input: expect.objectContaining({ Username: "alice" }),
            }),
        );
    });

    test("does not delete the Cognito identity when data cleanup fails", async () => {
        mockDynamoSend.mockRejectedValue(new Error("database unavailable"));
        const response = await handler(accountEvent());
        expect(response.statusCode).toBe(500);
        expect(mockCognitoSend).not.toHaveBeenCalled();
        expect(response.body).not.toContain("database unavailable");
    });
});
