/**
 * Dashboard templates — pure functions that return HTML strings.
 *
 * Same convention as core/templates.js: no DOM access, no side effects.
 * Every function takes only the data it needs and returns a string.
 * Event binding is the caller's responsibility (dashboard.js).
 */

import { escapeHtml, formatDate, formatPrice } from "../core/helpers.js";

// ─── Shell ────────────────────────────────────────────────────────────────────

export function dashboardShellHTML({
    username,
    stats,
    ordersHTML,
    savedStandsHTML,
}) {
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
        { value: stats.totalOrders ?? 0, label: "Total Orders" },
        { value: formatPrice(stats.totalSpent ?? 0), label: "Total Spent" },
        { value: stats.savedStands ?? 0, label: "Saved Stands" },
    ];
    return items
        .map(
            ({ value, label }) => `
        <div class="stat-card">
            <div class="stat-value">${escapeHtml(String(value))}</div>
            <div class="stat-label">${label}</div>
        </div>`,
        )
        .join("");
}

export function ordersHTML(orders = []) {
    if (orders.length === 0) {
        return '<p class="empty-message">No orders yet</p>';
    }

    const cards = orders
        .map((order) => {
            const orderId = order.orderId || order.order_id || "";
            const total =
                typeof order.amountInCents === "number"
                    ? order.amountInCents / 100
                    : (order.total ?? 0);
            const createdAt = order.createdAt || order.created_at;

            return `
        <div class="order-card">
            <div class="order-header">
                <span class="order-id">Order #${escapeHtml(orderId.substring(0, 8))}</span>
                <span class="order-status status-${escapeHtml(order.status ?? "")}">${escapeHtml(order.status ?? "")}</span>
            </div>
            <div class="order-body">
                <p>${order.items?.length ?? 0} items</p>
                <p class="order-total">${formatPrice(total)}</p>
                <p class="order-date">${formatDate(createdAt)}</p>
            </div>
            <button class="btn btn-sm btn-secondary" data-action="view-order" data-id="${escapeHtml(orderId)}">
                View Details
            </button>
        </div>`;
        })
        .join("");

    const loadMore =
        orders.length >= 10
            ? '<button class="btn btn-secondary" data-action="load-more-orders">Load More</button>'
            : "";

    return `<div class="orders-list">${cards}</div>${loadMore}`;
}

export function savedStandsHTML(stands = []) {
    if (stands.length === 0) {
        return '<p class="empty-message">No saved stands</p>';
    }

    return `
        <div class="saved-stands-grid">
            ${stands
                .map((stand) => {
                    const standId = stand.standId || stand.stand_id || "";
                    const imageUrl = stand.imageUrl || stand.image_url || "";
                    return `
                <div class="saved-stand-card">
                    <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(stand.name)}">
                    <h4>${escapeHtml(stand.name)}</h4>
                    <div class="saved-stand-actions">
                        <button class="btn btn-sm btn-primary"
                                data-action="visit-stand"
                                data-id="${escapeHtml(standId)}">
                            Visit
                        </button>
                        <button class="btn btn-sm btn-secondary"
                                data-action="unsave-stand"
                                data-id="${escapeHtml(standId)}">
                            Remove
                        </button>
                    </div>
                </div>`;
                })
                .join("")}
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
            <button class="btn btn-danger" data-testid="delete-account" data-action="delete-account">Delete Account</button>
        </div>`;
}

// ─── Modals ───────────────────────────────────────────────────────────────────

export function editProfileFormHTML(attrs = {}) {
    return `
        <form id="editProfileForm">
            <div class="form-group">
                <label>First Name</label>
                <input type="text" id="firstName" value="${escapeHtml(attrs.given_name || "")}">
            </div>
            <div class="form-group">
                <label>Last Name</label>
                <input type="text" id="lastName" value="${escapeHtml(attrs.family_name || "")}">
            </div>
            <div class="form-group">
                <label>Company</label>
                <input type="text" id="company" value="${escapeHtml(attrs["custom:company"] || "")}">
            </div>
            <div class="form-group">
                <label>Phone</label>
                <input type="tel" id="phone" value="${escapeHtml(attrs.phone_number || "")}">
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
    const total =
        typeof order.amountInCents === "number"
            ? order.amountInCents / 100
            : (order.total ?? 0);
    const createdAt = order.createdAt || order.created_at;
    const items = (order.items || [])
        .map((item) => {
            const name =
                item.productName || item.name || item.product_name || "Product";
            const unitPrice =
                typeof item.priceInCents === "number"
                    ? item.priceInCents / 100
                    : item.price || 0;
            return `
        <div class="order-item">
            <span>${escapeHtml(name)}</span>
            <span>×${item.quantity}</span>
            <span>${formatPrice(unitPrice * item.quantity)}</span>
        </div>`;
        })
        .join("");

    return `
        <div class="order-details">
            <div class="order-info">
                <p><strong>Status:</strong> ${escapeHtml(order.status)}</p>
                <p><strong>Date:</strong> ${formatDate(createdAt)}</p>
                <p><strong>Total:</strong> ${formatPrice(total)}</p>
            </div>
            <h3>Items</h3>
            <div class="order-items">${items}</div>
        </div>`;
}
