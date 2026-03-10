/**
 * Dashboard templates — pure functions that return HTML strings.
 *
 * Same convention as core/templates.js: no DOM access, no side effects.
 * Every function takes only the data it needs and returns a string.
 * Event binding is the caller's responsibility (dashboard.js).
 */

import { escapeHtml, formatDate, formatPrice } from '../core/helpers.js';

// ─── Shell ────────────────────────────────────────────────────────────────────

export function dashboardShellHTML({ username, stats, ordersHTML, savedStandsHTML }) {
    return `
        <div class="dashboard">
            <div class="dashboard-header">
                <h1>Welcome back, ${escapeHtml(username)}!</h1>
                <button class="btn btn-secondary" id="db-edit-profile">Edit Profile</button>
            </div>

            <div class="dashboard-stats">
                ${statsHTML(stats)}
            </div>

            <div class="dashboard-grid">
                <div class="dashboard-left">
                    <div class="dashboard-section">
                        <h2>Recent Orders</h2>
                        ${ordersHTML}
                    </div>
                    <div class="dashboard-section">
                        <h2>Saved Stands</h2>
                        ${savedStandsHTML}
                    </div>
                </div>
                <div class="dashboard-right">
                    <div class="dashboard-section">
                        <h2>Quick Actions</h2>
                        ${quickActionsHTML()}
                    </div>
                    <div class="dashboard-section">
                        <h2>Account Settings</h2>
                        ${accountSettingsHTML()}
                    </div>
                </div>
            </div>
        </div>`;
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export function statsHTML(stats = {}) {
    const items = [
        { value: stats.totalOrders ?? 0,                   label: 'Total Orders' },
        { value: formatPrice(stats.totalSpent ?? 0),        label: 'Total Spent' },
        { value: stats.savedStands ?? 0,                   label: 'Saved Stands' },
    ];
    return items.map(({ value, label }) => `
        <div class="stat-card">
            <div class="stat-value">${escapeHtml(String(value))}</div>
            <div class="stat-label">${label}</div>
        </div>`).join('');
}

export function ordersHTML(orders = []) {
    if (orders.length === 0) {
        return '<p class="empty-message">No orders yet</p>';
    }

    const cards = orders.map(order => `
        <div class="order-card">
            <div class="order-header">
                <span class="order-id">Order #${escapeHtml(order.order_id?.substring(0, 8) ?? '')}</span>
                <span class="order-status status-${escapeHtml(order.status ?? '')}">${escapeHtml(order.status ?? '')}</span>
            </div>
            <div class="order-body">
                <p>${order.items?.length ?? 0} items</p>
                <p class="order-total">${formatPrice(order.total ?? 0)}</p>
                <p class="order-date">${formatDate(order.created_at)}</p>
            </div>
            <button class="btn btn-sm btn-secondary" data-action="view-order" data-id="${escapeHtml(order.order_id)}">
                View Details
            </button>
        </div>`).join('');

    const loadMore = orders.length >= 10
        ? '<button class="btn btn-secondary" data-action="load-more-orders">Load More</button>'
        : '';

    return `<div class="orders-list">${cards}</div>${loadMore}`;
}

export function savedStandsHTML(stands = []) {
    if (stands.length === 0) {
        return '<p class="empty-message">No saved stands</p>';
    }

    return `
        <div class="saved-stands-grid">
            ${stands.map(stand => `
                <div class="saved-stand-card">
                    <img src="${escapeHtml(stand.image_url || '')}" alt="${escapeHtml(stand.name)}">
                    <h4>${escapeHtml(stand.name)}</h4>
                    <div class="saved-stand-actions">
                        <button class="btn btn-sm btn-primary"
                                data-action="visit-stand"
                                data-id="${escapeHtml(stand.stand_id)}">
                            Visit
                        </button>
                        <button class="btn btn-sm btn-secondary"
                                data-action="unsave-stand"
                                data-id="${escapeHtml(stand.stand_id)}">
                            Remove
                        </button>
                    </div>
                </div>`).join('')}
        </div>`;
}

export function quickActionsHTML() {
    return `
        <div class="quick-actions">
            <button class="action-btn" data-action="browse-stands">
                <span class="action-icon">🏢</span>
                <span class="action-label">Browse Stands</span>
            </button>
            <button class="action-btn" data-action="view-cart">
                <span class="action-icon">🛒</span>
                <span class="action-label">View Cart</span>
            </button>
            <button class="action-btn" data-action="recommendations">
                <span class="action-icon">✨</span>
                <span class="action-label">Recommendations</span>
            </button>
            <button class="action-btn" data-action="download-data">
                <span class="action-icon">📥</span>
                <span class="action-label">Download Data</span>
            </button>
        </div>`;
}

export function accountSettingsHTML() {
    // Email is injected by dashboard.js after render via data attribute
    return `
        <div class="account-settings">
            <div class="setting-item">
                <span>Email</span>
                <span id="db-user-email">—</span>
            </div>
            <div class="setting-item">
                <span>Language</span>
                <button class="btn btn-sm btn-secondary" data-action="change-language">Change</button>
            </div>
            <div class="setting-item">
                <span>Password</span>
                <button class="btn btn-sm btn-secondary" data-action="change-password">Change</button>
            </div>
            <div class="setting-item">
                <span>Notifications</span>
                <button class="btn btn-sm btn-secondary" data-action="manage-notifications">Manage</button>
            </div>
            <hr>
            <button class="btn btn-danger" data-action="delete-account">Delete Account</button>
        </div>`;
}

// ─── Modals ───────────────────────────────────────────────────────────────────

export function editProfileFormHTML(attrs = {}) {
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
        </form>`;
}

export function changePasswordFormHTML() {
    return `
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
        </form>`;
}

export function orderDetailsHTML(order) {
    const items = (order.items || []).map(item => `
        <div class="order-item">
            <span>${escapeHtml(item.product_name)}</span>
            <span>×${item.quantity}</span>
            <span>${formatPrice((item.price || 0) * item.quantity)}</span>
        </div>`).join('');

    return `
        <div class="order-details">
            <div class="order-info">
                <p><strong>Status:</strong> ${escapeHtml(order.status)}</p>
                <p><strong>Date:</strong> ${formatDate(order.created_at)}</p>
                <p><strong>Total:</strong> ${formatPrice(order.total ?? 0)}</p>
            </div>
            <h3>Items</h3>
            <div class="order-items">${items}</div>
        </div>`;
}
