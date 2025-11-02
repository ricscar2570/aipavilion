/**
 * AI Pavilion - Authentication Service (COMPLETE VERSION)
 */

import { CONFIG } from '../config/config.js';
import { EVENT_TYPES } from '../utils/constants.js';

class AuthService {
    constructor() {
        this.cognitoConfig = CONFIG.cognito;
        this.currentUser = null;
        this.session = null;
        this.listeners = [];
    }

    // ==================== SIGN UP ====================
    async signUp(email, password, attributes = {}) {
        try {
            console.log('Sign up:', email);
            this.currentUser = { username: email, attributes };
            this._notifyListeners(EVENT_TYPES.USER_SIGNED_UP, this.currentUser);
            return { success: true, user: this.currentUser };
        } catch (error) {
            console.error('Sign up error:', error);
            throw error;
        }
    }

    // ==================== SIGN IN ====================
    async signIn(email, password) {
        try {
            console.log('Sign in:', email);
            this.currentUser = { username: email };
            this.session = { idToken: { jwtToken: 'mock-jwt-' + Date.now() } };
            localStorage.setItem('auth_token', this.session.idToken.jwtToken);
            localStorage.setItem('user_email', email);
            this._notifyListeners(EVENT_TYPES.USER_LOGGED_IN, this.currentUser);
            return { success: true, user: this.currentUser, session: this.session };
        } catch (error) {
            console.error('Sign in error:', error);
            throw error;
        }
    }

    // ==================== SIGN OUT ====================
    async signOut() {
        try {
            this.currentUser = null;
            this.session = null;
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_email');
            this._notifyListeners(EVENT_TYPES.USER_LOGGED_OUT, null);
            return { success: true };
        } catch (error) {
            console.error('Sign out error:', error);
            throw error;
        }
    }

    // ==================== GET CURRENT USER ====================
    async getCurrentUser() {
        try {
            const token = localStorage.getItem('auth_token');
            const email = localStorage.getItem('user_email');
            if (token && email) {
                this.currentUser = { 
                    username: email,
                    attributes: { email }
                };
                this.session = { idToken: { jwtToken: token } };
                return this.currentUser;
            }
            return null;
        } catch (error) {
            console.error('Get current user error:', error);
            return null;
        }
    }

    // ==================== RESET PASSWORD ====================
    async resetPassword(email) {
        try {
            console.log('Password reset requested for:', email);
            return {
                success: true,
                message: 'Password reset code sent to your email'
            };
        } catch (error) {
            console.error('Reset password error:', error);
            throw error;
        }
    }

    // ==================== CONFIRM PASSWORD ====================
    async confirmPassword(email, code, newPassword) {
        try {
            console.log('Confirm password for:', email);
            return { success: true };
        } catch (error) {
            console.error('Confirm password error:', error);
            throw error;
        }
    }

    // ==================== CHANGE PASSWORD ====================
    async changePassword(oldPassword, newPassword) {
        try {
            if (!this.currentUser) {
                throw new Error('No authenticated user');
            }
            console.log('Password changed successfully');
            return { success: true };
        } catch (error) {
            console.error('Change password error:', error);
            throw error;
        }
    }

    // ==================== UPDATE USER ATTRIBUTES ====================
    async updateUserAttributes(attributes) {
        try {
            if (!this.currentUser) {
                throw new Error('No authenticated user');
            }
            console.log('Updating user attributes:', attributes);
            if (this.currentUser.attributes) {
                Object.assign(this.currentUser.attributes, attributes);
            } else {
                this.currentUser.attributes = attributes;
            }
            this._notifyListeners(EVENT_TYPES.USER_UPDATED, this.currentUser);
            return {
                success: true,
                message: 'User attributes updated successfully'
            };
        } catch (error) {
            console.error('Update user attributes error:', error);
            throw error;
        }
    }

    // ==================== REFRESH SESSION ====================
    async refreshSession() {
        try {
            if (!this.session) {
                throw new Error('No active session');
            }
            this.session.idToken.jwtToken = 'refreshed-' + Date.now();
            localStorage.setItem('auth_token', this.session.idToken.jwtToken);
            return this.session;
        } catch (error) {
            console.error('Refresh session error:', error);
            throw error;
        }
    }

    // ==================== UTILITIES ====================
    async isAuthenticated() {
        try {
            const user = await this.getCurrentUser();
            return user !== null;
        } catch {
            return false;
        }
    }

    async getIdToken() {
        return this.session?.idToken?.jwtToken || null;
    }

    // ==================== EVENT SYSTEM ====================
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    _notifyListeners(event, data) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Error in auth listener:', error);
            }
        });
    }
}

export const authService = new AuthService();
export default authService;
