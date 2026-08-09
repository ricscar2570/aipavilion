"use strict";

global.__APP_CONFIG__ = {
    cognitoUserPoolId: "eu-west-1_test",
    cognitoClientId: "client-test",
};

const mockPool = {
    signUp: jest.fn(),
    getCurrentUser: jest.fn(),
};
const mockUser = {
    authenticateUser: jest.fn(),
    completeNewPasswordChallenge: jest.fn(),
    sendMFACode: jest.fn(),
    forgotPassword: jest.fn(),
    confirmPassword: jest.fn(),
    associateSoftwareToken: jest.fn(),
    verifySoftwareToken: jest.fn(),
    setUserMfaPreference: jest.fn(),
    getUsername: jest.fn(() => "alice@example.com"),
};

jest.mock("amazon-cognito-identity-js", () => ({
    CognitoUserPool: jest.fn(() => mockPool),
    CognitoUser: jest.fn(() => mockUser),
    AuthenticationDetails: jest.fn((value) => value),
    CognitoUserAttribute: jest.fn((value) => value),
}));

global.localStorage = {
    values: {},
    getItem(key) {
        return this.values[key] ?? null;
    },
    setItem(key, value) {
        this.values[key] = String(value);
    },
    removeItem(key) {
        delete this.values[key];
    },
    clear() {
        this.values = {};
    },
};

const { authService } = require("../../frontend/src/account/auth.js");

const session = {
    getRefreshToken: jest.fn(() => "refresh"),
    getAccessToken: jest.fn(() => ({ getJwtToken: () => "access" })),
    getIdToken: jest.fn(() => ({ getJwtToken: () => "id" })),
};

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    authService.cancelChallenge();
});

describe("Cognito authentication lifecycle", () => {
    test("completes NEW_PASSWORD_REQUIRED before creating a session", async () => {
        mockUser.authenticateUser.mockImplementation((_details, callbacks) =>
            callbacks.newPasswordRequired({}, []),
        );
        await expect(
            authService.signIn("alice@example.com", "Temporary1!"),
        ).rejects.toMatchObject({ code: "NEW_PASSWORD_REQUIRED" });

        mockUser.completeNewPasswordChallenge.mockImplementation(
            (_password, _attributes, callbacks) => callbacks.onSuccess(session),
        );
        await expect(
            authService.completeNewPassword("PermanentPassword1!"),
        ).resolves.toMatchObject({ session });
    });

    test("submits a software-token MFA code", async () => {
        mockUser.authenticateUser.mockImplementation((_details, callbacks) =>
            callbacks.totpRequired("SOFTWARE_TOKEN_MFA", {}),
        );
        await expect(
            authService.signIn("alice@example.com", "PermanentPassword1!"),
        ).rejects.toMatchObject({
            code: "MFA_REQUIRED",
            mfaType: "SOFTWARE_TOKEN_MFA",
        });

        mockUser.sendMFACode.mockImplementation(
            (_code, callbacks) => callbacks.onSuccess(session),
        );
        await expect(authService.completeMfa("123456")).resolves.toMatchObject({
            session,
        });
        expect(mockUser.sendMFACode).toHaveBeenCalledWith(
            "123456",
            expect.any(Object),
            "SOFTWARE_TOKEN_MFA",
        );
    });

    test("resolves forgot-password when Cognito asks for the verification code", async () => {
        mockUser.forgotPassword.mockImplementation((callbacks) =>
            callbacks.inputVerificationCode({ CodeDeliveryDetails: {} }),
        );
        await expect(
            authService.forgotPassword("alice@example.com"),
        ).resolves.toHaveProperty("CodeDeliveryDetails");
    });

    test("enrolls and disables authenticator MFA", async () => {
        authService._cognitoUser = mockUser;
        mockUser.associateSoftwareToken.mockImplementation((callbacks) =>
            callbacks.associateSecretCode("SECRET"),
        );
        await expect(authService.beginTotpSetup()).resolves.toEqual({
            secretCode: "SECRET",
        });

        mockUser.verifySoftwareToken.mockImplementation(
            (_code, _name, callbacks) => callbacks.onSuccess({}),
        );
        mockUser.setUserMfaPreference.mockImplementation(
            (_sms, _software, callback) => callback(null, "SUCCESS"),
        );
        await expect(
            authService.completeTotpSetup("123456"),
        ).resolves.toBe("SUCCESS");
        await expect(authService.disableTotp()).resolves.toBe("SUCCESS");
    });
});
