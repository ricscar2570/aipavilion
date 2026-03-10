/**
 * HTML templates — pure functions that return markup strings.
 *
 * No DOM access here, no side effects. Each function takes only the data
 * it needs and returns a string. Event binding is the caller's responsibility.
 *
 * Keeping templates separate from routing logic means you can read or change
 * the markup without following execution flow through the app class.
 */

import { escapeHtml } from './helpers.js';

// ─── Shell ────────────────────────────────────────────────────────────────────

export function shellHTML() {
    return `
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
                            <a href="#/"       class="text-gray-700 hover:text-purple-600 font-medium transition">Stands</a>
                            <a href="#/search" class="text-gray-700 hover:text-purple-600 font-medium transition">Search</a>
                        </div>
                    </div>
                    <div class="flex items-center space-x-4">
                        <a href="#/cart" class="relative p-2 rounded-lg hover:bg-gray-100 transition" aria-label="Cart">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                            </svg>
                            <span id="cart-badge"
                                  class="absolute -top-1 -right-1 bg-pink-500 text-white text-xs rounded-full w-5 h-5 items-center justify-center hidden">0</span>
                        </a>
                        <button id="auth-btn" class="btn-primary">Login</button>
                    </div>
                </div>
            </div>
        </nav>
        <div id="main-content" class="pt-16 min-h-screen"></div>

        <!-- Auth modal — body is swapped per-screen by the auth methods -->
        <div id="auth-modal" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 hidden">
            <div class="glass-card w-full max-w-md mx-4 p-8 rounded-2xl relative">
                <button id="auth-modal-close" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
                <div id="auth-modal-body"></div>
            </div>
        </div>`;
}

// ─── Auth screens ─────────────────────────────────────────────────────────────

export function loginFormHTML(mode) {
    const isLogin = mode === 'login';
    return `
        <h2 class="text-2xl font-bold gradient-text mb-6">${isLogin ? 'Sign In' : 'Create Account'}</h2>
        <div id="auth-error" class="hidden mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm"></div>
        <div class="space-y-4">
            ${!isLogin ? `
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input id="auth-name" type="text" placeholder="Your name"
                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"/>
            </div>` : ''}
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input id="auth-email" type="email" placeholder="you@example.com"
                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"/>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input id="auth-password" type="password" placeholder="${isLogin ? 'Your password' : 'Min. 8 characters'}"
                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"/>
            </div>
            <button id="auth-submit" class="btn-primary w-full py-3">
                ${isLogin ? 'Sign In' : 'Create Account'}
            </button>
        </div>
        <p class="mt-4 text-center text-sm text-gray-600">
            ${isLogin
                ? `No account? <a href="#" id="auth-switch" class="text-purple-600 font-medium hover:underline">Sign up</a>`
                : `Already have an account? <a href="#" id="auth-switch" class="text-purple-600 font-medium hover:underline">Sign in</a>`}
        </p>
        ${isLogin ? `<p class="mt-2 text-center"><a href="#" id="auth-forgot" class="text-sm text-gray-500 hover:text-purple-600">Forgot password?</a></p>` : ''}`;
}

export function confirmationFormHTML(email) {
    return `
        <h2 class="text-2xl font-bold gradient-text mb-4">Check your email</h2>
        <p class="text-gray-600 mb-4">We sent a verification code to <strong>${escapeHtml(email)}</strong>.</p>
        <div class="space-y-4">
            <input id="confirm-code" type="text" placeholder="6-digit code" maxlength="6"
                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-center text-2xl tracking-widest"/>
            <div id="confirm-error" class="hidden p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm"></div>
            <button id="confirm-submit" class="btn-primary w-full py-3">Verify</button>
        </div>`;
}

export function forgotPasswordFormHTML() {
    return `
        <h2 class="text-2xl font-bold gradient-text mb-4">Reset Password</h2>
        <div class="space-y-4">
            <input id="forgot-email" type="email" placeholder="your@email.com"
                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"/>
            <div id="forgot-error" class="hidden p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm"></div>
            <button id="forgot-submit" class="btn-primary w-full py-3">Send Reset Code</button>
        </div>`;
}

export function forgotPasswordSentHTML(email) {
    return `
        <h2 class="text-2xl font-bold gradient-text mb-4">Check your email</h2>
        <p class="text-gray-600">We sent a password reset code to <strong>${escapeHtml(email)}</strong>.</p>
        <p class="mt-4 text-sm text-gray-500">Follow the instructions in the email to reset your password.</p>`;
}

// ─── Pages ────────────────────────────────────────────────────────────────────

