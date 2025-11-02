/**
 * AI Pavilion - UI Manager COMPLETE
 */

import { CONFIG } from '../config/config.js';
import { escapeHtml } from '../utils/helpers.js';
import { TOAST_TYPES, ANIMATION_DURATIONS } from '../utils/constants.js';

class UIManager {
    constructor() {
        this.toastContainer = null;
        this.toastDuration = CONFIG.ui.toastDuration;
        this.animationDuration = CONFIG.ui.animationDuration;
        this.activeModals = [];
        this.activeToasts = [];
    }

    // ==================== INITIALIZATION ====================

    init() {
        this.initToastContainer();
        this.initModalContainer();
        this.setupGlobalEventListeners();
    }

    initToastContainer() {
        if (!this.toastContainer) {
            this.toastContainer = document.getElementById('toastContainer');
            if (!this.toastContainer) {
                this.toastContainer = document.createElement('div');
                this.toastContainer.id = 'toastContainer';
                this.toastContainer.className = 'toast-container';
                document.body.appendChild(this.toastContainer);
            }
        }
    }

    initModalContainer() {
        if (!document.getElementById('modalContainer')) {
            const container = document.createElement('div');
            container.id = 'modalContainer';
            container.className = 'modal-container';
            document.body.appendChild(container);
        }
    }

