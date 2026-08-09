/**
 * User Dashboard — routing, data loading, and event binding.
 *
 * No HTML is produced here. All markup lives in dashboard-templates.js.
 * Events are bound via data-action attributes after each render so the
 * template functions stay side-effect-free and testable in isolation.
 */

import { apiService } from "../core/api.js";
import { authService } from "./auth.js";
import { uiManager } from "../ui/ui.js";
import { validatePassword } from "../core/validators.js";
import { escapeHtml } from "../core/helpers.js";
import { CONFIG } from "../core/config.js";
import {
    dashboardShellHTML,
    ordersHTML,
    savedStandsHTML,
    editProfileFormHTML,
    changePasswordFormHTML,
    orderDetailsHTML,
} from "./dashboard-templates.js";

class UserDashboard {
    constructor() {
        this.currentUser = null;
        this.orders = [];
        this.savedStands = [];
        this.stats = {};
        this.ordersCursor = null;
        this._containerId = "dashboardContainer";
    }

    // ─── Entry point ──────────────────────────────────────────────────────────

    async loadDashboard(containerId = "dashboardContainer") {
        this._containerId = containerId;
        const container = document.getElementById(containerId);
        if (!container) {
            return;
        }

        this.currentUser = await authService.getCurrentUser();
        if (!this.currentUser) {
            window.location.hash = "/login";
            return;
        }

        uiManager.showLoader(containerId, "Loading your dashboard...");

        try {
            await Promise.all([
                this._loadOrders(),
                this._loadSavedStands(),
                this._loadStats(),
            ]);
            this._render(container);
        } catch (err) {
            console.error("Dashboard load error:", err);
            uiManager.showError(container, "Failed to load dashboard");
        }
    }

    // ─── Data loading ─────────────────────────────────────────────────────────

