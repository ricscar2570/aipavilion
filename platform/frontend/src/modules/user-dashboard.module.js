/**
 * AI Pavilion - User Dashboard Module
 */

import { apiService } from '../services/api.service.js';
import { authService } from '../services/auth.service.js';
import { uiManager } from '../ui/ui.manager.js';
import { escapeHtml, formatDate, formatPrice } from '../utils/helpers.js';

class UserDashboardManager {
    constructor() {
        this.currentUser = null;
        this.orders = [];
        this.savedStands = [];
    }

    // ==================== LOAD DASHBOARD ====================

    async loadDashboard(containerId = 'dashboardContainer') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('Container not found');
            return;
        }

        try {
            // Check authentication
            this.currentUser = await authService.getCurrentUser();
            
            if (!this.currentUser) {
                window.location.href = '/login';
                return;
            }

            uiManager.showLoader(containerId, 'Loading your dashboard...');

            // Load dashboard data
            await Promise.all([
                this.loadOrders(),
                this.loadSavedStands(),
                this.loadUserStats()
            ]);

            // Render dashboard
            this.renderDashboard(container);

        } catch (error) {
            console.error('Load dashboard error:', error);
            uiManager.showError(container, 'Failed to load dashboard');
        }
    }

    // ==================== LOAD DATA ====================

    async loadOrders() {
        try {
            this.orders = await apiService.getUserOrders({
                limit: 10,
                sort: 'created_at:desc'
            });
        } catch (error) {
            console.error('Load orders error:', error);
            this.orders = [];
        }
    }

    async loadSavedStands() {
        try {
            const response = await apiService.get('/user/saved-stands');
            this.savedStands = response.stands || [];
        } catch (error) {
            console.error('Load saved stands error:', error);
            this.savedStands = [];
        }
    }

    async loadUserStats() {
        try {
            this.stats = await apiService.get('/user/stats');
        } catch (error) {
            console.error('Load stats error:', error);
            this.stats = {
                totalOrders: 0,
                totalSpent: 0,
                standsVisited: 0,
                savedStands: 0
            };
        }
    }

    // ==================== RENDER DASHBOARD ====================

    renderDashboard(container) {
        container.innerHTML = `
            <div class="dashboard">
                <!-- Header -->
                <div class="dashboard-header">
                    <h1>Welcome back, ${escapeHtml(this.currentUser.username)}!</h1>
                    <button class="btn btn-secondary" onclick="userDashboard.editProfile()">
                        Edit Profile
                    </button>
                </div>

                <!-- Stats Grid -->
                <div class="dashboard-stats">
                    ${this.renderStats()}
                </div>

                <!-- Main Content -->
                <div class="dashboard-grid">
                    <!-- Left Column -->
                    <div class="dashboard-left">
                        <!-- Recent Orders -->
                        <div class="dashboard-section">
                            <h2>Recent Orders</h2>
                            ${this.renderOrders()}
                        </div>

                        <!-- Saved Stands -->
                        <div class="dashboard-section">
                            <h2>Saved Stands</h2>
                            ${this.renderSavedStands()}
                        </div>
                    </div>

                    <!-- Right Column -->
                    <div class="dashboard-right">
                        <!-- Quick Actions -->
                        <div class="dashboard-section">
                            <h2>Quick Actions</h2>
                            ${this.renderQuickActions()}
                        </div>

                        <!-- Account Settings -->
                        <div class="dashboard-section">
                            <h2>Account Settings</h2>
                            ${this.renderAccountSettings()}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ==================== RENDER COMPONENTS ====================

    renderStats() {
        return `
            <div class="stat-card">
                <div class="stat-value">${this.stats?.totalOrders || 0}</div>
                <div class="stat-label">Total Orders</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${formatPrice(this.stats?.totalSpent || 0)}</div>
                <div class="stat-label">Total Spent</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.stats?.standsVisited || 0}</div>
                <div class="stat-label">Stands Visited</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.stats?.savedStands || 0}</div>
                <div class="stat-label">Saved Stands</div>
            </div>
        `;
    }

    renderOrders() {
        if (this.orders.length === 0) {
            return '<p class="empty-message">No orders yet</p>';
        }

        return `
            <div class="orders-list">
                ${this.orders.map(order => `
                    <div class="order-card">
                        <div class="order-header">
                            <span class="order-id">Order #${order.order_id?.substring(0, 8)}</span>
                            <span class="order-status status-${order.status}">${order.status}</span>
                        </div>
                        <div class="order-body">
                            <p>${order.items?.length || 0} items</p>
                            <p class="order-total">${formatPrice(order.total || 0)}</p>
                            <p class="order-date">${formatDate(order.created_at)}</p>
                        </div>
                        <button class="btn btn-sm btn-secondary" 
                                onclick="userDashboard.viewOrder('${order.order_id}')">
                            View Details
                        </button>
                    </div>
                `).join('')}
            </div>
            ${this.orders.length >= 10 ? `
                <button class="btn btn-secondary" onclick="userDashboard.loadMoreOrders()">
                    Load More
                </button>
            ` : ''}
        `;
    }

    renderSavedStands() {
        if (this.savedStands.length === 0) {
            return '<p class="empty-message">No saved stands</p>';
        }

        return `
            <div class="saved-stands-grid">
                ${this.savedStands.map(stand => `
                    <div class="saved-stand-card">
                        <img src="${escapeHtml(stand.image_url || '')}" alt="${escapeHtml(stand.name)}">
                        <h4>${escapeHtml(stand.name)}</h4>
                        <div class="saved-stand-actions">
                            <button class="btn btn-sm btn-primary" 
                                    onclick="window.location.href='/stand/${stand.stand_id}'">
                                Visit
                            </button>
                            <button class="btn btn-sm btn-secondary" 
                                    onclick="userDashboard.unsaveStand('${stand.stand_id}')">
                                Remove
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderQuickActions() {
        return `
            <div class="quick-actions">
                <button class="action-btn" onclick="window.location.href='/stands'">
                    <span class="action-icon">🏢</span>
                    <span class="action-label">Browse Stands</span>
                </button>
                <button class="action-btn" onclick="window.location.href='/cart'">
                    <span class="action-icon">🛒</span>
                    <span class="action-label">View Cart</span>
                </button>
                <button class="action-btn" onclick="userDashboard.viewRecommendations()">
                    <span class="action-icon">✨</span>
                    <span class="action-label">Recommendations</span>
                </button>
                <button class="action-btn" onclick="userDashboard.downloadData()">
                    <span class="action-icon">📥</span>
                    <span class="action-label">Download Data</span>
                </button>
            </div>
        `;
    }

    renderAccountSettings() {
        return `
            <div class="account-settings">
                <div class="setting-item">
                    <span>Email</span>
                    <span>${escapeHtml(this.currentUser.attributes?.email || 'N/A')}</span>
                </div>
                <div class="setting-item">
                    <span>Language</span>
                    <button class="btn btn-sm btn-secondary" onclick="userDashboard.changeLanguage()">
                        Change
                    </button>
                </div>
                <div class="setting-item">
                    <span>Password</span>
                    <button class="btn btn-sm btn-secondary" onclick="userDashboard.changePassword()">
                        Change
                    </button>
                </div>
                <div class="setting-item">
                    <span>Notifications</span>
                    <button class="btn btn-sm btn-secondary" onclick="userDashboard.manageNotifications()">
                        Manage
                    </button>
                </div>
                <hr>
                <button class="btn btn-danger" onclick="userDashboard.deleteAccount()">
                    Delete Account
                </button>
            </div>
        `;
    }

    // ==================== ACTIONS ====================

    editProfile() {
        uiManager.showModal({
            title: 'Edit Profile',
            content: this.renderEditProfileForm(),
            size: 'medium',
            buttons: [
                {
                    label: 'Cancel',
                    className: 'btn-secondary',
                    action: 'cancel'
                },
                {
                    label: 'Save',
                    className: 'btn-primary',
                    action: 'save',
                    onClick: () => this.saveProfile()
                }
            ]
        });
    }

    renderEditProfileForm() {
        const attrs = this.currentUser.attributes || {};
        
        return `
            <form id="editProfileForm">
                <div class="form-group">
                    <label>First Name</label>
                    <input type="text" id="firstName" value="${escapeHtml(attrs.given_name || '')}">
                </div>
                <div class="form-group">
                    <label>Last Name</label>
                    <input type="text" id="lastName" value="${escapeHtml(attrs.family_name || '')}">
                </div>
                <div class="form-group">
                    <label>Company</label>
                    <input type="text" id="company" value="${escapeHtml(attrs['custom:company'] || '')}">
                </div>
                <div class="form-group">
                    <label>Phone</label>
                    <input type="tel" id="phone" value="${escapeHtml(attrs.phone_number || '')}">
                </div>
            </form>
        `;
    }

    async saveProfile() {
        const firstName = document.getElementById('firstName')?.value;
        const lastName = document.getElementById('lastName')?.value;
        const company = document.getElementById('company')?.value;
        const phone = document.getElementById('phone')?.value;

        try {
            await authService.updateUserAttributes({
                given_name: firstName,
                family_name: lastName,
                'custom:company': company,
                phone_number: phone
            });

            uiManager.success('Profile updated successfully!');
            this.loadDashboard();

        } catch (error) {
            console.error('Save profile error:', error);
            uiManager.error('Failed to update profile');
        }
    }

    async viewOrder(orderId) {
        try {
            const order = await apiService.get(`/orders/${orderId}`);
            
            uiManager.showModal({
                title: `Order #${orderId.substring(0, 8)}`,
                content: this.renderOrderDetails(order),
                size: 'large'
            });

        } catch (error) {
            console.error('View order error:', error);
            uiManager.error('Failed to load order details');
        }
    }

    renderOrderDetails(order) {
        return `
            <div class="order-details">
                <div class="order-info">
                    <p><strong>Status:</strong> ${order.status}</p>
                    <p><strong>Date:</strong> ${formatDate(order.created_at)}</p>
                    <p><strong>Total:</strong> ${formatPrice(order.total)}</p>
                </div>
                <h3>Items</h3>
                <div class="order-items">
                    ${order.items.map(item => `
                        <div class="order-item">
                            <span>${escapeHtml(item.product_name)}</span>
                            <span>×${item.quantity}</span>
                            <span>${formatPrice(item.price * item.quantity)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    async unsaveStand(standId) {
        uiManager.showConfirm(
            'Remove this stand from saved items?',
            async () => {
                try {
                    await apiService.delete(`/user/saved-stands/${standId}`);
                    uiManager.success('Stand removed');
                    this.loadDashboard();
                } catch (error) {
                    console.error('Unsave error:', error);
                    uiManager.error('Failed to remove stand');
                }
            }
        );
    }

    changePassword() {
        uiManager.showModal({
            title: 'Change Password',
            content: `
                <form id="changePasswordForm">
                    <div class="form-group">
                        <label>Current Password</label>
                        <input type="password" id="currentPassword" required>
                    </div>
                    <div class="form-group">
                        <label>New Password</label>
                        <input type="password" id="newPassword" required>
                    </div>
                    <div class="form-group">
                        <label>Confirm New Password</label>
                        <input type="password" id="confirmPassword" required>
                    </div>
                </form>
            `,
            buttons: [
                {
                    label: 'Cancel',
                    className: 'btn-secondary',
                    action: 'cancel'
                },
                {
                    label: 'Change Password',
                    className: 'btn-primary',
                    action: 'change',
                    onClick: async () => {
                        const current = document.getElementById('currentPassword')?.value;
                        const newPass = document.getElementById('newPassword')?.value;
                        const confirm = document.getElementById('confirmPassword')?.value;

                        if (newPass !== confirm) {
                            uiManager.error('Passwords do not match');
                            return;
                        }

                        try {
                            await authService.changePassword(current, newPass);
                            uiManager.success('Password changed successfully!');
                        } catch (error) {
                            uiManager.error('Failed to change password');
                        }
                    }
                }
            ]
        });
    }

    async downloadData() {
        try {
            const data = {
                user: this.currentUser,
                orders: this.orders,
                savedStands: this.savedStands,
                stats: this.stats
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `user-data-${Date.now()}.json`;
            link.click();
            URL.revokeObjectURL(url);

            uiManager.success('Data downloaded');

        } catch (error) {
            console.error('Download error:', error);
            uiManager.error('Download failed');
        }
    }

    deleteAccount() {
        uiManager.showConfirm(
            'Are you sure you want to delete your account? This action cannot be undone.',
            async () => {
                try {
                    await apiService.delete('/user/account');
                    await authService.signOut();
                    window.location.href = '/';
                } catch (error) {
                    console.error('Delete account error:', error);
                    uiManager.error('Failed to delete account');
                }
            }
        );
    }
}

// ==================== SINGLETON ====================

export const userDashboard = new UserDashboardManager();
window.userDashboard = userDashboard;

export default userDashboard;
