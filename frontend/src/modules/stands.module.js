/**
 * Stands Module - Gestione visualizzazione stand
 */
import { apiService } from '../services/api.service.js';
import { personalizeService } from '../services/personalize.service.js';
import { escapeHtml } from '../utils/helpers.js';

class StandsModule {
    constructor() {
        this.currentStands = [];
    }

    async loadSponsoredStands(containerId = 'sponsoredStandsGrid') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} not found`);
            return;
        }

        try {
            this.showLoader(container, 'Loading sponsored stands...');
            const stands = await apiService.getSponsoredStands();
            this.currentStands = stands;

            if (stands.length === 0) {
                this.showEmptyState(container, 'No sponsored stands available at the moment.');
                return;
            }

            this.renderStands(stands, container);

            await personalizeService.trackEvent('stands_page_view', {
                standCount: stands.length
            });
        } catch (error) {
            console.error('Error loading sponsored stands:', error);
            this.showError(container, 'Unable to load stands. Please try again later.', () => {
                this.loadSponsoredStands(containerId);
            });
        }
    }

    renderStands(stands, container) {
        container.innerHTML = stands.map(stand => this._renderStandCard(stand)).join('');
        
        // Attach event listeners
        this.attachStandEventListeners();
    }

    _renderStandCard(stand) {
        const imageUrl = stand.image_url || 'https://via.placeholder.com/400x300?text=No+Image';
        
        return `
            <div class="stand-card" data-stand-id="${stand.stand_id}">
                <div class="stand-image">
                    <img src="${escapeHtml(imageUrl)}" 
                         alt="${escapeHtml(stand.name || 'Stand')}"
                         onerror="this.src='https://via.placeholder.com/400x300?text=Image+Error'">
                </div>
                <div class="stand-content">
                    <h3>${escapeHtml(stand.name || 'Untitled Stand')}</h3>
                    <p class="stand-description">${escapeHtml(stand.description || '')}</p>
                    <div class="stand-meta">
                        ${stand.rating ? `<span class="rating">⭐ ${stand.rating}</span>` : ''}
                        ${stand.booth_number ? `<span class="booth">📍 ${escapeHtml(stand.booth_number)}</span>` : ''}
                        ${stand.is_sponsored ? '<span class="sponsored">✨ Sponsored</span>' : ''}
                    </div>
                </div>
            </div>
        `;
    }

    attachStandEventListeners() {
        const standCards = document.querySelectorAll('[data-stand-id]');
        
        if (standCards.length === 0) {
            console.warn('⚠️ No stand cards found');
            return;
        }
        
        standCards.forEach(card => {
            card.style.cursor = 'pointer';
            card.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
            
            card.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const standId = card.getAttribute('data-stand-id');
                if (standId) {
                    console.log('🎯 Stand clicked:', standId);
                    this.handleStandClick(standId);
                }
            });
            
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-5px)';
                card.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
            });
            
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0)';
                card.style.boxShadow = '';
            });
        });
        
        console.log(`✅ Event listeners attached to ${standCards.length} stands`);
    }
    
    handleStandClick(standId) {
        console.log('📍 Navigating to stand:', standId);
        window.location.hash = `#/stands/${standId}`;
        
        window.dispatchEvent(new CustomEvent('stand-clicked', {
            detail: { standId }
        }));
    }

    showLoader(container, message = 'Loading...') {
        container.innerHTML = `
            <div class="loader">
                <div class="spinner"></div>
                <p>${escapeHtml(message)}</p>
            </div>
        `;
    }

    showEmptyState(container, message) {
        container.innerHTML = `
            <div class="empty-state">
                <p>${escapeHtml(message)}</p>
            </div>
        `;
    }

    showError(container, message, retryCallback) {
        container.innerHTML = `
            <div class="error-state">
                <p>${escapeHtml(message)}</p>
                ${retryCallback ? '<button class="retry-btn">Retry</button>' : ''}
            </div>
        `;

        if (retryCallback) {
            const retryBtn = container.querySelector('.retry-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', retryCallback);
            }
        }
    }
}

export default StandsModule;