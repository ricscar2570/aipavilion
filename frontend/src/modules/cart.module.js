/**
 * AI Pavilion - Cart Module COMPLETE
 */

import { CONFIG } from '../config/config.js';
import { getFromStorage, saveToStorage, removeFromStorage } from '../utils/helpers.js';
import { EVENT_TYPES, LOCAL_STORAGE_KEYS, SUCCESS_MESSAGES, ERROR_MESSAGES } from '../utils/constants.js';

class CartManager {
    constructor() {
        this.storageKey = CONFIG.cart.storageKey;
        this.maxItems = CONFIG.cart.maxItems;
        this.maxQuantityPerItem = CONFIG.cart.maxQuantityPerItem;
        this.listeners = [];
        this.syncInterval = null;
        
        this.initSync();
    }

    // ==================== SYNC ====================

    initSync() {
        if (CONFIG.cart.syncWithBackend && CONFIG.cart.syncInterval > 0) {
            this.syncInterval = setInterval(() => {
                this.syncWithBackend();
            }, CONFIG.cart.syncInterval);
        }
    }

    async syncWithBackend() {
        try {
            const cart = this.getCart();
            if (cart.length === 0) return;

            // In produzione, sync con backend
            console.log('Syncing cart with backend...', cart.length, 'items');
            
            // await apiService.post('/cart/sync', { items: cart });

        } catch (error) {
            console.error('Cart sync error:', error);
        }
    }

    stopSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    // ==================== CART OPERATIONS ====================

    getCart() {
        const cart = getFromStorage(this.storageKey, []);
        
        // Validate cart items
        return cart.filter(item => {
            return item.productId && 
                   item.productName && 
                   typeof item.price === 'number' &&
                   typeof item.quantity === 'number' &&
                   item.quantity > 0;
        });
    }

    _saveCart(cart) {
        saveToStorage(this.storageKey, cart);
        this._notifyListeners(EVENT_TYPES.CART_UPDATED, { cart });
    }

