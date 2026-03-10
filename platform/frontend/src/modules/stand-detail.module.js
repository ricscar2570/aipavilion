/**
 * AI Pavilion - Stand Detail Page Module
 */

import { apiService } from '../services/api.service.js';
import { personalizeService } from '../services/personalize.service.js';
import { cartManager } from './cart.module.js';
import { uiManager } from '../ui/ui.manager.js';
import { escapeHtml, formatPrice } from '../utils/helpers.js';

class StandDetailManager {
    constructor() {
        this.currentStand = null;
        this.currentGalleryIndex = 0;
    }

    // ==================== LOAD STAND DETAILS ====================

    async loadStandDetails(standId, containerId = 'standDetailContainer') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('Container not found:', containerId);
            return;
        }

        try {
            uiManager.showLoader(containerId, 'Loading stand details...');

            // Load stand data
            const stand = await apiService.getStandDetails(standId);
            this.currentStand = stand;

            // Track view
            await personalizeService.trackView(standId, {
                standName: stand.name,
                category: stand.category
            });

            // Render stand details
            this.renderStandDetails(stand, container);

            // Setup interactions
            this.setupDetailPageInteractions();

        } catch (error) {
            console.error('Error loading stand details:', error);
            uiManager.showError(container, 'Unable to load stand details');
        }
    }

    // ==================== RENDER STAND DETAILS ====================

    renderStandDetails(stand, container) {
        const images = stand.images || [stand.image_url] || [];
        const products = stand.products || [];
        const documents = stand.documents || [];
        const videos = stand.videos || [];

        container.innerHTML = `
            <div class="stand-detail">
                <!-- Header -->
                <div class="stand-detail-header">
                    <button class="btn-back" onclick="history.back()">
                        ← Back to Stands
                    </button>
                    <div class="stand-detail-badges">
                        ${stand.category ? `<span class="badge">${escapeHtml(stand.category)}</span>` : ''}
                        ${stand.is_sponsored ? '<span class="badge badge-sponsored">Sponsored</span>' : ''}
                    </div>
                </div>

                <!-- Main Content Grid -->
                <div class="stand-detail-grid">
                    <!-- Left Column: Gallery -->
                    <div class="stand-detail-left">
                        ${this.renderGallery(images)}
                        ${videos.length > 0 ? this.renderVideos(videos) : ''}
                    </div>

                    <!-- Right Column: Info -->
                    <div class="stand-detail-right">
                        <h1 class="stand-detail-title">${escapeHtml(stand.name || 'Stand Details')}</h1>
                        
                        <div class="stand-detail-description">
                            <p>${escapeHtml(stand.description || 'No description available')}</p>
                        </div>

                        ${stand.long_description ? `
                            <div class="stand-detail-long-description">
                                <h3>About</h3>
                                <p>${escapeHtml(stand.long_description)}</p>
                            </div>
                        ` : ''}

                        <!-- Contact Info -->
                        ${this.renderContactInfo(stand)}

                        <!-- Action Buttons -->
                        <div class="stand-detail-actions">
                            <button class="btn btn-primary" onclick="standDetailManager.contactExhibitor('${stand.stand_id}')">
                                📧 Contact Exhibitor
                            </button>
                            <button class="btn btn-secondary" onclick="standDetailManager.bookMeeting('${stand.stand_id}')">
                                📅 Book Meeting
                            </button>
                            <button class="btn btn-secondary" onclick="standDetailManager.shareStand('${stand.stand_id}')">
                                🔗 Share
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Products Section -->
                ${products.length > 0 ? `
                    <div class="stand-detail-section">
                        <h2>Products & Services</h2>
                        <div class="products-grid">
                            ${products.map(product => this.renderProduct(product, stand.stand_id)).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Documents Section -->
                ${documents.length > 0 ? `
                    <div class="stand-detail-section">
                        <h2>Downloads</h2>
                        <div class="documents-list">
                            ${documents.map(doc => this.renderDocument(doc)).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Related Stands -->
                <div class="stand-detail-section">
                    <h2>Related Stands</h2>
                    <div id="relatedStandsGrid" class="related-stands-grid">
                        <div class="loader-container">
                            <div class="loader"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Load related stands
        this.loadRelatedStands(stand.stand_id, stand.category);
    }

    // ==================== RENDER COMPONENTS ====================

    renderGallery(images) {
        if (!images || images.length === 0) {
            return `
                <div class="stand-gallery">
                    <img src="https://via.placeholder.com/800x600?text=No+Image" alt="No image">
                </div>
            `;
        }

        return `
            <div class="stand-gallery">
                <div class="gallery-main">
                    <img id="galleryMainImage" 
                         src="${escapeHtml(images[0])}" 
                         alt="Stand image"
                         onerror="this.src='https://via.placeholder.com/800x600?text=Image+Error'">
                    
                    ${images.length > 1 ? `
                        <button class="gallery-nav gallery-prev" onclick="standDetailManager.previousImage()">❮</button>
                        <button class="gallery-nav gallery-next" onclick="standDetailManager.nextImage()">❯</button>
                    ` : ''}
                </div>

                ${images.length > 1 ? `
                    <div class="gallery-thumbnails">
                        ${images.map((img, index) => `
                            <img src="${escapeHtml(img)}" 
                                 alt="Thumbnail ${index + 1}"
                                 class="gallery-thumbnail ${index === 0 ? 'active' : ''}"
                                 onclick="standDetailManager.selectImage(${index})">
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderVideos(videos) {
        return `
            <div class="stand-videos">
                <h3>Videos</h3>
                ${videos.map(video => `
                    <div class="video-container">
                        <video controls width="100%">
                            <source src="${escapeHtml(video.url)}" type="video/mp4">
                            Your browser does not support video.
                        </video>
                        ${video.title ? `<p class="video-title">${escapeHtml(video.title)}</p>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderContactInfo(stand) {
        const contact = stand.contact || {};
        
        return `
            <div class="stand-contact-info">
                <h3>Contact Information</h3>
                <div class="contact-details">
                    ${contact.email || stand.contact_email ? `
                        <div class="contact-item">
                            <span class="contact-icon">📧</span>
                            <a href="mailto:${escapeHtml(contact.email || stand.contact_email)}">
                                ${escapeHtml(contact.email || stand.contact_email)}
                            </a>
                        </div>
                    ` : ''}
                    
                    ${contact.phone || stand.contact_phone ? `
                        <div class="contact-item">
                            <span class="contact-icon">📞</span>
                            <a href="tel:${escapeHtml(contact.phone || stand.contact_phone)}">
                                ${escapeHtml(contact.phone || stand.contact_phone)}
                            </a>
                        </div>
                    ` : ''}
                    
                    ${contact.website || stand.website ? `
                        <div class="contact-item">
                            <span class="contact-icon">🌐</span>
                            <a href="${escapeHtml(contact.website || stand.website)}" target="_blank">
                                Visit Website
                            </a>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    renderProduct(product, standId) {
        return `
            <div class="product-card" data-product-id="${product.product_id || product.id}">
                ${product.image ? `
                    <div class="product-image">
                        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
                    </div>
                ` : ''}
                <div class="product-info">
                    <h4>${escapeHtml(product.name || 'Product')}</h4>
                    ${product.description ? `<p>${escapeHtml(product.description)}</p>` : ''}
                    ${product.price ? `
                        <p class="product-price">${formatPrice(product.price)}</p>
                    ` : ''}
                    <button class="btn btn-primary btn-sm" 
                            onclick="standDetailManager.addProductToCart('${product.product_id || product.id}', '${escapeHtml(product.name)}', ${product.price || 0})">
                        Add to Cart
                    </button>
                </div>
            </div>
        `;
    }

    renderDocument(doc) {
        const fileSize = doc.size ? `(${this.formatFileSize(doc.size)})` : '';
        
        return `
            <div class="document-item">
                <span class="document-icon">📄</span>
                <div class="document-info">
                    <strong>${escapeHtml(doc.title || doc.name)}</strong>
                    ${doc.description ? `<p>${escapeHtml(doc.description)}</p>` : ''}
                    <span class="document-size">${fileSize}</span>
                </div>
                <button class="btn btn-secondary btn-sm" 
                        onclick="standDetailManager.downloadDocument('${doc.url}', '${escapeHtml(doc.name || 'document')}')">
                    Download
                </button>
            </div>
        `;
    }

    // ==================== GALLERY INTERACTIONS ====================

    selectImage(index) {
        const images = this.currentStand.images || [this.currentStand.image_url];
        if (index < 0 || index >= images.length) return;

        this.currentGalleryIndex = index;
        
        const mainImage = document.getElementById('galleryMainImage');
        if (mainImage) {
            mainImage.src = images[index];
        }

        // Update thumbnails
        document.querySelectorAll('.gallery-thumbnail').forEach((thumb, i) => {
            thumb.classList.toggle('active', i === index);
        });
    }

    nextImage() {
        const images = this.currentStand.images || [this.currentStand.image_url];
        const nextIndex = (this.currentGalleryIndex + 1) % images.length;
        this.selectImage(nextIndex);
    }

    previousImage() {
        const images = this.currentStand.images || [this.currentStand.image_url];
        const prevIndex = (this.currentGalleryIndex - 1 + images.length) % images.length;
        this.selectImage(prevIndex);
    }

    // ==================== ACTIONS ====================

    addProductToCart(productId, productName, price) {
        try {
            cartManager.addItem(productId, productName, price);
            uiManager.success(`${productName} added to cart!`);
            
            // Track add to cart
            personalizeService.trackAddToCart(this.currentStand.stand_id, {
                productId,
                productName,
                price
            });
        } catch (error) {
            console.error('Add to cart error:', error);
            uiManager.error(error.message);
        }
    }

    async downloadDocument(url, filename) {
        try {
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();

            // Track download
            await personalizeService.trackEvent('document_download', {
                standId: this.currentStand.stand_id,
                documentUrl: url,
                filename
            });

            uiManager.success('Download started');
        } catch (error) {
            console.error('Download error:', error);
            uiManager.error('Download failed');
        }
    }

    contactExhibitor(standId) {
        // Show contact form modal
        uiManager.showModal({
            title: 'Contact Exhibitor',
            size: 'medium',
            content: this.renderContactForm(standId),
            buttons: [
                {
                    label: 'Cancel',
                    className: 'btn-secondary',
                    action: 'cancel'
                },
                {
                    label: 'Send Message',
                    className: 'btn-primary',
                    action: 'send',
                    onClick: () => this.sendContactMessage(standId)
                }
            ]
        });
    }

    renderContactForm(standId) {
        return `
            <form id="contactForm" class="contact-form">
                <div class="form-group">
                    <label for="contactName">Your Name</label>
                    <input type="text" id="contactName" required>
                </div>
                <div class="form-group">
                    <label for="contactEmail">Your Email</label>
                    <input type="email" id="contactEmail" required>
                </div>
                <div class="form-group">
                    <label for="contactMessage">Message</label>
                    <textarea id="contactMessage" rows="5" required></textarea>
                </div>
            </form>
        `;
    }

    async sendContactMessage(standId) {
        const name = document.getElementById('contactName')?.value;
        const email = document.getElementById('contactEmail')?.value;
        const message = document.getElementById('contactMessage')?.value;

        if (!name || !email || !message) {
            uiManager.error('Please fill all fields');
            return;
        }

        try {
            await apiService.post('/stands/contact', {
                stand_id: standId,
                name,
                email,
                message
            });

            uiManager.success('Message sent successfully!');
            
            // Track contact
            await personalizeService.trackEvent('exhibitor_contact', {
                standId,
                method: 'email'
            });

        } catch (error) {
            console.error('Contact error:', error);
            uiManager.error('Failed to send message');
        }
    }

    bookMeeting(standId) {
        uiManager.info('Meeting booking feature coming soon!');
        
        // Track interest
        personalizeService.trackEvent('meeting_interest', { standId });
    }

    async shareStand(standId) {
        const url = `${window.location.origin}/stand/${standId}`;
        
        try {
            if (navigator.share) {
                await navigator.share({
                    title: this.currentStand.name,
                    text: this.currentStand.description,
                    url: url
                });
            } else {
                // Fallback: copy to clipboard
                await navigator.clipboard.writeText(url);
                uiManager.success('Link copied to clipboard!');
            }

            // Track share
            await personalizeService.trackEvent('stand_share', { standId });

        } catch (error) {
            console.error('Share error:', error);
        }
    }

    // ==================== RELATED STANDS ====================

    async loadRelatedStands(standId, category) {
        try {
            const relatedStands = await personalizeService.getRelatedItems(standId, 4);
            
            const container = document.getElementById('relatedStandsGrid');
            if (!container) return;

            if (relatedStands.length === 0) {
                container.innerHTML = '<p>No related stands found.</p>';
                return;
            }

            // Load full stand data
            const standsPromises = relatedStands.map(async (rec) => {
                try {
                    return await apiService.getStandDetails(rec.itemId);
                } catch {
                    return null;
                }
            });

            const stands = (await Promise.all(standsPromises)).filter(s => s !== null);

            container.innerHTML = stands.map(stand => `
                <div class="related-stand-card" onclick="standDetailManager.loadStandDetails('${stand.stand_id}')">
                    <img src="${escapeHtml(stand.image_url || '')}" alt="${escapeHtml(stand.name)}">
                    <h4>${escapeHtml(stand.name)}</h4>
                </div>
            `).join('');

        } catch (error) {
            console.error('Load related stands error:', error);
        }
    }

    // ==================== SETUP ====================

    setupDetailPageInteractions() {
        // Keyboard navigation for gallery
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                this.previousImage();
            } else if (e.key === 'ArrowRight') {
                this.nextImage();
            }
        });
    }

    // ==================== UTILITIES ====================

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
}

// ==================== SINGLETON ====================

export const standDetailManager = new StandDetailManager();
window.standDetailManager = standDetailManager;

export default standDetailManager;
