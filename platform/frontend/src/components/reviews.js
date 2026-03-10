// Reviews System - Production Ready
export class ReviewsSystem {
    constructor(productId) {
        this.productId = productId;
        this.reviews = [];
        this.averageRating = 0;
    }
    
    async loadReviews() {
        // Mock data - replace with API call
        this.reviews = [
            {
                id: 1,
                author: 'John Doe',
                rating: 5,
                title: 'Amazing!',
                text: 'Great product, highly recommended!',
                date: '2026-03-01',
                verified: true,
                helpful: 24
            }
        ];
        this.calculateAverageRating();
    }
    
    calculateAverageRating() {
        if (this.reviews.length === 0) {
            this.averageRating = 0;
            return;
        }
        const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
        this.averageRating = (sum / this.reviews.length).toFixed(1);
    }
    
    render() {
        return `
            <div class="mt-12 space-y-8">
                <div class="flex items-start justify-between">
                    <div>
                        <h2 class="text-3xl font-bold text-gray-900 mb-4">Customer Reviews</h2>
                        <div class="flex items-center space-x-4">
                            <div class="flex text-yellow-400 text-2xl">
                                ${this.renderStars(this.averageRating)}
                            </div>
                            <span class="text-3xl font-bold text-gray-900">${this.averageRating}</span>
                            <span class="text-gray-600">(${this.reviews.length} reviews)</span>
                        </div>
                    </div>
                    <button class="btn-primary">Write Review</button>
                </div>
                
                <div class="space-y-6">
                    ${this.reviews.map(review => this.renderReview(review)).join('')}
                </div>
            </div>
        `;
    }
    
    renderStars(rating) {
        const fullStars = Math.floor(rating);
        let stars = '';
        for (let i = 0; i < fullStars; i++) {
            stars += '★';
        }
        for (let i = fullStars; i < 5; i++) {
            stars += '☆';
        }
        return stars;
    }
    
    renderReview(review) {
        return `
            <div class="glass-card p-6 rounded-xl">
                <div class="flex items-start justify-between mb-4">
                    <div>
                        <div class="font-semibold text-gray-900">${review.author}</div>
                        <div class="flex text-yellow-400">${this.renderStars(review.rating)}</div>
                    </div>
                    <span class="text-sm text-gray-500">${review.date}</span>
                </div>
                ${review.title ? `<h4 class="font-bold text-lg mb-2">${review.title}</h4>` : ''}
                <p class="text-gray-700">${review.text}</p>
            </div>
        `;
    }
}