    async _loadOrders() {
        try {
            const page = await apiService.getUserOrders({ limit: 10 });
            this.orders = page.orders || [];
            this.ordersCursor = page.nextCursor || null;
        } catch {
            this.orders = [];
            this.ordersCursor = null;
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
                totalOrders: this.orders.filter((o) => o.status !== "cancelled")
                    .length,
                totalSpent: this.orders.reduce((s, o) => s + (o.total ?? 0), 0),
                savedStands: this.savedStands.length,
            };
        }
    }

    // ─── Rendering ────────────────────────────────────────────────────────────

    _render(container) {
        const username =
            this.currentUser.username ||
            this.currentUser.attributes?.email ||
            "User";
        const email = this.currentUser.attributes?.email || "N/A";

        container.innerHTML = dashboardShellHTML({
            username,
            stats: this.stats,
            ordersHTML: ordersHTML(this.orders),
            savedStandsHTML: savedStandsHTML(this.savedStands),
            paymentsEnabled: CONFIG.payments.enabled,
        });

        // Inject email into the already-rendered settings panel
        const emailEl = container.querySelector("#db-user-email");
        if (emailEl) {
            emailEl.textContent = email;
        }

        this._bindEvents(container);
    }

    // ─── Event binding ────────────────────────────────────────────────────────

    /**
     * One delegated listener maps data-action attributes to class methods.
     * Adding a new action only requires a new case here — no onclick strings
     * in templates, no global window references.
     */
    _bindEvents(container) {
        container.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-action]");
            if (!btn) {
                return;
            }
            const action = btn.dataset.action;
            const id = btn.dataset.id;

            switch (action) {
                case "view-order":
                    this.viewOrder(id);
                    break;
                case "load-more-orders":
                    this.loadMoreOrders();
                    break;
                case "visit-stand":
                    window.location.hash = `/stand/${id}`;
                    break;
                case "unsave-stand":
                    this.unsaveStand(id);
                    break;
                case "browse-stands":
                    window.location.hash = "/";
                    break;
                case "view-cart":
                    window.location.hash = "/cart";
                    break;
                case "download-data":
                    this.downloadData();
                    break;
                case "change-password":
                    this.changePassword();
                    break;
                case "setup-mfa":
                    this.setupMfa();
                    break;
                case "disable-mfa":
                    this.disableMfa();
                    break;
                case "delete-account":
                    this.deleteAccount();
                    break;
            }
        });

        container
            .querySelector("#db-edit-profile")
            ?.addEventListener("click", () => this.editProfile());
    }

    _refresh() {
        const container = document.getElementById(this._containerId);
        if (container) {
            this._render(container);
        }
    }

    // ─── Actions ──────────────────────────────────────────────────────────────

    async loadMoreOrders() {
        if (!this.ordersCursor) {
            uiManager.info("No more orders.");
            return;
        }

        try {
            const page = await apiService.getUserOrders({
                limit: 10,
                cursor: this.ordersCursor,
            });
            const more = page.orders || [];
            this.ordersCursor = page.nextCursor || null;
            if (!more.length) {
                uiManager.info("No more orders.");
                return;
            }
            this.orders = [...this.orders, ...more];
            this._refresh();
        } catch {
            uiManager.error("Failed to load more orders.");
        }
    }

    async viewOrder(orderId) {
        try {
            const order = await apiService.getOrder(orderId);
            uiManager.showModal({
                title: `Order #${orderId.substring(0, 8)}`,
                content: orderDetailsHTML(order),
                size: "large",
            });
        } catch {
            uiManager.error("Failed to load order details.");
        }
    }

    async unsaveStand(standId) {
        uiManager.showConfirm(
            "Remove this stand from saved items?",
            async () => {
                try {
                    await apiService.deleteSavedStand(standId);
                    this.savedStands = this.savedStands.filter(
                        (s) => (s.standId || s.stand_id) !== standId,
                    );
                    this.stats.savedStands = Math.max(
                        0,
                        (this.stats.savedStands ?? 1) - 1,
                    );
                    uiManager.success("Stand removed.");
                    this._refresh();
                } catch {
                    uiManager.error("Failed to remove stand.");
                }
            },
        );
    }

    editProfile() {
        uiManager.showModal({
            title: "Edit Profile",
            content: editProfileFormHTML(this.currentUser.attributes || {}),
            size: "medium",
            buttons: [
                {
                    label: "Cancel",
                    className: "btn-secondary",
                    action: "cancel",
                },
                {
                    label: "Save",
                    className: "btn-primary",
                    action: "save",
                    onClick: () => this.saveProfile(),
                },
            ],
        });
    }

    async saveProfile() {
        const get = (id) => document.getElementById(id)?.value;
        try {
            await authService.updateUserAttributes({
                given_name: get("firstName"),
                family_name: get("lastName"),
                "custom:company": get("company"),
                phone_number: get("phone"),
            });
            uiManager.success("Profile updated.");
            this.loadDashboard(this._containerId);
        } catch {
            uiManager.error("Failed to update profile.");
        }
    }

    changePassword() {
        uiManager.showModal({
            title: "Change Password",
            content: changePasswordFormHTML(),
            buttons: [
                {
                    label: "Cancel",
                    className: "btn-secondary",
                    action: "cancel",
                },
                {
                    label: "Change Password",
                    className: "btn-primary",
                    action: "change",
                    onClick: async () => {
                        const current =
                            document.getElementById("currentPassword")?.value;
                        const next =
                            document.getElementById("newPassword")?.value;
                        const confirm =
                            document.getElementById("confirmPassword")?.value;
                        const check = validatePassword(next);
                        if (!check.ok || next !== confirm) {
                            uiManager.error(
                                !check.ok ? check.error : "Passwords do not match.",
                            );
                            return;
                        }
                        try {
                            await authService.changePassword(current, next);
                            uiManager.success("Password changed.");
                        } catch {
                            uiManager.error("Failed to change password.");
                        }
                    },
                },
            ],
        });
    }

    async setupMfa() {
        try {
            const { secretCode } = await authService.beginTotpSetup();
            const username =
                this.currentUser?.attributes?.email ||
                this.currentUser?.username ||
                "account";
            const issuer = "AI Pavilion";
            const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${encodeURIComponent(secretCode)}&issuer=${encodeURIComponent(issuer)}`;
            uiManager.showModal({
                title: "Set up authenticator MFA",
                content: `
                    <p>Add this secret to your authenticator application, then enter the current six-digit code.</p>
                    <p class="font-mono break-all p-3 border rounded mt-3" id="mfa-secret">${escapeHtml(secretCode)}</p>
                    <details class="mt-3"><summary>Manual authenticator URI</summary><code class="break-all text-xs">${escapeHtml(uri)}</code></details>
                    <label class="block mt-4">Verification code<input id="mfa-setup-code" inputmode="numeric" autocomplete="one-time-code" class="w-full px-3 py-2 border rounded" /></label>`,
                buttons: [
                    { label: "Cancel", className: "btn-secondary", action: "cancel" },
                    {
                        label: "Enable MFA",
                        className: "btn-primary",
                        action: "enable",
                        onClick: async () => {
                            const code = document.getElementById("mfa-setup-code")?.value.trim();
                            if (!code) {
                                uiManager.error("Enter the authenticator code.");
                                return;
                            }
                            try {
                                await authService.completeTotpSetup(code);
                                uiManager.success("Authenticator MFA enabled.");
                            } catch {
                                uiManager.error("The authenticator code could not be verified.");
                            }
                        },
                    },
                ],
            });
        } catch {
            uiManager.error("Unable to start MFA setup.");
        }
    }

    disableMfa() {
        uiManager.showConfirm(
            "Disable authenticator MFA for this account?",
            async () => {
                try {
                    await authService.disableTotp();
                    uiManager.success("Authenticator MFA disabled.");
                } catch {
                    uiManager.error("Unable to disable MFA.");
                }
            },
        );
    }

    async downloadData() {
        try {
            const blob = new Blob(
                [
                    JSON.stringify(
                        {
                            user: this.currentUser,
                            orders: this.orders,
                            savedStands: this.savedStands,
                            stats: this.stats,
                        },
                        null,
                        2,
                    ),
                ],
                { type: "application/json" },
            );
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `ai-pavilion-data-${Date.now()}.json`;
            link.click();
            URL.revokeObjectURL(url);
            uiManager.success("Data downloaded.");
        } catch {
            uiManager.error("Download failed.");
        }
    }

    deleteAccount() {
        uiManager.showConfirm(
            "Are you sure you want to delete your account? This cannot be undone.",
            async () => {
                try {
                    const readiness = await apiService.get("/user/account");
                    if (!readiness.ready) {
                        const codes = (readiness.blockers || [])
                            .map((item) => item.code)
                            .join(", ");
                        uiManager.error(
                            `Account deletion is blocked: ${codes}. Transfer organization ownership and ask an organizer to reassign your stands first.`,
                        );
                        return;
                    }
                    await apiService.delete("/user/account");
                    await authService.signOut({ global: true });
                    window.location.hash = "/";
                } catch (error) {
                    const blockers = error?.details?.blockers;
                    uiManager.error(
                        blockers?.length
                            ? "Account deletion is blocked by owned resources."
                            : "Failed to delete account.",
                    );
                }
            },
        );
    }
}

export const userDashboard = new UserDashboard();
export default userDashboard;
