#!/bin/bash
# day10-advanced-features.sh - Search, Wishlist, Reviews
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../config/config.env"

echo "⚡ DAY 10: ADVANCED FEATURES"
validate_config || exit 1

# Advanced Search with Filters
log_info "Creating advanced search..."

mkdir -p "${FRONTEND_DIR}/src/components/search"
cat > "${FRONTEND_DIR}/src/components/search/advanced-search.js" << 'SEARCH'
export class AdvancedSearch {
    render() {
        return `
            <div class="glass-card p-6 rounded-2xl mb-8">
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <input 
                        type="text" 
                        placeholder="Search products, stands..."
                        class="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none"
                        id="search-input"
                    />
                    
                    <select class="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500" id="category-filter">
                        <option value="">All Categories</option>
                        <option value="action">Action</option>
                        <option value="rpg">RPG</option>
                        <option value="strategy">Strategy</option>
                        <option value="indie">Indie</option>
                    </select>
                    
                    <select class="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500" id="price-filter">
                        <option value="">All Prices</option>
                        <option value="0-20">Under $20</option>
                        <option value="20-40">$20 - $40</option>
                        <option value="40+">Over $40</option>
                    </select>
                    
                    <div class="flex items-center space-x-2">
                        <label class="flex items-center space-x-2 cursor-pointer">
                            <input type="checkbox" id="ar-only" class="rounded"/>
                            <span class="text-sm">AR Only</span>
                        </label>
                        <label class="flex items-center space-x-2 cursor-pointer">
                            <input type="checkbox" id="360-only" class="rounded"/>
                            <span class="text-sm">360° Only</span>
                        </label>
                    </div>
                </div>
                
                <div class="mt-4 flex flex-wrap gap-2" id="active-filters"></div>
            </div>
        `;
    }
}
SEARCH

# Wishlist Component
cat > "${FRONTEND_DIR}/src/components/wishlist.js" << 'WISHLIST'
export class Wishlist {
    constructor() {
        this.items = JSON.parse(localStorage.getItem('wishlist') || '[]');
    }
    
    add(product) {
        if (!this.items.find(p => p.id === product.id)) {
            this.items.push(product);
            this.save();
            this.showNotification('Added to wishlist! ❤️');
        }
    }
    
    remove(productId) {
        this.items = this.items.filter(p => p.id !== productId);
        this.save();
    }
    
    save() {
        localStorage.setItem('wishlist', JSON.stringify(this.items));
        this.updateUI();
    }
    
    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'fixed top-20 right-4 bg-green-500 text-white px-6 py-3 rounded-xl shadow-lg z-50 animate-fade-in';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
    
    updateUI() {
        const badge = document.querySelector('#wishlist-count');
        if (badge) badge.textContent = this.items.length;
    }
}
WISHLIST

# Reviews Component
cat > "${FRONTEND_DIR}/src/components/reviews.js" << 'REVIEWS'
export class Reviews {
    static render(productId, reviews = []) {
        const avgRating = reviews.length ? 
            (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : 
            '0.0';
        
        return `
            <div class="mt-8">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h3 class="text-2xl font-bold">Customer Reviews</h3>
                        <div class="flex items-center mt-2">
                            <div class="flex text-yellow-400">
                                ${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5 - Math.round(avgRating))}
                            </div>
                            <span class="ml-2 text-lg font-semibold">${avgRating}</span>
                            <span class="ml-2 text-gray-500">(${reviews.length} reviews)</span>
                        </div>
                    </div>
                    <button class="btn-primary">Write Review</button>
                </div>
                
                <div class="space-y-4">
                    ${reviews.map(review => `
                        <div class="glass-card p-6 rounded-xl">
                            <div class="flex items-start justify-between mb-3">
                                <div>
                                    <div class="font-semibold">${review.author}</div>
                                    <div class="flex text-yellow-400 text-sm">
                                        ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}
                                    </div>
                                </div>
                                <span class="text-sm text-gray-500">${review.date}</span>
                            </div>
                            <p class="text-gray-700">${review.text}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
}
REVIEWS

log_success "✓ Advanced features created"

aws s3 sync ${FRONTEND_DIR}/ s3://${S3_BUCKET_NAME}/ --exclude ".git/*" --quiet

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ DAY 10 COMPLETE: ADVANCED FEATURES!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚡ Added: Advanced search, Wishlist, Reviews system"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
