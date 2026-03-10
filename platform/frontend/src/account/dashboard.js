/**
 * User Dashboard — routing, data loading, and event binding.
 *
 * No HTML is produced here. All markup lives in dashboard-templates.js.
 * Events are bound via data-action attributes after each render so the
 * template functions stay side-effect-free and testable in isolation.
 */

import { apiService }    from '../core/api.js';
import { authService }   from './auth.js';
import { uiManager }     from '../ui/ui.js';
import {
    dashboardShellHTML,
    ordersHTML,
    savedStandsHTML,
    editProfileFormHTML,
    changePasswordFormHTML,
    orderDetailsHTML,
} from './dashboard-templates.js';

class UserDashboard {
    constructor() {
        this.currentUser  = null;
        this.orders       = [];
        this.savedStands  = [];
        this.stats        = {};
        this._containerId = 'dashboardContainer';
    }

    // ─── Entry point ──────────────────────────────────────────────────────────

    async loadDashboard(containerId = 'dashboardContainer') {
        this._containerId = containerId;
        const container = document.getElementById(containerId);
        if (!container) return;

        this.currentUser = await authService.getCurrentUser();
        if (!this.currentUser) {
            window.location.hash = '/login';
            return;
        }

        uiManager.showLoader(containerId, 'Loading your dashboard...');

        try {
            await Promise.all([
                this._loadOrders(),
                this._loadSavedStands(),
                this._loadStats(),
            ]);
            this._render(container);
        } catch (err) {
            console.error('Dashboard load error:', err);
            uiManager.showError(container, 'Failed to load dashboard');
        }
    }

    // ─── Data loading ─────────────────────────────────────────────────────────

    async _loadOrders() {
        try {
            this.orders = await apiService.getUserOrders({ limit: 10, sort: 'created_at:desc' });
        } catch {
            this.orders = [];
        }
    }

    async _loadSavedStands() {
        try {
            this.savedStands = await apiService.getSavedStands();
        } catch {
            this.savedStands = [];
        }
    }

    async _loadStats() {
        try {
            this.stats = await apiService.getUserStats();
        } catch {
            // Fall back to values computable from local data
            this.stats = {
                totalOrders: this.orders.filter(o => o.status !== 'cancelled').length,
                totalSpent:  this.orders.reduce((s, o) => s + (o.total ?? 0), 0),
                savedStands: this.savedStands.length,
            };
        }
    }

    // ─── Rendering ────────────────────────────────────────────────────────────

    _render(container) {
        const username = this.currentUser.username || this.currentUser.attributes?.email || 'User';
        const email    = this.currentUser.attributes?.email || 'N/A';

        container.innerHTML = dashboardShellHTML({
            username,
            stats:           this.stats,
            ordersHTML:      ordersHTML(this.orders),
            savedStandsHTML: savedStandsHTML(this.savedStands),
        });

        // Inject email into the already-rendered settings panel
        const emailEl = container.querySelector('#db-user-email');
        if (emailEl) emailEl.textContent = email;

        this._bindEvents(container);
    }

    // ─── Event binding ────────────────────────────────────────────────────────

    /**
     * One delegated listener maps data-action attributes to class methods.
     * Adding a new action only requires a new case here — no onclick strings
     * in templates, no global window references.
     */
    _bindEvents(container) {
        container.addEventListener('click', (e) => {
            const btn    = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id     = btn.dataset.id;

            switch (action) {
                case 'view-order':           this.viewOrder(id);         break;
                case 'load-more-orders':     this.loadMoreOrders();      break;
                case 'visit-stand':          window.location.hash = `/stand/${id}`; break;
                case 'unsave-stand':         this.unsaveStand(id);       break;
                case 'browse-stands':        window.location.hash = '/'; break;
                case 'view-cart':            window.location.hash = '/cart'; break;
                case 'recommendations':      this.viewRecommendations(); break;
                case 'download-data':        this.downloadData();        break;
                case 'change-language':      this.changeLanguage();      break;
                case 'change-password':      this.changePassword();      break;
                case 'manage-notifications': this.manageNotifications(); break;
                case 'delete-account':       this.deleteAccount();       break;
            }
        });

        container.querySelector('#db-edit-profile')
            ?.addEventListener('click', () => this.editProfile());
    }

    _refresh() {
        const container = document.getElementById(this._containerId);
        if (container) this._render(container);
    }

    // ─── Actions ──────────────────────────────────────────────────────────────

