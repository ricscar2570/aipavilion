/**
 * AI Pavilion - Service Worker
 * Progressive Web App with offline support and caching
 * 
 * Version: 1.0.0
 * Cache Strategy: Network First with Cache Fallback
 * 
 * Features:
 * - Offline support
 * - Background sync
 * - Push notifications
 * - Install prompt
 * - Cache management
 */

const CACHE_VERSION = 'ai-pavilion-v1.0.0';
const CACHE_NAME = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// Files to cache immediately on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/src/app.js',
    '/src/config/config.js',
    '/src/components/ui/navbar.js',
    '/src/components/ui/stand-card.js',
    '/src/components/ui/hero.js',
    '/src/modules/wishlist.js',
    '/src/components/reviews.js',
    '/offline.html',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap'
];

// API routes to cache
const API_ROUTES = [
    '/stands',
    '/stands/*',
    '/analytics/*'
];

// Maximum cache sizes
const MAX_RUNTIME_CACHE = 50;
const MAX_IMAGE_CACHE = 60;

/**
 * Install Event - Cache static assets
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...', CACHE_VERSION);
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Static assets cached successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Failed to cache static assets:', error);
            })
    );
});

/**
 * Activate Event - Clean up old caches
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...', CACHE_VERSION);
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheName) => {
                            // Delete old versions
                            return cacheName.startsWith('ai-pavilion-') && 
                                   cacheName !== CACHE_NAME &&
                                   cacheName !== RUNTIME_CACHE &&
                                   cacheName !== IMAGE_CACHE;
                        })
                        .map((cacheName) => {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Service worker activated');
                return self.clients.claim();
            })
    );
});

/**
 * Fetch Event - Network first, cache fallback
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip chrome extensions
    if (url.protocol === 'chrome-extension:') {
        return;
    }
    
    // Handle different types of requests
    if (isImageRequest(request)) {
        event.respondWith(handleImageRequest(request));
    } else if (isAPIRequest(url)) {
        event.respondWith(handleAPIRequest(request));
    } else {
        event.respondWith(handleStaticRequest(request));
    }
});

/**
 * Handle static asset requests
 * Strategy: Cache first, network fallback
 */
async function handleStaticRequest(request) {
    try {
        // Try cache first
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            console.log('[SW] Serving from cache:', request.url);
            return cachedResponse;
        }
        
        // Fetch from network
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
    } catch (error) {
        console.error('[SW] Fetch failed:', error);
        
        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
            const offlinePage = await caches.match('/offline.html');
            if (offlinePage) {
                return offlinePage;
            }
        }
        
        // Return error response
        return new Response('Network error', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
                'Content-Type': 'text/plain'
            })
        });
    }
}

/**
 * Handle API requests
 * Strategy: Network first, cache fallback
 */
async function handleAPIRequest(request) {
    try {
        // Try network first
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, networkResponse.clone());
            
            // Limit cache size
            await limitCacheSize(RUNTIME_CACHE, MAX_RUNTIME_CACHE);
        }
        
        return networkResponse;
        
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', request.url);
        
        // Fallback to cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            // Add header to indicate cached response
            const headers = new Headers(cachedResponse.headers);
            headers.set('X-From-Cache', 'true');
            
            return new Response(cachedResponse.body, {
                status: cachedResponse.status,
                statusText: cachedResponse.statusText,
                headers: headers
            });
        }
        
        // No cache available
        return new Response(JSON.stringify({
            error: 'Offline - data not available',
            offline: true
        }), {
            status: 503,
            headers: new Headers({
                'Content-Type': 'application/json'
            })
        });
    }
}

/**
 * Handle image requests
 * Strategy: Cache first, network fallback
 */
