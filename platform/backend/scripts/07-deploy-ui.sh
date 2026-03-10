#!/bin/bash
# day8-ui-ux-enhancement.sh - Professional UI/UX Upgrade
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../config/config.env"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎨 DAY 8: UI/UX PROFESSIONAL UPGRADE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

validate_config || exit 1
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/day8-${TIMESTAMP}"
mkdir -p "${BACKUP_PATH}"

# Backup frontend
cp -r "${FRONTEND_DIR}/src" "${BACKUP_PATH}/src.backup" 2>/dev/null || true
cp "${FRONTEND_DIR}/index.html" "${BACKUP_PATH}/" 2>/dev/null || true
log_success "✓ Backup: ${BACKUP_PATH}"

log_info "Installing Tailwind CSS via CDN..."

# Update index.html with Tailwind + modern styles
cat > /tmp/update-html-ui.js << 'JSEOF'
const fs = require('fs');
const htmlPath = process.argv[2];
let html = fs.readFileSync(htmlPath, 'utf8');

// Add Tailwind CSS + custom styles before </head>
if (!html.includes('tailwindcss')) {
    const headClosing = html.indexOf('</head>');
    const insert = `
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        primary: '#6366f1',
                        secondary: '#8b5cf6',
                        accent: '#ec4899',
                    }
                }
            }
        }
    </script>
    
    <!-- Custom Professional Styles -->
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        * {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        
        .glass-card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        
        .gradient-text {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .hover-lift {
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        .hover-lift:hover {
            transform: translateY(-4px);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 0.75rem 2rem;
            border-radius: 0.75rem;
            font-weight: 600;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
        }
        
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
        }
        
        .loading-skeleton {
            background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
            background-size: 200% 100%;
            animation: loading 1.5s infinite;
        }
        
        @keyframes loading {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
        
        .badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
        }
        
        .badge-featured {
            background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
            color: #000;
        }
        
        .badge-new {
            background: linear-gradient(135deg, #ec4899 0%, #f43f5e 100%);
            color: white;
        }
        
        .badge-ar {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
        }
    </style>
`;
    html = html.slice(0, headClosing) + insert + html.slice(headClosing);
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log('✅ UI styles added');
}
JSEOF

node /tmp/update-html-ui.js "${FRONTEND_DIR}/index.html"

log_info "Creating enhanced UI components..."

