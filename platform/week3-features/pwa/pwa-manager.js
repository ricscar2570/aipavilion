/**
 * AI Pavilion - PWA Manager
 * Handles service worker registration, updates, and PWA features
 * 
 * Features:
 * - Service worker lifecycle management
 * - Install prompt handling
 * - Update notifications
 * - Offline detection
 * - Background sync
 * - Push notifications
 */

class PWAManager {
    constructor() {
        this.swRegistration = null;
        this.installPromptEvent = null;
        this.isOnline = navigator.onLine;
        this.updateAvailable = false;
        
        this.init();
    }
    
    /**
     * Initialize PWA Manager
     */
    async init() {
        if ('serviceWorker' in navigator) {
            try {
                await this.registerServiceWorker();
                this.setupEventListeners();
                this.checkForUpdates();
                this.setupBeforeInstallPrompt();
                this.setupPushNotifications();
            } catch (error) {
                console.error('[PWA] Initialization failed:', error);
            }
        } else {
            console.warn('[PWA] Service Workers not supported');
        }
    }
    
    /**
     * Register Service Worker
     */
    async registerServiceWorker() {
        try {
            this.swRegistration = await navigator.serviceWorker.register('/service-worker.js', {
                scope: '/'
            });
            
            console.log('[PWA] Service Worker registered:', this.swRegistration);
            
            // Check for updates
            this.swRegistration.addEventListener('updatefound', () => {
                const newWorker = this.swRegistration.installing;
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        this.updateAvailable = true;
                        this.showUpdateNotification();
                    }
                });
            });
            
            // Handle controller change
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
            });
            
        } catch (error) {
            console.error('[PWA] Service Worker registration failed:', error);
            throw error;
        }
    }
    
    /**
     * Setup Event Listeners
     */
    setupEventListeners() {
        // Online/Offline detection
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.handleOnline();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.handleOffline();
        });
        
        // Visibility change - check for updates when app becomes visible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkForUpdates();
            }
        });
    }
    
    /**
     * Handle Online Event
     */
    handleOnline() {
        console.log('[PWA] Connection restored');
        
        // Show notification
        this.showNotification('Back Online', {
            body: 'Connection restored. Syncing data...',
            icon: '/icons/icon-192.png',
            tag: 'online-status'
        });
        
        // Trigger background sync
        this.syncData();
        
        // Remove offline banner if exists
        const banner = document.getElementById('offline-banner');
        if (banner) {
            banner.remove();
        }
    }
    
    /**
     * Handle Offline Event
     */
    handleOffline() {
        console.log('[PWA] Connection lost');
        
        // Show offline banner
        this.showOfflineBanner();
        
        // Show notification
        this.showNotification('Offline Mode', {
            body: 'Working offline. Changes will sync when online.',
            icon: '/icons/icon-192.png',
            tag: 'offline-status'
        });
    }
    
    /**
     * Show Offline Banner
     */
    showOfflineBanner() {
        // Check if banner already exists
        if (document.getElementById('offline-banner')) {
            return;
        }
        
        const banner = document.createElement('div');
        banner.id = 'offline-banner';
        banner.className = 'fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-white px-4 py-3 text-center';
        banner.innerHTML = `
            <div class="flex items-center justify-center space-x-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"/>
                </svg>
                <span class="font-semibold">You're offline</span>
                <span class="text-sm">Some features may be limited</span>
            </div>
        `;
        
        document.body.prepend(banner);
    }
    
    /**
     * Check for Updates
     */
    async checkForUpdates() {
        if (this.swRegistration) {
            try {
                await this.swRegistration.update();
                console.log('[PWA] Checked for updates');
            } catch (error) {
                console.error('[PWA] Update check failed:', error);
            }
        }
    }
    
    /**
     * Show Update Notification
     */
    showUpdateNotification() {
        const notification = document.createElement('div');
        notification.className = 'fixed bottom-4 right-4 z-50 bg-white rounded-lg shadow-2xl p-6 max-w-sm';
        notification.innerHTML = `
            <div class="flex items-start space-x-4">
                <div class="flex-shrink-0">
                    <svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                </div>
                <div class="flex-1">
                    <h3 class="text-lg font-semibold text-gray-900">Update Available</h3>
                    <p class="text-sm text-gray-600 mt-1">A new version of AI Pavilion is available.</p>
                    <div class="mt-4 flex space-x-3">
                        <button id="update-btn" class="btn-primary text-sm px-4 py-2">
                            Update Now
                        </button>
                        <button id="update-later-btn" class="btn-secondary text-sm px-4 py-2">
                            Later
                        </button>
                    </div>
                </div>
                <button id="update-close-btn" class="text-gray-400 hover:text-gray-600">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Event listeners
        document.getElementById('update-btn').addEventListener('click', () => {
            this.activateUpdate();
        });
        
        document.getElementById('update-later-btn').addEventListener('click', () => {
            notification.remove();
        });
        
        document.getElementById('update-close-btn').addEventListener('click', () => {
            notification.remove();
        });
    }
    
    /**
     * Activate Service Worker Update
     */
    activateUpdate() {
        if (this.swRegistration && this.swRegistration.waiting) {
            this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    }
    
    /**
     * Setup Before Install Prompt
     */
    setupBeforeInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (event) => {
            // Prevent default prompt
            event.preventDefault();
            
            // Store event for later use
            this.installPromptEvent = event;
            
            // Show custom install button
            this.showInstallButton();
            
            console.log('[PWA] Install prompt ready');
        });
        
        // Listen for app installed
        window.addEventListener('appinstalled', () => {
            console.log('[PWA] App installed');
            this.installPromptEvent = null;
            
            // Hide install button
            const installBtn = document.getElementById('pwa-install-btn');
            if (installBtn) {
                installBtn.remove();
            }
            
            // Track installation
            this.trackEvent('pwa_install', {
                platform: this.getPlatform()
            });
        });
    }
    
    /**
     * Show Install Button
     */
    showInstallButton() {
        // Check if button already exists
        if (document.getElementById('pwa-install-btn')) {
            return;
        }
        
        const installBtn = document.createElement('button');
        installBtn.id = 'pwa-install-btn';
        installBtn.className = 'fixed bottom-4 left-4 z-50 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-lg shadow-lg hover:shadow-xl transition flex items-center space-x-2';
        installBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            <span class="font-semibold">Install App</span>
        `;
        
        installBtn.addEventListener('click', () => {
            this.promptInstall();
        });
        
        document.body.appendChild(installBtn);
    }
    
    /**
     * Prompt Install
     */
    async promptInstall() {
        if (!this.installPromptEvent) {
            console.warn('[PWA] Install prompt not available');
            return;
        }
        
        try {
            // Show prompt
            this.installPromptEvent.prompt();
            
            // Wait for user choice
            const { outcome } = await this.installPromptEvent.userChoice;
            
            console.log('[PWA] Install prompt outcome:', outcome);
            
            if (outcome === 'accepted') {
                this.trackEvent('pwa_install_accepted');
            } else {
                this.trackEvent('pwa_install_dismissed');
            }
            
            // Clear event
            this.installPromptEvent = null;
            
        } catch (error) {
            console.error('[PWA] Install prompt failed:', error);
        }
    }
    
    /**
     * Setup Push Notifications
     */
    async setupPushNotifications() {
        if (!('Notification' in window)) {
            console.warn('[PWA] Notifications not supported');
            return;
        }
        
        // Check permission
        if (Notification.permission === 'granted') {
            await this.subscribeToPush();
        }
    }
    
    /**
     * Request Notification Permission
     */
    async requestNotificationPermission() {
        try {
            const permission = await Notification.requestPermission();
            
            if (permission === 'granted') {
                console.log('[PWA] Notification permission granted');
                await this.subscribeToPush();
                return true;
            } else {
                console.log('[PWA] Notification permission denied');
                return false;
            }
        } catch (error) {
            console.error('[PWA] Notification permission request failed:', error);
            return false;
        }
    }
    
    /**
     * Subscribe to Push Notifications
     */
    async subscribeToPush() {
        if (!this.swRegistration) {
            return;
        }
        
        try {
            // Get subscription
            let subscription = await this.swRegistration.pushManager.getSubscription();
            
            if (!subscription) {
                // Create new subscription
                const vapidPublicKey = 'YOUR_VAPID_PUBLIC_KEY'; // Replace with actual key
                
                subscription = await this.swRegistration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey)
                });
                
                // Send subscription to server
                await this.sendSubscriptionToServer(subscription);
            }
            
            console.log('[PWA] Push subscription active');
            
        } catch (error) {
            console.error('[PWA] Push subscription failed:', error);
        }
    }
    
    /**
     * Send Subscription to Server
     */
    async sendSubscriptionToServer(subscription) {
        try {
            const response = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subscription)
            });
            
            if (response.ok) {
                console.log('[PWA] Subscription sent to server');
            }
        } catch (error) {
            console.error('[PWA] Failed to send subscription:', error);
        }
    }
    
    /**
     * Show Notification
     */
    async showNotification(title, options = {}) {
        if (Notification.permission !== 'granted') {
            return;
        }
        
        if (this.swRegistration) {
            await this.swRegistration.showNotification(title, options);
        } else {
            new Notification(title, options);
        }
    }
    
    /**
     * Background Sync
     */
    async syncData() {
        if (!this.swRegistration || !this.swRegistration.sync) {
            console.warn('[PWA] Background Sync not supported');
            return;
        }
        
        try {
            await this.swRegistration.sync.register('sync-analytics');
            await this.swRegistration.sync.register('sync-wishlist');
            console.log('[PWA] Background sync registered');
        } catch (error) {
            console.error('[PWA] Background sync failed:', error);
        }
    }
    
    /**
     * Utility Functions
     */
    
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        
        return outputArray;
    }
    
    getPlatform() {
        const userAgent = navigator.userAgent.toLowerCase();
        
        if (/android/.test(userAgent)) {
            return 'Android';
        } else if (/iphone|ipad|ipod/.test(userAgent)) {
            return 'iOS';
        } else if (/windows/.test(userAgent)) {
            return 'Windows';
        } else if (/mac/.test(userAgent)) {
            return 'macOS';
        } else if (/linux/.test(userAgent)) {
            return 'Linux';
        } else {
            return 'Unknown';
        }
    }
    
    trackEvent(eventName, data = {}) {
        // Track installation/usage events
        if (window.gtag) {
            window.gtag('event', eventName, data);
        }
        
        console.log('[PWA] Event tracked:', eventName, data);
    }
    
    /**
     * Get Installation Status
     */
    isInstalled() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true;
    }
    
    /**
     * Clear All Caches
     */
    async clearCaches() {
        if (this.swRegistration) {
            const sw = this.swRegistration.active;
            if (sw) {
                sw.postMessage({ type: 'CLEAR_CACHE' });
            }
        }
        
        console.log('[PWA] Cache clear requested');
    }
    
    /**
     * Get Service Worker Version
     */
    async getVersion() {
        if (!this.swRegistration || !this.swRegistration.active) {
            return null;
        }
        
        return new Promise((resolve) => {
            const messageChannel = new MessageChannel();
            
            messageChannel.port1.onmessage = (event) => {
                resolve(event.data.version);
            };
            
            this.swRegistration.active.postMessage(
                { type: 'GET_VERSION' },
                [messageChannel.port2]
            );
        });
    }
}

// Initialize PWA Manager when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.pwaManager = new PWAManager();
    });
} else {
    window.pwaManager = new PWAManager();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PWAManager;
}