async function handleImageRequest(request) {
    try {
        // Try cache first
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Fetch from network
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse.ok) {
            const cache = await caches.open(IMAGE_CACHE);
            cache.put(request, networkResponse.clone());
            
            // Limit cache size
            await limitCacheSize(IMAGE_CACHE, MAX_IMAGE_CACHE);
        }
        
        return networkResponse;
        
    } catch (error) {
        // Return placeholder image
        return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect fill="#e5e7eb" width="400" height="300"/><text x="50%" y="50%" text-anchor="middle" fill="#9ca3af" font-size="20">Image Unavailable Offline</text></svg>',
            {
                headers: new Headers({
                    'Content-Type': 'image/svg+xml'
                })
            }
        );
    }
}

/**
 * Background Sync - Sync data when connection is restored
 */
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync triggered:', event.tag);
    
    if (event.tag === 'sync-analytics') {
        event.waitUntil(syncAnalytics());
    } else if (event.tag === 'sync-wishlist') {
        event.waitUntil(syncWishlist());
    }
});

/**
 * Sync analytics data
 */
async function syncAnalytics() {
    try {
        // Get pending analytics from IndexedDB
        const db = await openDB();
        const pendingData = await db.getAll('pending-analytics');
        
        // Send to server
        for (const data of pendingData) {
            await fetch('/api/analytics/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            // Remove from pending
            await db.delete('pending-analytics', data.id);
        }
        
        console.log('[SW] Analytics synced successfully');
    } catch (error) {
        console.error('[SW] Failed to sync analytics:', error);
        throw error; // Retry sync
    }
}

/**
 * Sync wishlist data
 */
async function syncWishlist() {
    try {
        const db = await openDB();
        const pendingChanges = await db.getAll('pending-wishlist');
        
        for (const change of pendingChanges) {
            await fetch('/api/wishlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(change)
            });
            
            await db.delete('pending-wishlist', change.id);
        }
        
        console.log('[SW] Wishlist synced successfully');
    } catch (error) {
        console.error('[SW] Failed to sync wishlist:', error);
        throw error;
    }
}

/**
 * Push Notifications
 */
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');
    
    const data = event.data ? event.data.json() : {};
    
    const title = data.title || 'AI Pavilion';
    const options = {
        body: data.body || 'New update available',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        data: data.url || '/',
        actions: [
            {
                action: 'open',
                title: 'Open',
                icon: '/icons/open.png'
            },
            {
                action: 'close',
                title: 'Close',
                icon: '/icons/close.png'
            }
        ],
        requireInteraction: false,
        vibrate: [200, 100, 200]
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

/**
 * Notification Click Handler
 */
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.action);
    
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        const url = event.notification.data || '/';
        
        event.waitUntil(
            clients.openWindow(url)
        );
    }
});

/**
 * Message Handler - Communication with main thread
 */
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);
    
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(clearAllCaches());
    } else if (event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_VERSION });
    }
});

/**
 * Utility Functions
 */

function isImageRequest(request) {
    return request.destination === 'image' || 
           /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(new URL(request.url).pathname);
}

function isAPIRequest(url) {
    return url.pathname.startsWith('/api/') ||
           url.pathname.startsWith('/stands') ||
           url.hostname.includes('execute-api');
}

async function limitCacheSize(cacheName, maxItems) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    
    if (keys.length > maxItems) {
        // Delete oldest entries
        const deleteCount = keys.length - maxItems;
        for (let i = 0; i < deleteCount; i++) {
            await cache.delete(keys[i]);
        }
    }
}

async function clearAllCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
    );
    console.log('[SW] All caches cleared');
}

async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ai-pavilion-db', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('pending-analytics')) {
                db.createObjectStore('pending-analytics', { keyPath: 'id', autoIncrement: true });
            }
            
            if (!db.objectStoreNames.contains('pending-wishlist')) {
                db.createObjectStore('pending-wishlist', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

// Helper for IndexedDB operations
const db = {
    async getAll(storeName) {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    async delete(storeName, key) {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

console.log('[SW] Service Worker loaded successfully', CACHE_VERSION);
