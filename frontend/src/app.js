/**
 * AI Pavilion - Main Application
 */
import { CONFIG } from './config/config.js';
import { authService } from './services/auth.service.js';
import { apiService } from './services/api.service.js';
import { personalizeService } from './services/personalize.service.js';
import { translateService } from './services/translate.service.js';
import StandsModule from './modules/stands.module.js';
import SearchModule from './modules/search.module.js';
import { cartManager } from './modules/cart.module.js';
import { uiManager } from './ui/ui.manager.js';

class App {
    constructor() {
        this.currentUser = null;
        this.currentRoute = null;
        this.standsManager = new StandsModule();
        this.searchManager = new SearchModule();
    }

    async init() {
        try {
            console.log('AI Pavilion v1.0.0 - Starting...');
            
            this.setupEventListeners();
            await this.initializeServices();
            
            this.currentUser = await authService.getCurrentUser();
            if (this.currentUser) {
                console.log('User authenticated:', this.currentUser.email);
            } else {
                console.log('Guest mode');
            }
            
            await this.handleRouting();
            
            console.log('AI Pavilion initialized');
            this.hideInitialLoader();
            
        } catch (error) {
            console.error('Init error:', error);
            this.hideInitialLoader();
        }
    }

    async initializeServices() {
        try {
            if (personalizeService && typeof personalizeService.initialize === 'function') {
                await personalizeService.initialize();
            }
            if (translateService && typeof translateService.initialize === 'function') {
                await translateService.initialize();
            }
        } catch (error) {
            console.error('Services init error:', error);
        }
    }

    setupEventListeners() {
        const boundRouting = this.handleRouting.bind(this);
        window.addEventListener('hashchange', boundRouting);
        window.addEventListener('popstate', boundRouting);
        console.log('Event listeners registered');
    }

    async handleRouting() {
        const hash = window.location.hash || '#/';
        console.log('Route:', hash);
        
        if (this.currentRoute === hash) {
            return;
        }
        
        this.currentRoute = hash;
        
        try {
            if (hash === '#/' || hash === '' || hash === '#') {
                await this.showHome();
            } 
            else if (hash === '#/search') {
                await this.showSearch();
            }
            else if (hash.startsWith('#/stands/')) {
                const standId = hash.replace('#/stands/', '');
                if (standId) {
                    await this.showStandDetail(standId);
                } else {
                    await this.showHome();
                }
            }
            else {
                console.warn('Unknown route:', hash);
                window.location.hash = '#/';
            }
        } catch (error) {
            console.error('Routing error:', error);
            await this.showHome();
        }
    }

    async loadInitialContent() {
        try {
            const standsContainer = document.getElementById('sponsoredStandsGrid') || document.getElementById('standsGrid');
            if (standsContainer && this.standsManager) {
                await this.standsManager.loadSponsoredStands(standsContainer.id);
            }
        } catch (error) {
            console.error('Load content error:', error);
        }
    }

    async showHome() {
        console.log('Show home');
        
        const standsView = document.getElementById('stands-view');
        const detailView = document.getElementById('stand-detail-view');
        
        if (standsView) standsView.style.display = 'block';
        if (detailView) detailView.style.display = 'none';
        
        window.scrollTo(0, 0);
        await this.loadInitialContent();
    }

    async showStandDetail(standId) {
        console.log('Show stand:', standId);
        
        const standsView = document.getElementById('stands-view');
        const detailView = document.getElementById('stand-detail-view');
        
        if (standsView) standsView.style.display = 'none';
        if (detailView) detailView.style.display = 'block';
        
        window.scrollTo(0, 0);
        
        try {
            const stand = await apiService.getStandDetails(standId);
            this.renderStandDetail(stand, detailView);
        } catch (error) {
            console.error('Load stand error:', error);
            if (detailView) {
                detailView.innerHTML = '<div class="error-message"><h2>Stand Not Found</h2><p>Unable to load stand.</p><button onclick="window.location.hash=' + "'#/'" + '">Back</button></div>';
            }
        }
    }

    renderStandDetail(stand, container) {
        if (!container) return;
        
        container.innerHTML = '<div class="stand-detail"><button onclick="window.location.hash=' + "'#/'" + '" class="back-button">Back</button><div class="stand-detail-header"><img src="' + stand.image_url + '" alt="' + stand.name + '"><div class="stand-detail-info"><h1>' + stand.name + '</h1><p>' + (stand.category || 'General') + '</p><div class="stand-meta">' + (stand.rating ? '<span>Rating: ' + stand.rating + '</span>' : '') + (stand.booth_number ? '<span>Booth: ' + stand.booth_number + '</span>' : '') + '</div></div></div><div class="stand-detail-content"><h2>About</h2><p>' + (stand.long_description || stand.description || 'No description.') + '</p></div></div>';
    }


    async showSearch() {
        console.log('Show search');
        
        const standsView = document.getElementById('stands-view');
        const detailView = document.getElementById('stand-detail-view');
        
        if (standsView) standsView.style.display = 'none';
        if (detailView) {
            detailView.style.display = 'block';
            this.searchManager.renderSearchPage(detailView);
        }
        
        window.scrollTo(0, 0);
    }
    hideInitialLoader() {
        const loader = document.getElementById('initialLoader');
        if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => {
                loader.style.display = 'none';
                loader.remove();
            }, 500);
            console.log('Loader hidden');
        }
        document.body.classList.add('loaded');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});

export default App;