    async loadMoreOrders() {
        try {
            const more = await apiService.getUserOrders({
                limit: 10, offset: this.orders.length, sort: 'created_at:desc',
            });
            if (!more.length) { uiManager.info('No more orders.'); return; }
            this.orders = [...this.orders, ...more];
            this._refresh();
        } catch {
            uiManager.error('Failed to load more orders.');
        }
    }

    async viewOrder(orderId) {
        try {
            const order = await apiService.getOrder(orderId);
            uiManager.showModal({
                title:   `Order #${orderId.substring(0, 8)}`,
                content: orderDetailsHTML(order),
                size:    'large',
            });
        } catch {
            uiManager.error('Failed to load order details.');
        }
    }

    async unsaveStand(standId) {
        uiManager.showConfirm('Remove this stand from saved items?', async () => {
            try {
                await apiService.deleteSavedStand(standId);
                this.savedStands = this.savedStands.filter(s => s.stand_id !== standId);
                this.stats.savedStands = Math.max(0, (this.stats.savedStands ?? 1) - 1);
                uiManager.success('Stand removed.');
                this._refresh();
            } catch {
                uiManager.error('Failed to remove stand.');
            }
        });
    }

    editProfile() {
        uiManager.showModal({
            title:   'Edit Profile',
            content: editProfileFormHTML(this.currentUser.attributes || {}),
            size:    'medium',
            buttons: [
                { label: 'Cancel', className: 'btn-secondary', action: 'cancel' },
                { label: 'Save',   className: 'btn-primary',   action: 'save', onClick: () => this.saveProfile() },
            ],
        });
    }

    async saveProfile() {
        const get = id => document.getElementById(id)?.value;
        try {
            await authService.updateUserAttributes({
                given_name:       get('firstName'),
                family_name:      get('lastName'),
                'custom:company': get('company'),
                phone_number:     get('phone'),
            });
            uiManager.success('Profile updated.');
            this.loadDashboard(this._containerId);
        } catch {
            uiManager.error('Failed to update profile.');
        }
    }

    changePassword() {
        uiManager.showModal({
            title:   'Change Password',
            content: changePasswordFormHTML(),
            buttons: [
                { label: 'Cancel', className: 'btn-secondary', action: 'cancel' },
                {
                    label: 'Change Password', className: 'btn-primary', action: 'change',
                    onClick: async () => {
                        const current = document.getElementById('currentPassword')?.value;
                        const next    = document.getElementById('newPassword')?.value;
                        const confirm = document.getElementById('confirmPassword')?.value;
                        if (next !== confirm) { uiManager.error('Passwords do not match.'); return; }
                        try {
                            await authService.changePassword(current, next);
                            uiManager.success('Password changed.');
                        } catch {
                            uiManager.error('Failed to change password.');
                        }
                    },
                },
            ],
        });
    }

    viewRecommendations() {
        // Recommendations Lambda not yet implemented — redirect to search.
        window.location.hash = '/search';
    }

    changeLanguage() {
        uiManager.showModal({
            title:   'Change Language',
            content: '<p>Multi-language support is coming soon.</p>',
            buttons: [{ label: 'Close', className: 'btn-secondary', action: 'cancel' }],
        });
    }

    manageNotifications() {
        uiManager.showModal({
            title:   'Notification Preferences',
            content: `
                <div class="form-group">
                    <label><input type="checkbox" id="notifOrders" checked> Order confirmations</label>
                </div>
                <div class="form-group">
                    <label><input type="checkbox" id="notifStands"> New stands in my categories</label>
                </div>`,
            buttons: [
                { label: 'Cancel', className: 'btn-secondary', action: 'cancel' },
                { label: 'Save', className: 'btn-primary', action: 'save',
                  onClick: () => uiManager.success('Preferences saved.') },
            ],
        });
    }

    async downloadData() {
        try {
            const blob = new Blob([JSON.stringify({
                user: this.currentUser, orders: this.orders,
                savedStands: this.savedStands, stats: this.stats,
            }, null, 2)], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `ai-pavilion-data-${Date.now()}.json`;
            link.click();
            URL.revokeObjectURL(url);
            uiManager.success('Data downloaded.');
        } catch {
            uiManager.error('Download failed.');
        }
    }

    deleteAccount() {
        uiManager.showConfirm(
            'Are you sure you want to delete your account? This cannot be undone.',
            async () => {
                try {
                    // TODO: requires a Lambda at DELETE /user/account.
                    // Must also delete the Cognito user and all DynamoDB records.
                    await apiService.delete('/user/account');
                    await authService.signOut();
                    window.location.hash = '/';
                } catch {
                    uiManager.error('Failed to delete account.');
                }
            }
        );
    }
}

export const userDashboard = new UserDashboard();
window.userDashboard = userDashboard;

export default userDashboard;