    addItem(productId, productName, price, quantity = 1, metadata = {}) {
        const cart = this.getCart();

        // Validate inputs
        if (!productId || !productName) {
            throw new Error('Product ID and name are required');
        }

        if (typeof price !== 'number' || price < 0) {
            throw new Error('Invalid price');
        }

        if (typeof quantity !== 'number' || quantity < 1) {
            throw new Error('Invalid quantity');
        }

        // Check cart limits
        if (cart.length >= this.maxItems) {
            throw new Error(ERROR_MESSAGES.CART_FULL);
        }

        const existingItem = cart.find(item => item.productId === productId);

        if (existingItem) {
            // Update quantity
            const newQuantity = existingItem.quantity + quantity;
            
            if (newQuantity > this.maxQuantityPerItem) {
                throw new Error(`Maximum quantity (${this.maxQuantityPerItem}) exceeded`);
            }

            existingItem.quantity = newQuantity;
            existingItem.updatedAt = new Date().toISOString();
        } else {
            // Add new item
            cart.push({
                productId,
                productName,
                price,
                quantity,
                metadata,
                addedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }

        this._saveCart(cart);
        this._notifyListeners(EVENT_TYPES.CART_ITEM_ADDED, { productId, quantity });

        return true;
    }

    removeItem(productId) {
        let cart = this.getCart();
        const initialLength = cart.length;
        
        cart = cart.filter(item => item.productId !== productId);
        
        if (cart.length !== initialLength) {
            this._saveCart(cart);
            this._notifyListeners(EVENT_TYPES.CART_ITEM_REMOVED, { productId });
            return true;
        }
        
        return false;
    }

    updateQuantity(productId, quantity) {
        if (typeof quantity !== 'number' || quantity < 0) {
            throw new Error('Invalid quantity');
        }

        if (quantity === 0) {
            return this.removeItem(productId);
        }

        if (quantity > this.maxQuantityPerItem) {
            throw new Error(`Maximum quantity (${this.maxQuantityPerItem}) exceeded`);
        }

        const cart = this.getCart();
        const item = cart.find(item => item.productId === productId);

        if (!item) {
            return false;
        }

        item.quantity = quantity;
        item.updatedAt = new Date().toISOString();

        this._saveCart(cart);
        return true;
    }

    updateItem(productId, updates) {
        const cart = this.getCart();
        const item = cart.find(item => item.productId === productId);

        if (!item) {
            return false;
        }

        Object.assign(item, updates, {
            updatedAt: new Date().toISOString()
        });

        this._saveCart(cart);
        return true;
    }

    clearCart() {
        removeFromStorage(this.storageKey);
        this._notifyListeners(EVENT_TYPES.CART_CLEARED, {});
    }

    // ==================== CART INFO ====================

    getTotal() {
        const cart = this.getCart();
        return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }

    getTotalInCents() {
        return Math.round(this.getTotal() * 100);
    }

    getItemCount() {
        const cart = this.getCart();
        return cart.reduce((sum, item) => sum + item.quantity, 0);
    }

    getUniqueItemCount() {
        return this.getCart().length;
    }

    hasItem(productId) {
        const cart = this.getCart();
        return cart.some(item => item.productId === productId);
    }

    getItem(productId) {
        const cart = this.getCart();
        return cart.find(item => item.productId === productId) || null;
    }

    isEmpty() {
        return this.getCart().length === 0;
    }

    // ==================== VALIDATION ====================

    validate() {
        const cart = this.getCart();
        const errors = [];

        if (cart.length === 0) {
            errors.push('Cart is empty');
        }

        cart.forEach((item, index) => {
            if (!item.productId) {
                errors.push(`Item ${index + 1}: Missing product ID`);
            }
            if (typeof item.price !== 'number' || item.price < 0) {
                errors.push(`Item ${index + 1}: Invalid price`);
            }
            if (typeof item.quantity !== 'number' || item.quantity < 1) {
                errors.push(`Item ${index + 1}: Invalid quantity`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // ==================== BULK OPERATIONS ====================

    addMultipleItems(items) {
        const results = [];
        
        items.forEach(item => {
            try {
                this.addItem(
                    item.productId,
                    item.productName,
                    item.price,
                    item.quantity || 1,
                    item.metadata || {}
                );
                results.push({ success: true, productId: item.productId });
            } catch (error) {
                results.push({ success: false, productId: item.productId, error: error.message });
            }
        });

        return results;
    }

    removeMultipleItems(productIds) {
        productIds.forEach(productId => {
            this.removeItem(productId);
        });
    }

    // ==================== CART MANIPULATION ====================

    mergeCart(otherCart) {
        const currentCart = this.getCart();
        
        otherCart.forEach(item => {
            const existing = currentCart.find(i => i.productId === item.productId);
            
            if (existing) {
                existing.quantity += item.quantity;
                if (existing.quantity > this.maxQuantityPerItem) {
                    existing.quantity = this.maxQuantityPerItem;
                }
            } else if (currentCart.length < this.maxItems) {
                currentCart.push(item);
            }
        });

        this._saveCart(currentCart);
    }

    cloneCart() {
        return JSON.parse(JSON.stringify(this.getCart()));
    }

    // ==================== DISCOUNT & TAX ====================

    applyDiscount(discountPercent) {
        if (typeof discountPercent !== 'number' || discountPercent < 0 || discountPercent > 100) {
            throw new Error('Invalid discount percentage');
        }

        const subtotal = this.getTotal();
        const discount = (subtotal * discountPercent) / 100;
        return subtotal - discount;
    }

    calculateTax(taxRate) {
        if (typeof taxRate !== 'number' || taxRate < 0) {
            throw new Error('Invalid tax rate');
        }

        const subtotal = this.getTotal();
        return (subtotal * taxRate) / 100;
    }

    getTotalWithTax(taxRate) {
        return this.getTotal() + this.calculateTax(taxRate);
    }

    // ==================== EVENT SYSTEM ====================

    subscribe(callback) {
        this.listeners.push(callback);
        
        // Immediately call with current cart
        try {
            callback(this.getCart());
        } catch (error) {
            console.error('Error in cart subscriber:', error);
        }

        // Return unsubscribe function
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    _notifyListeners(event, data) {
        const cart = this.getCart();
        
        this.listeners.forEach(callback => {
            try {
                callback(cart, event, data);
            } catch (error) {
                console.error('Error in cart listener:', error);
            }
        });
    }

    // ==================== UTILITIES ====================

    exportCart() {
        return JSON.stringify(this.getCart(), null, 2);
    }

    importCart(jsonString) {
        try {
            const cart = JSON.parse(jsonString);
            
            if (!Array.isArray(cart)) {
                throw new Error('Invalid cart format');
            }

            this._saveCart(cart);
            return true;

        } catch (error) {
            console.error('Import cart error:', error);
            return false;
        }
    }

    getCartSummary() {
        const cart = this.getCart();
        
        return {
            itemCount: this.getItemCount(),
            uniqueItemCount: this.getUniqueItemCount(),
            subtotal: this.getTotal(),
            isEmpty: this.isEmpty(),
            items: cart.map(item => ({
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                price: item.price,
                total: item.price * item.quantity
            }))
        };
    }

    // ==================== CLEANUP ====================

    destroy() {
        this.stopSync();
        this.listeners = [];
    }
}

// ==================== SINGLETON INSTANCE ====================

export const cartManager = new CartManager();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    cartManager.destroy();
});

export default cartManager;
