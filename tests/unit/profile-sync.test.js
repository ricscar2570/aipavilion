"use strict";

const mockSend = jest.fn();

jest.mock("@aws-sdk/lib-dynamodb", () => ({
    PutCommand: jest.fn((input) => ({ input })),
}));

jest.mock("../../backend/lambda/common/dynamo", () => ({
    docClient: { send: mockSend },
}));

process.env.USERS_TABLE = "users";

const { handler } = require("../../backend/lambda/profile-sync");

describe("profile sync Cognito trigger", () => {
    beforeEach(() => mockSend.mockReset());

    test("creates the application profile after confirmation", async () => {
        mockSend.mockResolvedValueOnce({});
        const event = {
            triggerSource: "PostConfirmation_ConfirmSignUp",
            userName: "fallback-user",
            request: {
                userAttributes: {
                    sub: "user-123",
                    email: "Person@Example.com",
                    given_name: "Ada",
                    family_name: "Lovelace",
                    "custom:company": "Analytical Engines",
                },
            },
        };

        await expect(handler(event)).resolves.toBe(event);
        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(mockSend.mock.calls[0][0].input.Item).toMatchObject({
            userId: "user-123",
            email: "person@example.com",
            displayName: "Ada Lovelace",
            company: "Analytical Engines",
            role: "visitor",
            schemaVersion: 3,
        });
    });

    test("is idempotent when the profile already exists", async () => {
        const error = new Error("exists");
        error.name = "ConditionalCheckFailedException";
        mockSend.mockRejectedValueOnce(error);
        const event = {
            triggerSource: "PostConfirmation_ConfirmForgotPassword",
            request: {
                userAttributes: { sub: "user-123", email: "p@example.com" },
            },
        };

        await expect(handler(event)).resolves.toBe(event);
    });

    test("ignores unrelated Cognito triggers", async () => {
        const event = { triggerSource: "PreSignUp_SignUp" };
        await expect(handler(event)).resolves.toBe(event);
        expect(mockSend).not.toHaveBeenCalled();
    });
});
