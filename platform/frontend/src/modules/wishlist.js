// Wishlist Manager - Production Ready
export class WishlistManager {
    constructor() {
        this.items = this.loadFromStorage();
        this.updateUI();
    }
    
    loadFromStorage() {
        try {
            return JSON.parse(localStorage.getItem('aipavilion_wishlist') || '[]');
        } catch (e) {
            console.error('Failed to load wishlist:', e);
            return [];
        }
    }
    
    saveToStorage() {
        try {
            localStorage.setItem('aipavilion_wishlist', JSON.stringify(this.items));
            this.updateUI();
        } catch (e) {
            console.error('Failed to save wishlist:', e);
        }
    }
    
    add(product) {
        const exists = this.items.find(item => item.id === product.id);
        
        if (exists) {
            this.showNotification('Already in wishlist!', 'info');
            return false;
        }
        
        this.items.push({
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            addedAt: new Date().toISOString()
        });
        
        this.saveToStorage();
        this.showNotification('Added to wishlist! ❤️', 'success');
        return true;
    }
    
    remove(productId) {
        this.items = this.items.filter(item => item.id !== productId);
        this.saveToStorage();
        this.showNotification('Removed from wishlist', 'info');
    }
    
    toggle(product) {
        const exists = this.items.find(item => item.id === product.id);
        if (exists) {
            this.remove(product.id);
            return false;
        } else {
            this.add(product);
            return true;
        }
    }
    
    isInWishlist(productId) {
        return this.items.some(item => item.id === productId);
    }
    
    updateUI() {
        const badge = document.getElementById('wishlist-count');
        if (badge) {
            badge.textContent = this.items.length;
        }
    }
    
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        const bgColors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            info: 'bg-blue-500'
        };
        
        notification.className = `fixed top-20 right-4 z-50 ${bgColors[type]} text-white px-6 py-4 rounded-xl shadow-2xl`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 3000);
    }
}

// Initialize globally
if (typeof window !== 'undefined') {
    window.wishlist = new WishlistManager();
}
