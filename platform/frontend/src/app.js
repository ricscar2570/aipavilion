// AI Pavilion - Main Application
import { config } from './config/config.js';

class AIPayilion {
    constructor() {
        this.currentPage = 'home';
        this.init();
    }
    
    async init() {
        console.log('🚀 AI Pavilion initializing...');
        this.renderApp();
        this.setupRouting();
        await this.loadStands();
    }
    
    renderApp() {
        const app = document.getElementById('app');
        
        app.innerHTML = `
            <!-- Navigation -->
            <nav class="glass-card fixed top-0 left-0 right-0 z-50">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="flex justify-between items-center h-16">
                        <div class="flex items-center space-x-8">
                            <a href="#/" class="flex items-center space-x-2">
                                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                    <span class="text-white font-bold text-xl">AI</span>
                                </div>
                                <span class="text-xl font-bold gradient-text">Pavilion</span>
                            </a>
                            
                            <div class="hidden md:flex space-x-6">
                                <a href="#/" class="text-gray-700 hover:text-purple-600 font-medium transition">Stands</a>
                                <a href="#/search" class="text-gray-700 hover:text-purple-600 font-medium transition">Search</a>
                                <a href="#/featured" class="text-gray-700 hover:text-purple-600 font-medium transition">Featured</a>
                            </div>
                        </div>
                        
                        <div class="flex items-center space-x-4">
                            <a href="#/cart" class="relative p-2 rounded-lg hover:bg-gray-100 transition">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                                </svg>
                                <span class="absolute -top-1 -right-1 bg-pink-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center" id="cart-count">0</span>
                            </a>
                            
                            <button class="btn-primary" id="auth-button">Login</button>
                        </div>
                    </div>
                </div>
            </nav>
            
            <!-- Main Content -->
            <div class="pt-16" id="main-content">
                <div class="loading-skeleton h-96"></div>
            </div>
        `;
    }
    
    setupRouting() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    }
    
    handleRoute() {
        const hash = window.location.hash.slice(1) || '/';
        
        if (hash === '/') {
            this.renderHomepage();
        } else if (hash.startsWith('/stand/')) {
            this.renderStandDetail(hash.split('/')[2]);
        }
    }
    
    renderHomepage() {
        const content = document.getElementById('main-content');
        
        content.innerHTML = `
            <!-- Hero Section -->
            <div class="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
                <div class="max-w-7xl mx-auto">
                    <div class="text-center">
                        <h1 class="text-5xl md:text-7xl font-extrabold text-white mb-6 animate-fade-in">
                            Welcome to the Future of
                            <span class="block gradient-text bg-white">Gaming Expos</span>
                        </h1>
                        
                        <p class="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
                            Explore stands in AR, take 360° virtual tours, and shop the latest games
                        </p>
                        
                        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                            <button class="btn-primary text-lg px-8 py-4">
                                🚀 Explore Stands
                            </button>
                            <button class="bg-white/20 backdrop-blur text-white px-8 py-4 rounded-xl font-semibold hover:bg-white/30 transition">
                                📱 Download App
                            </button>
                        </div>
                        
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
                            <div class="glass-card p-6 rounded-xl hover-lift">
                                <div class="text-3xl font-bold gradient-text bg-white mb-2">500+</div>
                                <div class="text-white/80 text-sm">Products</div>
                            </div>
                            <div class="glass-card p-6 rounded-xl hover-lift">
                                <div class="text-3xl font-bold gradient-text bg-white mb-2">50+</div>
                                <div class="text-white/80 text-sm">Exhibitors</div>
                            </div>
                            <div class="glass-card p-6 rounded-xl hover-lift">
                                <div class="text-3xl font-bold gradient-text bg-white mb-2">AR</div>
                                <div class="text-white/80 text-sm">3D Models</div>
                            </div>
                            <div class="glass-card p-6 rounded-xl hover-lift">
                                <div class="text-3xl font-bold gradient-text bg-white mb-2">360°</div>
                                <div class="text-white/80 text-sm">Tours</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Stands Grid -->
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <h2 class="text-3xl font-bold text-white mb-8">Featured Stands</h2>
                <div id="stands-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div class="loading-skeleton h-64 rounded-2xl"></div>
                    <div class="loading-skeleton h-64 rounded-2xl"></div>
                    <div class="loading-skeleton h-64 rounded-2xl"></div>
                </div>
            </div>
        `;
    }
    
    async loadStands() {
        try {
            const response = await fetch(`${config.apiUrl}/stands`);
            const stands = await response.json();
            this.renderStands(stands);
        } catch (error) {
            console.error('Failed to load stands:', error);
        }
    }
    
    renderStands(stands) {
        const grid = document.getElementById('stands-grid');
        if (!grid) return;
        
        grid.innerHTML = stands.map(stand => `
            <div class="glass-card rounded-2xl overflow-hidden hover-lift cursor-pointer" onclick="window.location.hash='/stand/${stand.stand_id}'">
                <div class="relative h-48 overflow-hidden">
                    <img 
                        src="${stand.image_url || 'https://via.placeholder.com/400x300?text=Stand'}" 
                        alt="${stand.name}"
                        class="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
                    />
                    ${stand.is_sponsored ? '<div class="absolute top-4 right-4 badge badge-featured">⭐ Featured</div>' : ''}
                    ${stand.ar_enabled ? '<div class="absolute top-4 left-4 badge badge-ar">🥽 AR</div>' : ''}
                </div>
                
                <div class="p-6">
                    <h3 class="text-xl font-bold text-gray-900 mb-2">${stand.name}</h3>
                    <p class="text-gray-600 text-sm mb-4">${stand.description || 'Discover amazing products'}</p>
                    
                    <div class="flex items-center justify-between">
                        <span class="text-xs text-gray-500">Booth ${stand.booth_number}</span>
                        <svg class="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    renderStandDetail(standId) {
        const content = document.getElementById('main-content');
        content.innerHTML = `
            <div class="max-w-7xl mx-auto px-4 py-8">
                <h1 class="text-4xl font-bold text-white mb-8">Stand Details</h1>
                <div class="glass-card p-8 rounded-2xl">
                    <p>Loading stand ${standId}...</p>
                </div>
            </div>
        `;
    }
}

// Initialize app
new AIPayilion();
