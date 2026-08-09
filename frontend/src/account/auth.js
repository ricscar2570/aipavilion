/**
 * Cognito authentication service.
 *
 * The browser talks directly to Cognito. Protected API calls use the Cognito
 * access token; passwords never pass through AI Pavilion Lambda functions.
 */

import {
    CognitoUserPool,
    CognitoUser,
    AuthenticationDetails,
    CognitoUserAttribute,
} from "amazon-cognito-identity-js";
import { CONFIG } from "../core/config.js";
import { EVENT_TYPES } from "../core/constants.js";

const STORAGE_KEYS = { USER_EMAIL: "ai_pavilion_user_email" };

class AuthService {
    constructor() {
        this._pool = null;
        this._cognitoUser = null;
        this._session = null;
        this._pendingChallenge = null;
        this._listeners = [];
        this._initPool();
    }

    _initPool() {
        const { userPoolId, clientId } = CONFIG.aws.cognito;
        if (!userPoolId || !clientId) {
            console.warn("[AuthService] Cognito is not configured");
            return;
        }
        this._pool = new CognitoUserPool({
            UserPoolId: userPoolId,
            ClientId: clientId,
        });
    }

    _requirePool() {
        if (!this._pool) {
            throw new Error("Cognito is not configured.");
        }
    }

    _userFor(email) {
        this._requirePool();
        return new CognitoUser({ Username: email, Pool: this._pool });
    }

    _completeAuthentication(cognitoUser, session, email) {
        this._cognitoUser = cognitoUser;
        this._session = session;
        this._pendingChallenge = null;
        this._persistSession(session, email || cognitoUser.getUsername());
        this._notify(EVENT_TYPES.USER_LOGGED_IN, {
            username: email || cognitoUser.getUsername(),
        });
        return { user: cognitoUser, session };
    }

    _challengeError(code, details = {}) {
        return Object.assign(new Error(code), { code, ...details });
    }

    signUp(email, password, attributes = {}) {
        this._requirePool();
        const attrList = [];
        const mapping = {
            givenName: "given_name",
            familyName: "family_name",
            company: "custom:company",
        };
        for (const [key, name] of Object.entries(mapping)) {
            if (attributes[key]) {
                attrList.push(
                    new CognitoUserAttribute({ Name: name, Value: attributes[key] }),
                );
            }
        }
        return new Promise((resolve, reject) => {
            this._pool.signUp(email, password, attrList, null, (err, result) => {
                if (err) return reject(err);
                resolve({
                    userSub: result.userSub,
                    userConfirmed: result.userConfirmed,
                });
            });
        });
    }

    confirmSignUp(email, code) {
        return new Promise((resolve, reject) => {
            this._userFor(email).confirmRegistration(code, true, (err, res) =>
                err ? reject(err) : resolve(res),
            );
        });
    }

    resendConfirmationCode(email) {
        return new Promise((resolve, reject) => {
            this._userFor(email).resendConfirmationCode((err, res) =>
                err ? reject(err) : resolve(res),
            );
        });
    }

    signIn(email, password) {
        const cognitoUser = this._userFor(email);
        const authDetails = new AuthenticationDetails({
            Username: email,
            Password: password,
        });
        return new Promise((resolve, reject) => {
            const callbacks = {
                onSuccess: (session) =>
                    resolve(this._completeAuthentication(cognitoUser, session, email)),
                onFailure: reject,
                newPasswordRequired: (userAttributes, requiredAttributes) => {
                    this._pendingChallenge = {
                        type: "NEW_PASSWORD_REQUIRED",
                        cognitoUser,
                        email,
                        userAttributes,
                        requiredAttributes: requiredAttributes || [],
                    };
                    reject(
                        this._challengeError("NEW_PASSWORD_REQUIRED", {
                            requiredAttributes: requiredAttributes || [],
                        }),
                    );
                },
                mfaRequired: (challengeName, challengeParameters) => {
                    this._pendingChallenge = {
                        type: "MFA_REQUIRED",
                        cognitoUser,
                        email,
                        mfaType: challengeName || "SMS_MFA",
                        challengeParameters,
                    };
                    reject(
                        this._challengeError("MFA_REQUIRED", {
                            mfaType: challengeName || "SMS_MFA",
                        }),
                    );
                },
                totpRequired: (challengeName, challengeParameters) => {
                    this._pendingChallenge = {
                        type: "MFA_REQUIRED",
                        cognitoUser,
                        email,
                        mfaType: challengeName || "SOFTWARE_TOKEN_MFA",
                        challengeParameters,
                    };
                    reject(
                        this._challengeError("MFA_REQUIRED", {
                            mfaType: challengeName || "SOFTWARE_TOKEN_MFA",
                        }),
                    );
                },
            };
            cognitoUser.authenticateUser(authDetails, callbacks);
        });
    }