    setupGlobalEventListeners() {
        // Close modals on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeModals.length > 0) {
                this.closeTopModal();
            }
        });
    }

    // ==================== TOAST NOTIFICATIONS ====================

    showToast(message, type = TOAST_TYPES.SUCCESS, duration = null) {
        this.initToastContainer();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icon = this.getToastIcon(type);
        toast.innerHTML = `
            ${icon ? `<span class="toast-icon">${icon}</span>` : ''}
            <p class="toast-message">${escapeHtml(message)}</p>
            <button class="toast-close" aria-label="Close">&times;</button>
        `;

        this.toastContainer.appendChild(toast);
        this.activeToasts.push(toast);

        // Close button
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.closeToast(toast));

        // Show animation
        setTimeout(() => toast.classList.add('toast-show'), 10);

        // Auto-hide
        const displayDuration = duration || this.toastDuration;
        setTimeout(() => {
            this.closeToast(toast);
        }, displayDuration);

        return toast;
    }

    closeToast(toast) {
        if (!toast || !toast.parentElement) return;

        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');

        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
            this.activeToasts = this.activeToasts.filter(t => t !== toast);
        }, this.animationDuration);
    }

    getToastIcon(type) {
        const icons = {
            [TOAST_TYPES.SUCCESS]: '✓',
            [TOAST_TYPES.ERROR]: '✕',
            [TOAST_TYPES.WARNING]: '⚠',
            [TOAST_TYPES.INFO]: 'ℹ'
        };
        return icons[type] || '';
    }

    success(message, duration = null) {
        return this.showToast(message, TOAST_TYPES.SUCCESS, duration);
    }

    error(message, duration = null) {
        return this.showToast(message, TOAST_TYPES.ERROR, duration);
    }

    warning(message, duration = null) {
        return this.showToast(message, TOAST_TYPES.WARNING, duration);
    }

    info(message, duration = null) {
        return this.showToast(message, TOAST_TYPES.INFO, duration);
    }

    clearToasts() {
        this.activeToasts.forEach(toast => this.closeToast(toast));
    }

    // ==================== MODALS ====================

    showModal(options = {}) {
        const {
            title = '',
            content = '',
            size = 'medium',
            closeButton = true,
            backdrop = true,
            onClose = null,
            buttons = []
        } = options;

        const modalId = `modal-${Date.now()}`;
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = `modal modal-${size}`;

        modal.innerHTML = `
            <div class="modal-overlay ${backdrop ? 'modal-backdrop' : ''}"></div>
            <div class="modal-dialog">
                <div class="modal-content">
                    ${title ? `
                        <div class="modal-header">
                            <h3 class="modal-title">${escapeHtml(title)}</h3>
                            ${closeButton ? '<button class="modal-close" aria-label="Close">&times;</button>' : ''}
                        </div>
                    ` : ''}
                    <div class="modal-body">
                        ${typeof content === 'string' ? content : ''}
                    </div>
                    ${buttons.length > 0 ? `
                        <div class="modal-footer">
                            ${buttons.map(btn => `
                                <button class="btn ${btn.className || 'btn-secondary'}" 
                                        data-action="${btn.action || ''}">
                                    ${escapeHtml(btn.label)}
                                </button>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        document.getElementById('modalContainer').appendChild(modal);
        this.activeModals.push(modal);

        // Setup event listeners
        if (closeButton) {
            const closeBtn = modal.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeModal(modalId));
            }
        }

        if (backdrop) {
            const overlay = modal.querySelector('.modal-overlay');
            overlay.addEventListener('click', () => this.closeModal(modalId));
        }

        // Button actions
        buttons.forEach(btn => {
            const btnElement = modal.querySelector(`[data-action="${btn.action}"]`);
            if (btnElement && btn.onClick) {
                btnElement.addEventListener('click', () => {
                    btn.onClick();
                    if (btn.closeOnClick !== false) {
                        this.closeModal(modalId);
                    }
                });
            }
        });

        // Show animation
        setTimeout(() => modal.classList.add('modal-show'), 10);

        // Store close callback
        if (onClose) {
            modal.dataset.onClose = 'true';
            modal._onCloseCallback = onClose;
        }

        return modalId;
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        modal.classList.remove('modal-show');
        modal.classList.add('modal-hide');

        setTimeout(() => {
            // Call onClose callback
            if (modal._onCloseCallback) {
                modal._onCloseCallback();
            }

            modal.remove();
            this.activeModals = this.activeModals.filter(m => m.id !== modalId);
        }, this.animationDuration);
    }

    closeTopModal() {
        if (this.activeModals.length > 0) {
            const topModal = this.activeModals[this.activeModals.length - 1];
            this.closeModal(topModal.id);
        }
    }

    closeAllModals() {
        this.activeModals.forEach(modal => this.closeModal(modal.id));
    }

    // ==================== CONFIRM DIALOG ====================

    showConfirm(message, onConfirm, onCancel = null) {
        return this.showModal({
            title: 'Confirm',
            content: `<p>${escapeHtml(message)}</p>`,
            buttons: [
                {
                    label: 'Cancel',
                    className: 'btn-secondary',
                    action: 'cancel',
                    onClick: () => {
                        if (onCancel) onCancel();
                    }
                },
                {
                    label: 'Confirm',
                    className: 'btn-primary',
                    action: 'confirm',
                    onClick: () => {
                        if (onConfirm) onConfirm();
                    }
                }
            ]
        });
    }

    showAlert(message, title = 'Alert') {
        return this.showModal({
            title,
            content: `<p>${escapeHtml(message)}</p>`,
            buttons: [
                {
                    label: 'OK',
                    className: 'btn-primary',
                    action: 'ok'
                }
            ]
        });
    }

    // ==================== LOADER ====================

    showLoader(containerId, message = 'Loading...') {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="loader-container">
                <div class="loader"></div>
                ${message ? `<p class="loader-message">${escapeHtml(message)}</p>` : ''}
            </div>
        `;
    }

    hideLoader(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const loader = container.querySelector('.loader-container');
        if (loader) {
            loader.remove();
        }
    }

    showGlobalLoader(message = 'Loading...') {
        const existingLoader = document.getElementById('globalLoader');
        if (existingLoader) return;

        const loader = document.createElement('div');
        loader.id = 'globalLoader';
        loader.className = 'global-loader';
        loader.innerHTML = `
            <div class="global-loader-content">
                <div class="loader"></div>
                ${message ? `<p>${escapeHtml(message)}</p>` : ''}
            </div>
        `;

        document.body.appendChild(loader);
        setTimeout(() => loader.classList.add('show'), 10);
    }

    hideGlobalLoader() {
        const loader = document.getElementById('globalLoader');
        if (!loader) return;

        loader.classList.remove('show');
        setTimeout(() => loader.remove(), this.animationDuration);
    }

    // ==================== ERROR & EMPTY STATES ====================

    showError(containerId, message, retryCallback = null) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="error-message">
                <span class="error-icon">⚠</span>
                <p>${escapeHtml(message)}</p>
                ${retryCallback ? '<button class="btn btn-primary retry-btn">Retry</button>' : ''}
            </div>
        `;

        if (retryCallback) {
            const retryBtn = container.querySelector('.retry-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', retryCallback);
            }
        }
    }

    showEmptyState(containerId, message, actionButton = null) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="empty-state">
                <p>${escapeHtml(message)}</p>
                ${actionButton ? `
                    <button class="btn btn-primary empty-action-btn">
                        ${escapeHtml(actionButton.label)}
                    </button>
                ` : ''}
            </div>
        `;

        if (actionButton && actionButton.onClick) {
            const btn = container.querySelector('.empty-action-btn');
            if (btn) {
                btn.addEventListener('click', actionButton.onClick);
            }
        }
    }

    // ==================== BADGE ====================

    updateBadge(badgeId, count) {
        const badge = document.getElementById(badgeId);
        if (!badge) return;

        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline' : 'none';
        
        // Add animation
        badge.classList.add('badge-updated');
        setTimeout(() => badge.classList.remove('badge-updated'), 300);
    }

    // ==================== SCROLL ====================

    scrollToSection(sectionId, smooth = true) {
        const section = document.getElementById(sectionId);
        if (!section) return;

        section.scrollIntoView({
            behavior: smooth ? 'smooth' : 'auto',
            block: 'start'
        });
    }

    scrollToTop(smooth = true) {
        window.scrollTo({
            top: 0,
            behavior: smooth ? 'smooth' : 'auto'
        });
    }

    // ==================== UTILITIES ====================

    addClass(elementId, className) {
        const element = document.getElementById(elementId);
        if (element) element.classList.add(className);
    }

    removeClass(elementId, className) {
        const element = document.getElementById(elementId);
        if (element) element.classList.remove(className);
    }

    toggleClass(elementId, className) {
        const element = document.getElementById(elementId);
        if (element) element.classList.toggle(className);
    }

    show(elementId) {
        const element = document.getElementById(elementId);
        if (element) element.style.display = 'block';
    }

    hide(elementId) {
        const element = document.getElementById(elementId);
        if (element) element.style.display = 'none';
    }

    toggle(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;
        element.style.display = element.style.display === 'none' ? 'block' : 'none';
    }
}

// ==================== SINGLETON INSTANCE ====================

export const uiManager = new UIManager();

export default uiManager;
