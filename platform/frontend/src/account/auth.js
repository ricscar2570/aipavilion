/**
 * AI Pavilion - Authentication Service
 *
 * Real AWS Cognito integration using amazon-cognito-identity-js.
 * Replaces the previous mock implementation entirely.
 *
 * Usage:
 *   import { authService } from './auth.js';
 *   await authService.signIn(email, password);
 */

import {
    CognitoUserPool,
    CognitoUser,
    AuthenticationDetails,
    CognitoUserAttribute,
} from 'amazon-cognito-identity-js';
import { CONFIG } from '../core/config.js';
import { EVENT_TYPES } from '../core/constants.js';

const STORAGE_KEYS = {
    ID_TOKEN:      'ai_pavilion_id_token',
    ACCESS_TOKEN:  'ai_pavilion_access_token',
    REFRESH_TOKEN: 'ai_pavilion_refresh_token',
    USER_EMAIL:    'ai_pavilion_user_email',
};

class AuthService {
    constructor() {
        this._pool        = null;
        this._cognitoUser = null;
        this._session     = null;
        this._listeners   = [];
        this._initPool();
    }

    _initPool() {
        const { userPoolId, clientId } = CONFIG.aws.cognito;
        // Warn rather than throw — the app should still render for
        // unauthenticated pages even if Cognito is not configured yet.
        if (!userPoolId || !clientId) {
            console.warn('[AuthService] Cognito not configured — set COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID in .env');
            return;
        }
        this._pool = new CognitoUserPool({ UserPoolId: userPoolId, ClientId: clientId });
    }

    _requirePool() {
        if (!this._pool) throw new Error('Cognito not configured. Check COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID in .env.');
    }

    _userFor(email) {
        return new CognitoUser({ Username: email, Pool: this._pool });
    }

    // ─── Sign Up ──────────────────────────────────────────────────────────

    signUp(email, password, attributes = {}) {
        this._requirePool();
        const attrList = [];
        if (attributes.givenName)  attrList.push(new CognitoUserAttribute({ Name: 'given_name',     Value: attributes.givenName }));
        if (attributes.familyName) attrList.push(new CognitoUserAttribute({ Name: 'family_name',    Value: attributes.familyName }));
        if (attributes.company)    attrList.push(new CognitoUserAttribute({ Name: 'custom:company', Value: attributes.company }));

        return new Promise((resolve, reject) => {
            this._pool.signUp(email, password, attrList, null, (err, result) => {
                if (err) return reject(err);
                resolve({ userSub: result.userSub, userConfirmed: result.userConfirmed });
            });
        });
    }

    // ─── Confirm Sign Up ──────────────────────────────────────────────────

    confirmSignUp(email, code) {
        this._requirePool();
        return new Promise((resolve, reject) => {
            this._userFor(email).confirmRegistration(code, true, (err, res) => err ? reject(err) : resolve(res));
        });
    }

    resendConfirmationCode(email) {
        this._requirePool();
        return new Promise((resolve, reject) => {
            this._userFor(email).resendConfirmationCode((err, res) => err ? reject(err) : resolve(res));
        });
    }

    // ─── Sign In ──────────────────────────────────────────────────────────

    signIn(email, password) {
        this._requirePool();
        const authDetails  = new AuthenticationDetails({ Username: email, Password: password });
        const cognitoUser  = this._userFor(email);

        return new Promise((resolve, reject) => {
            cognitoUser.authenticateUser(authDetails, {
                onSuccess: (session) => {
                    this._cognitoUser = cognitoUser;
                    this._session     = session;
                    this._persistSession(session, email);
                    this._notify(EVENT_TYPES.USER_LOGGED_IN, { username: email });
                    resolve({ user: cognitoUser, session });
                },
                onFailure: (err) => reject(err),
                newPasswordRequired: (userAttributes) => {
                    const e = Object.assign(new Error('NEW_PASSWORD_REQUIRED'), { userAttributes, cognitoUser });
                    reject(e);
                },
                mfaRequired: () => {
                    const e = Object.assign(new Error('MFA_REQUIRED'), { cognitoUser });
                    reject(e);
                },
            });
        });
    }

    // ─── Get Current User ─────────────────────────────────────────────────

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
                    (attrs || []).forEach(a => { attributes[a.getName()] = a.getValue(); });
                    this._cognitoUser = cognitoUser;
                    this._session     = session;
                    resolve({ username: cognitoUser.getUsername(), attributes, session });
                });
            });
        });
    }

    // ─── Sign Out ─────────────────────────────────────────────────────────

    signOut() {
        if (!this._pool) return Promise.resolve();
        const cognitoUser = this._pool.getCurrentUser();
        return new Promise((resolve) => {
            const cleanup = () => {
                this._cognitoUser = null;
                this._session     = null;
                this._clearSession();
                this._notify(EVENT_TYPES.USER_LOGGED_OUT, null);
                resolve();
            };
            cognitoUser ? cognitoUser.signOut(cleanup) : cleanup();
        });
    }

    // ─── Token Refresh ────────────────────────────────────────────────────

    refreshSession() {
        if (!this._cognitoUser || !this._session) return Promise.reject(new Error('No active session'));
        const refreshToken = this._session.getRefreshToken();
        return new Promise((resolve, reject) => {
            this._cognitoUser.refreshSession(refreshToken, (err, session) => {
                if (err) return reject(err);
                this._session = session;
                this._persistSession(session, localStorage.getItem(STORAGE_KEYS.USER_EMAIL));
                resolve(session);
            });
        });
    }

    // ─── Password Management ──────────────────────────────────────────────

    forgotPassword(email) {
        this._requirePool();
        return new Promise((resolve, reject) => {
            this._userFor(email).forgotPassword({ onSuccess: resolve, onFailure: reject });
        });
    }

    confirmPassword(email, code, newPassword) {
        this._requirePool();
        return new Promise((resolve, reject) => {
            this._userFor(email).confirmPassword(code, newPassword, { onSuccess: resolve, onFailure: reject });
        });
    }

    changePassword(oldPassword, newPassword) {
        if (!this._cognitoUser) return Promise.reject(new Error('Not authenticated'));
        return new Promise((resolve, reject) => {
            this._cognitoUser.changePassword(oldPassword, newPassword, (err, res) => err ? reject(err) : resolve(res));
        });
    }

    // ─── Tokens ───────────────────────────────────────────────────────────

    async getIdToken() {
        const user = await this.getCurrentUser();
        return user ? (this._session?.getIdToken()?.getJwtToken() || null) : null;
    }

    async getAccessToken() {
        const user = await this.getCurrentUser();
        return user ? (this._session?.getAccessToken()?.getJwtToken() || null) : null;
    }

    async isAuthenticated() {
        return (await this.getCurrentUser()) !== null;
    }

    // ─── Event System ─────────────────────────────────────────────────────

    subscribe(callback) {
        this._listeners.push(callback);
        return () => { this._listeners = this._listeners.filter(cb => cb !== callback); };
    }

    _notify(event, data) {
        this._listeners.forEach(cb => { try { cb(event, data); } catch (e) { console.error('[AuthService]', e); } });
    }

    // ─── Session Persistence ──────────────────────────────────────────────

    _persistSession(session, email) {
        localStorage.setItem(STORAGE_KEYS.ID_TOKEN,      session.getIdToken().getJwtToken());
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN,  session.getAccessToken().getJwtToken());
        localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, session.getRefreshToken().getToken());
        if (email) localStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
    }

    _clearSession() {
        Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    }
}

export const authService = new AuthService();
export default authService;