export function homepageHTML() {
    const stats = ['500+ Products', '50+ Exhibitors', 'AR 3D', '360° Tours'];
    return `
        <div class="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
            <div class="max-w-7xl mx-auto text-center">
                <h1 class="text-5xl md:text-7xl font-extrabold text-white mb-6">
                    Welcome to the Future of
                    <span class="block gradient-text bg-white">Gaming Expos</span>
                </h1>
                <p class="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
                    Explore stands in AR, take 360° virtual tours, and shop the latest games.
                </p>
                <div class="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                    <a href="#/search" class="btn-primary text-lg px-8 py-4">🚀 Explore Stands</a>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto mb-16">
                    ${stats.map(t => `
                        <div class="glass-card p-6 rounded-xl hover-lift">
                            <div class="text-xl font-bold gradient-text bg-white">${escapeHtml(t)}</div>
                        </div>`).join('')}
                </div>
            </div>
        </div>
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
            <h2 class="text-3xl font-bold text-white mb-8">Featured Stands</h2>
            <div id="stands-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${[1, 2, 3].map(() => '<div class="loading-skeleton h-64 rounded-2xl"></div>').join('')}
            </div>
        </div>`;
}

export function cartHTML(cart, total) {
    if (!cart.length) {
        return `
            <div class="max-w-2xl mx-auto px-4 py-16 text-center">
                <h1 class="text-4xl font-bold text-white mb-4">Your Cart</h1>
                <p class="text-white/70 mb-8">Your cart is empty.</p>
                <a href="#/" class="btn-primary px-8 py-3">Browse Stands</a>
            </div>`;
    }

    const rows = cart.map(item => `
        <div class="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
            <div>
                <p class="font-semibold text-gray-900">${escapeHtml(item.productName || item.name || 'Product')}</p>
                <p class="text-sm text-gray-500">Qty: ${escapeHtml(String(item.quantity))}</p>
            </div>
            <div class="flex items-center gap-4">
                <p class="font-bold text-gray-900">€${((item.price || 0) * item.quantity).toFixed(2)}</p>
                <button class="text-red-400 hover:text-red-600 transition text-sm"
                        data-remove-id="${escapeHtml(item.productId)}">Remove</button>
            </div>
        </div>`).join('');

    return `
        <div class="max-w-3xl mx-auto px-4 py-8">
            <h1 class="text-4xl font-bold text-white mb-8">Your Cart</h1>
            <div class="glass-card rounded-2xl p-6 mb-6">
                ${rows}
                <div class="flex justify-between items-center pt-4 font-bold text-lg">
                    <span>Total</span><span>€${total.toFixed(2)}</span>
                </div>
            </div>
            <div class="flex gap-4">
                <a href="#/" class="flex-1 text-center py-3 rounded-xl border border-white/30 text-white hover:bg-white/10 transition">Continue Shopping</a>
                <a href="#/checkout" class="flex-1 btn-primary text-center py-3">Proceed to Checkout</a>
            </div>
        </div>`;
}

export function checkoutHTML(summary) {
    const rows = summary.items.map(item => `
        <div class="flex justify-between py-2 text-sm text-gray-700">
            <span>${escapeHtml(item.productName || item.name || 'Product')} × ${item.quantity}</span>
            <span>€${((item.price || 0) * item.quantity).toFixed(2)}</span>
        </div>`).join('');

    return `
        <div class="max-w-2xl mx-auto px-4 py-8">
            <h1 class="text-4xl font-bold text-white mb-8">Checkout</h1>
            <div class="glass-card rounded-2xl p-6 mb-6">
                <h2 class="text-lg font-bold text-gray-900 mb-4">Order Summary</h2>
                ${rows}
                <div class="border-t border-gray-100 mt-3 pt-3 flex justify-between font-bold">
                    <span>Total</span><span>€${summary.total.toFixed(2)}</span>
                </div>
            </div>
            <div class="glass-card rounded-2xl p-6">
                <h2 class="text-lg font-bold text-gray-900 mb-4">Payment</h2>
                <div id="card-element" class="p-3 border border-gray-200 rounded-lg mb-4"></div>
                <div id="payment-error" class="hidden mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm"></div>
                <button id="pay-btn" class="btn-primary w-full py-3">
                    Pay €${summary.total.toFixed(2)}
                </button>
            </div>
        </div>`;
}

export function authGateHTML(btnId, message = 'Please sign in to continue.') {
    return `
        <div class="max-w-md mx-auto px-4 py-16 text-center">
            <h1 class="text-3xl font-bold text-white mb-4">Sign In Required</h1>
            <p class="text-white/70 mb-8">${escapeHtml(message)}</p>
            <button class="btn-primary px-8 py-3" id="${escapeHtml(btnId)}">Sign In</button>
        </div>`;
}

export function notFoundHTML() {
    return `
        <div class="max-w-md mx-auto px-4 py-24 text-center">
            <h1 class="text-6xl font-bold text-white mb-4">404</h1>
            <p class="text-white/70 mb-8">Page not found.</p>
            <a href="#/" class="btn-primary px-8 py-3">Go Home</a>
        </div>`;
}

export function userMenuHTML() {
    return `
        <a href="#/dashboard" class="block px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-purple-600 transition">My Dashboard</a>
        <hr class="my-1 border-gray-100"/>
        <button id="user-menu-logout" class="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 transition">Sign Out</button>`;
}