    completeNewPassword(newPassword, attributes = {}) {
        const pending = this._pendingChallenge;
        if (pending?.type !== "NEW_PASSWORD_REQUIRED") {
            return Promise.reject(new Error("No new-password challenge is active"));
        }
        const cleanAttributes = { ...attributes };
        delete cleanAttributes.email_verified;
        delete cleanAttributes.email;
        return new Promise((resolve, reject) => {
            pending.cognitoUser.completeNewPasswordChallenge(
                newPassword,
                cleanAttributes,
                {
                    onSuccess: (session) =>
                        resolve(
                            this._completeAuthentication(
                                pending.cognitoUser,
                                session,
                                pending.email,
                            ),
                        ),
                    onFailure: reject,
                    mfaRequired: (challengeName, challengeParameters) => {
                        this._pendingChallenge = {
                            type: "MFA_REQUIRED",
                            cognitoUser: pending.cognitoUser,
                            email: pending.email,
                            mfaType: challengeName || "SMS_MFA",
                            challengeParameters,
                        };
                        reject(
                            this._challengeError("MFA_REQUIRED", {
                                mfaType: challengeName || "SMS_MFA",
                            }),
                        );
                    },
                    totpRequired: (challengeName, challengeParameters) => {
                        this._pendingChallenge = {
                            type: "MFA_REQUIRED",
                            cognitoUser: pending.cognitoUser,
                            email: pending.email,
                            mfaType: challengeName || "SOFTWARE_TOKEN_MFA",
                            challengeParameters,
                        };
                        reject(
                            this._challengeError("MFA_REQUIRED", {
                                mfaType: challengeName || "SOFTWARE_TOKEN_MFA",
                            }),
                        );
                    },
                },
            );
        });
    }

    completeMfa(code) {
        const pending = this._pendingChallenge;
        if (pending?.type !== "MFA_REQUIRED") {
            return Promise.reject(new Error("No MFA challenge is active"));
        }
        return new Promise((resolve, reject) => {
            pending.cognitoUser.sendMFACode(
                code,
                {
                    onSuccess: (session) =>
                        resolve(
                            this._completeAuthentication(
                                pending.cognitoUser,
                                session,
                                pending.email,
                            ),
                        ),
                    onFailure: reject,
                },
                pending.mfaType,
            );
        });
    }

    cancelChallenge() {
        this._pendingChallenge = null;
    }

    getCurrentUser() {
        if (!this._pool) return Promise.resolve(null);
        const cognitoUser = this._pool.getCurrentUser();
        if (!cognitoUser) return Promise.resolve(null);
        return new Promise((resolve) => {
            cognitoUser.getSession((err, session) => {
                if (err || !session?.isValid()) return resolve(null);
                cognitoUser.getUserAttributes((attrErr, attrs) => {
                    if (attrErr) return resolve(null);
                    const attributes = {};
                    (attrs || []).forEach((item) => {
                        attributes[item.getName()] = item.getValue();
                    });
                    this._cognitoUser = cognitoUser;
                    this._session = session;
                    resolve({
                        username: cognitoUser.getUsername(),
                        attributes,
                        session,
                    });
                });
            });
        });
    }

    signOut({ global = false } = {}) {
        if (!this._pool) return Promise.resolve();
        const cognitoUser = this._pool.getCurrentUser();
        return new Promise((resolve) => {
            const cleanup = () => {
                this._cognitoUser = null;
                this._session = null;
                this._pendingChallenge = null;
                this._clearSession();
                this._notify(EVENT_TYPES.USER_LOGGED_OUT, null);
                resolve();
            };
            if (!cognitoUser) return cleanup();
            if (global && typeof cognitoUser.globalSignOut === "function") {
                cognitoUser.globalSignOut({ onSuccess: cleanup, onFailure: cleanup });
            } else {
                cognitoUser.signOut(cleanup);
            }
        });
    }