# Enhanced Navbar Component
mkdir -p "${FRONTEND_DIR}/src/components/ui"
cat > "${FRONTEND_DIR}/src/components/ui/navbar.js" << 'NAVBAR'
export class EnhancedNavbar {
    constructor() {
        this.render();
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
}
NAVBAR

# Enhanced Stand Card Component
cat > "${FRONTEND_DIR}/src/components/ui/stand-card.js" << 'CARD'
export class StandCard {
    static create(stand) {
        return `
            <div class="glass-card rounded-2xl overflow-hidden hover-lift cursor-pointer" data-stand-id="${stand.stand_id}">
                <div class="relative h-48 overflow-hidden">
                    <img 
                        src="${stand.image_url || 'https://via.placeholder.com/400x300?text=Stand'}" 
                        alt="${stand.name}"
                        class="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
                    />
                    ${stand.is_sponsored ? '<div class="absolute top-4 right-4 badge badge-featured">⭐ Featured</div>' : ''}
                    ${stand.ar_enabled ? '<div class="absolute top-4 left-4 badge badge-ar">🥽 AR</div>' : ''}
                    ${stand.tour_enabled ? '<div class="absolute top-12 left-4 badge" style="background: #3b82f6; color: white;">🎪 360°</div>' : ''}
                </div>
                
                <div class="p-6">
                    <div class="flex items-start justify-between mb-3">
                        <h3 class="text-xl font-bold text-gray-900">${stand.name}</h3>
                        <div class="flex items-center space-x-1">
                            <svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                            </svg>
                            <span class="text-sm font-semibold">${stand.rating || '4.5'}</span>
                        </div>
                    </div>
                    
                    <p class="text-gray-600 text-sm mb-4 line-clamp-2">${stand.description || 'Discover amazing products and experiences'}</p>
                    
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2">
                            <span class="text-xs text-gray-500">Booth ${stand.booth_number}</span>
                            ${stand.products && stand.products.length > 0 ? `
                                <span class="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">${stand.products.length} products</span>
                            ` : ''}
                        </div>
                        
                        <svg class="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                    </div>
                </div>
            </div>
        `;
    }
}
CARD

# Enhanced Hero Section
cat > "${FRONTEND_DIR}/src/components/ui/hero.js" << 'HERO'
export class HeroSection {
    static render() {
        return `
            <div class="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
                <div class="max-w-7xl mx-auto">
                    <div class="text-center">
                        <h1 class="text-5xl md:text-7xl font-extrabold text-white mb-6 animate-fade-in">
                            Welcome to the Future of
                            <span class="block gradient-text bg-white">Gaming Expos</span>
                        </h1>
                        
                        <p class="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
                            Explore stands in AR, take 360° virtual tours, and shop the latest games and merchandise
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
                            <div class="glass-card p-6 rounded-xl">
                                <div class="text-3xl font-bold gradient-text bg-white mb-2">500+</div>
                                <div class="text-white/80 text-sm">Products</div>
                            </div>
                            <div class="glass-card p-6 rounded-xl">
                                <div class="text-3xl font-bold gradient-text bg-white mb-2">50+</div>
                                <div class="text-white/80 text-sm">Exhibitors</div>
                            </div>
                            <div class="glass-card p-6 rounded-xl">
                                <div class="text-3xl font-bold gradient-text bg-white mb-2">AR</div>
                                <div class="text-white/80 text-sm">3D Models</div>
                            </div>
                            <div class="glass-card p-6 rounded-xl">
                                <div class="text-3xl font-bold gradient-text bg-white mb-2">360°</div>
                                <div class="text-white/80 text-sm">Tours</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Floating elements decoration -->
                <div class="absolute top-20 left-10 w-20 h-20 bg-purple-300/30 rounded-full blur-xl animate-pulse"></div>
                <div class="absolute bottom-20 right-10 w-32 h-32 bg-pink-300/30 rounded-full blur-xl animate-pulse delay-1000"></div>
            </div>
        `;
    }
}
HERO

log_success "✓ Enhanced UI components created"

# Update main app.js to use new components
log_info "Integrating enhanced UI..."

cat > /tmp/integrate-ui.js << 'JSEOF'
const fs = require('fs');
const appPath = process.argv[2];
let app = fs.readFileSync(appPath, 'utf8');

// Add imports for new components
if (!app.includes('EnhancedNavbar')) {
    const importSection = `
import { EnhancedNavbar } from './components/ui/navbar.js';
import { StandCard } from './components/ui/stand-card.js';
import { HeroSection } from './components/ui/hero.js';
`;
    app = importSection + app;
}

// Initialize enhanced navbar
if (!app.includes('new EnhancedNavbar')) {
    app = app.replace(
        'class App {',
        `class App {
    constructor() {
        new EnhancedNavbar();
        this.init();
    }
    
    init() {`
    );
}

fs.writeFileSync(appPath, app, 'utf8');
console.log('✅ UI components integrated');
JSEOF

node /tmp/integrate-ui.js "${FRONTEND_DIR}/src/app.js" || log_warning "Manual integration needed"

# Deploy updated frontend
log_info "Deploying enhanced UI..."
aws s3 sync ${FRONTEND_DIR}/ s3://${S3_BUCKET_NAME}/ \
    --exclude ".git/*" --exclude "*.backup" --quiet

log_success "✓ Enhanced UI deployed"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ DAY 8 COMPLETE: UI/UX PROFESSIONAL!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎨 Enhancements Added:"
echo "   ✓ Tailwind CSS framework"
echo "   ✓ Glass morphism design"
echo "   ✓ Gradient backgrounds"
echo "   ✓ Modern card components"
echo "   ✓ Hero section with stats"
echo "   ✓ Animated elements"
echo "   ✓ Responsive navbar"
echo "   ✓ Badge system (Featured/AR/360°)"
echo ""
echo "🌐 View Changes:"
echo "   http://${S3_BUCKET_NAME}.s3-website-${AWS_REGION}.amazonaws.com"
echo ""
echo "💾 Backup: ${BACKUP_PATH}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
