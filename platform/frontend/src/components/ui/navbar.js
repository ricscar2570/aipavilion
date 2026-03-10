// Enhanced Navbar Component - Professional Grade
export class EnhancedNavbar {
    constructor() {
        this.render();
        this.attachListeners();
    }
    
    render() {
        const nav = document.querySelector('nav') || document.createElement('nav');
        nav.className = 'glass-card fixed top-0 left-0 right-0 z-50';
        nav.innerHTML = `
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
                        <div class="relative">
                            <input 
                                type="search" 
                                placeholder="Search products..." 
                                class="hidden md:block w-64 px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                id="quick-search"
                            />
                        </div>
                        
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
        `;
        
        if (!document.querySelector('nav')) {
            document.body.insertBefore(nav, document.body.firstChild);
        }
    }
    
    attachListeners() {
        // Search functionality
        const searchInput = document.getElementById('quick-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                console.log('Searching:', e.target.value);
            });
        }
    }
}