    refreshSession() {
        if (!this._cognitoUser || !this._session) {
            return Promise.reject(new Error("No active session"));
        }
        return new Promise((resolve, reject) => {
            this._cognitoUser.refreshSession(
                this._session.getRefreshToken(),
                (err, session) => {
                    if (err) return reject(err);
                    this._session = session;
                    this._persistSession(
                        session,
                        localStorage.getItem(STORAGE_KEYS.USER_EMAIL),
                    );
                    resolve(session);
                },
            );
        });
    }

    forgotPassword(email) {
        const user = this._userFor(email);
        return new Promise((resolve, reject) => {
            user.forgotPassword({
                onSuccess: (data) => resolve(data || {}),
                onFailure: reject,
                inputVerificationCode: (data) => resolve(data || {}),
            });
        });
    }

    confirmPassword(email, code, newPassword) {
        return new Promise((resolve, reject) => {
            this._userFor(email).confirmPassword(code, newPassword, {
                onSuccess: resolve,
                onFailure: reject,
            });
        });
    }

    changePassword(oldPassword, newPassword) {
        if (!this._cognitoUser) {
            return Promise.reject(new Error("Not authenticated"));
        }
        return new Promise((resolve, reject) => {
            this._cognitoUser.changePassword(oldPassword, newPassword, (err, res) =>
                err ? reject(err) : resolve(res),
            );
        });
    }

    beginTotpSetup() {
        if (!this._cognitoUser) {
            return Promise.reject(new Error("Not authenticated"));
        }
        return new Promise((resolve, reject) => {
            this._cognitoUser.associateSoftwareToken({
                associateSecretCode: (secretCode) => resolve({ secretCode }),
                onFailure: reject,
            });
        });
    }

    completeTotpSetup(code, deviceName = "AI Pavilion") {
        if (!this._cognitoUser) {
            return Promise.reject(new Error("Not authenticated"));
        }
        return new Promise((resolve, reject) => {
            this._cognitoUser.verifySoftwareToken(code, deviceName, {
                onSuccess: () => {
                    this._cognitoUser.setUserMfaPreference(
                        null,
                        { Enabled: true, PreferredMfa: true },
                        (error, result) => (error ? reject(error) : resolve(result)),
                    );
                },
                onFailure: reject,
            });
        });
    }

    disableTotp() {
        if (!this._cognitoUser) {
            return Promise.reject(new Error("Not authenticated"));
        }
        return new Promise((resolve, reject) => {
            this._cognitoUser.setUserMfaPreference(
                null,
                { Enabled: false, PreferredMfa: false },
                (error, result) => (error ? reject(error) : resolve(result)),
            );
        });
    }

    updateUserAttributes(attributes = {}) {
        if (!this._cognitoUser) {
            return Promise.reject(new Error("Not authenticated"));
        }
        const values = Object.entries(attributes)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(
                ([Name, Value]) =>
                    new CognitoUserAttribute({ Name, Value: String(Value) }),
            );
        return new Promise((resolve, reject) => {
            this._cognitoUser.updateAttributes(values, (err, result) =>
                err ? reject(err) : resolve(result),
            );
        });
    }

    async getIdToken() {
        const user = await this.getCurrentUser();
        return user ? this._session?.getIdToken()?.getJwtToken() || null : null;
    }

    async getAccessToken() {
        const user = await this.getCurrentUser();
        return user ? this._session?.getAccessToken()?.getJwtToken() || null : null;
    }

    async isAuthenticated() {
        return (await this.getCurrentUser()) !== null;
    }

    subscribe(callback) {
        this._listeners.push(callback);
        return () => {
            this._listeners = this._listeners.filter((item) => item !== callback);
        };
    }

    _notify(event, data) {
        this._listeners.forEach((callback) => {
            try {
                callback(event, data);
            } catch (error) {
                console.error("[AuthService]", error);
            }
        });
    }

    _persistSession(_session, email) {
        if (email) localStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
    }

    _clearSession() {
        Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    }
}

export const authService = new AuthService();
export default authService;
