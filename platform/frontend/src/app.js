/**
 * AI Pavilion - Application entry point
 *
 * Responsibilities: routing, session management, event binding.
 * No HTML lives here — all markup is in core/templates.js.
 *
 * Routes:
 *   #/               → Homepage with stand grid
 *   #/stand/:id      → Stand detail
 *   #/search         → Search
 *   #/cart           → Cart
 *   #/checkout       → Checkout (requires auth)
 *   #/dashboard      → User dashboard (requires auth)
 *   #/login          → Virtual route: opens login modal from any page
 */

import { config }                          from './core/config.js';
import { escapeHtml }                      from './core/helpers.js';
import { EVENT_TYPES }                     from './core/constants.js';
import { validateEmail, validatePassword } from './core/validators.js';
import {
    shellHTML,
    loginFormHTML,
    confirmationFormHTML,
    forgotPasswordFormHTML,
    forgotPasswordSentHTML,
    homepageHTML,
    cartHTML,
    checkoutHTML,
    authGateHTML,
    notFoundHTML,
    userMenuHTML,
} from './core/templates.js';

import { authService }        from './account/auth.js';
import { apiService }         from './core/api.js';
import { cartManager }        from './checkout/cart.js';
import { checkoutManager }    from './checkout/checkout.js';
import { standDetailManager } from './stands/detail.js';
import { userDashboard }      from './account/dashboard.js';
import { uiManager }          from './ui/ui.js';
import { renderStandCard }    from './stands/card.js';
import SearchModule           from './stands/search.js';

const searchModule = new SearchModule();

class AIPavilion {
    constructor() {
        this._currentUser = null;
        this.init();
    }

    async init() {
        document.getElementById('app').innerHTML = shellHTML();
        // init() creates toast/modal containers in the DOM.
        // Must run after shellHTML() so document.body is ready,
        // and before any module that might fire a toast on load.
        uiManager.init();
        this._bindAuthEvents();
        this._bindCartEvents();
        this._setupRouting();
        await this._restoreSession();
    }

    // ─── Auth ────────────────────────────────────────────────────────────────

    async _restoreSession() {
        this._currentUser = await authService.getCurrentUser();
        this._updateAuthUI();
        this._handleRoute();
    }

    _bindAuthEvents() {
        document.addEventListener('click', e => {
            const btn = e.target.closest('#auth-btn');
            if (!btn) return;
            if (this._currentUser) {
                this._showUserMenu(btn);
            } else {
                this._showLoginModal();
            }
        });

        document.getElementById('auth-modal').addEventListener('click', e => {
            if (e.target === e.currentTarget) this._hideAuthModal();
        });
        document.getElementById('auth-modal-close').addEventListener('click', () => this._hideAuthModal());

        authService.subscribe((event) => {
            if (event === EVENT_TYPES.USER_LOGGED_IN) {
                authService.getCurrentUser().then(user => {
                    this._currentUser = user;
                    this._updateAuthUI();
                    this._hideAuthModal();
                });
            }
            if (event === EVENT_TYPES.USER_LOGGED_OUT) {
                this._currentUser = null;
                this._updateAuthUI();
                window.location.hash = '/';
            }
        });
    }

    _updateAuthUI() {
        const btn = document.getElementById('auth-btn');
        if (!btn) return;
        if (this._currentUser) {
            const email = this._currentUser.attributes?.email || this._currentUser.username || 'Account';
            btn.textContent = escapeHtml(email.split('@')[0]);
        } else {
            btn.textContent = 'Login';
        }
    }

    _showLoginModal(mode = 'login') {
        document.getElementById('auth-modal-body').innerHTML = loginFormHTML(mode);
        document.getElementById('auth-modal').classList.remove('hidden');
        this._bindLoginForm();
    }

    _hideAuthModal() {
        document.getElementById('auth-modal').classList.add('hidden');
    }

    _bindLoginForm() {
        document.getElementById('auth-switch')?.addEventListener('click', e => {
            e.preventDefault();
            const isLogin = document.getElementById('auth-submit').textContent.trim() === 'Sign In';
            this._showLoginModal(isLogin ? 'signup' : 'login');
        });
        document.getElementById('auth-forgot')?.addEventListener('click', e => {
            e.preventDefault();
            this._showForgotPasswordModal();
        });
        document.getElementById('auth-submit')?.addEventListener('click', () => this._submitAuthForm());
        document.getElementById('auth-modal-body').addEventListener('keydown', e => {
            if (e.key === 'Enter') this._submitAuthForm();
        });
    }

    async _submitAuthForm() {
        const submit   = document.getElementById('auth-submit');
        const errorEl  = document.getElementById('auth-error');
        const email    = document.getElementById('auth-email')?.value.trim() || '';
        const password = document.getElementById('auth-password')?.value || '';
        const name     = document.getElementById('auth-name')?.value.trim() || '';
        const isLogin  = submit.textContent.trim() === 'Sign In';

        const showError = msg => {
            errorEl.textContent = msg;
            errorEl.classList.remove('hidden');
        };

        // Validate before hitting Cognito to avoid burning rate-limit quota on bad input.
        const emailCheck = validateEmail(email);
        if (!emailCheck.ok) { showError(emailCheck.error); return; }

        if (!isLogin) {
            const pwCheck = validatePassword(password);
            if (!pwCheck.ok) { showError(pwCheck.error); return; }
        }

        errorEl.classList.add('hidden');
        submit.disabled = true;
        submit.textContent = isLogin ? 'Signing in…' : 'Creating account…';

        try {
            if (isLogin) {
                await authService.signIn(email, password);
            } else {
                const [givenName, ...rest] = name.split(' ');
                await authService.signUp(email, password, {
                    givenName,
                    familyName: rest.join(' ') || undefined,
                });
                this._showConfirmationModal(email);
            }
        } catch (err) {
            showError(this._friendlyAuthError(err));
            submit.disabled = false;
            submit.textContent = isLogin ? 'Sign In' : 'Create Account';
        }
    }

    _showConfirmationModal(email) {
        document.getElementById('auth-modal-body').innerHTML = confirmationFormHTML(email);
        document.getElementById('confirm-submit').addEventListener('click', async () => {
            const code    = document.getElementById('confirm-code').value.trim();
            const errorEl = document.getElementById('confirm-error');
            try {
                await authService.confirmSignUp(email, code);
                this._showLoginModal('login');
            } catch (err) {
                errorEl.textContent = this._friendlyAuthError(err);
                errorEl.classList.remove('hidden');
            }
        });
    }

    _showForgotPasswordModal() {
        document.getElementById('auth-modal-body').innerHTML = forgotPasswordFormHTML();
        document.getElementById('forgot-submit').addEventListener('click', async () => {
            const email   = document.getElementById('forgot-email').value.trim();
            const errorEl = document.getElementById('forgot-error');
            try {
                await authService.forgotPassword(email);
                document.getElementById('auth-modal-body').innerHTML = forgotPasswordSentHTML(email);
            } catch (err) {
                errorEl.textContent = this._friendlyAuthError(err);
                errorEl.classList.remove('hidden');
            }
        });
    }

    _showUserMenu(anchorEl) {
        const existing = document.getElementById('user-menu');
        if (existing) { existing.remove(); return; }

        const menu = document.createElement('div');
        menu.id = 'user-menu';
        menu.className = 'absolute right-4 top-14 glass-card rounded-xl shadow-lg py-2 z-50 min-w-[180px]';
        menu.innerHTML = userMenuHTML();
        document.body.appendChild(menu);

        document.getElementById('user-menu-logout').addEventListener('click', () => {
            menu.remove();
            authService.signOut();
        });

        // Delay the outside-click listener by one tick so the current click
        // (which opened the menu) doesn't immediately close it.
        setTimeout(() => {
            document.addEventListener('click', function handler(e) {
                if (!menu.contains(e.target) && e.target !== anchorEl) {
                    menu.remove();
                    document.removeEventListener('click', handler);
                }
            });
        }, 0);
    }

    _friendlyAuthError(err) {
        const map = {
            NotAuthorizedException:   'Incorrect email or password.',
            UserNotFoundException:     'Incorrect email or password.',
            UserNotConfirmedException: 'Please verify your email before logging in.',
            UsernameExistsException:   'An account with this email already exists.',
            InvalidPasswordException:  'Password must be at least 8 characters and include numbers.',
            CodeMismatchException:     'Invalid verification code.',
            ExpiredCodeException:      'Verification code expired. Please request a new one.',
            LimitExceededException:    'Too many attempts. Please wait a moment and try again.',
            TooManyRequestsException:  'Too many attempts. Please wait a moment and try again.',
        };
        return map[err.code || err.name || ''] || err.message || 'An error occurred. Please try again.';
    }

    // ─── Cart badge ──────────────────────────────────────────────────────────

    _bindCartEvents() {
        this._updateCartBadge();
        cartManager.subscribe?.(() => this._updateCartBadge());
        document.addEventListener('cart:updated', () => this._updateCartBadge());
    }

    _updateCartBadge() {
        const badge = document.getElementById('cart-badge');
        if (!badge) return;
        const count = cartManager.getItemCount?.() || cartManager.getCart().length;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('hidden');
            badge.classList.add('flex');
        } else {
            badge.classList.add('hidden');
            badge.classList.remove('flex');
        }
    }

    // ─── Routing ─────────────────────────────────────────────────────────────

    _setupRouting() {
        // Hash routing avoids a server-side catch-all — S3 static hosting
        // only knows about index.html, so pushState would 404 on refresh.
        window.addEventListener('hashchange', () => this._handleRoute());
    }

    _handleRoute() {
        const hash    = window.location.hash.slice(1) || '/';
        const content = document.getElementById('main-content');

        if (hash === '/')                   return this._renderHomepage(content);
        if (hash === '/search')             return this._renderSearch(content);
        if (hash === '/cart')               return this._renderCart(content);
        if (hash === '/checkout')           return this._renderCheckout(content);
        if (hash === '/dashboard')          return this._renderDashboard(content);
        if (hash === '/login')              return this._handleLoginRoute();
        if (hash.startsWith('/stand/')) {
            const standId = decodeURIComponent(hash.split('/')[2] || '');
            return this._renderStandDetail(content, standId);
        }
        content.innerHTML = notFoundHTML();
    }

    // ─── Page renderers ───────────────────────────────────────────────────────

    _renderHomepage(content) {
        content.innerHTML = homepageHTML();
        this._loadStands();
    }

    async _loadStands() {
        if (!config.apiUrl) return;
        try {
            const data   = await apiService.get('/stands');
            const stands = Array.isArray(data) ? data : (data.stands || []);
            this._renderStandCards(stands);
        } catch {
            const grid = document.getElementById('stands-grid');
            if (grid) grid.innerHTML = '<p class="text-white/70 col-span-3 text-center py-12">Unable to load stands. Please try again later.</p>';
        }
    }

    _renderStandCards(stands) {
        const grid = document.getElementById('stands-grid');
        if (!grid) return;

        if (!stands.length) {
            grid.innerHTML = '<p class="text-white/70 col-span-3 text-center py-12">No stands available yet.</p>';
            return;
        }

        grid.innerHTML = '';
        stands.forEach(stand => {
            const wrapper = document.createElement('div');
            wrapper.className = 'glass-card rounded-2xl overflow-hidden hover-lift cursor-pointer';
            wrapper.innerHTML = renderStandCard(stand);
            wrapper.addEventListener('click', () => {
                window.location.hash = `/stand/${encodeURIComponent(stand.stand_id)}`;
            });
            grid.appendChild(wrapper);
        });
    }

    _renderSearch(content) {
        content.innerHTML = '<div id="search-root" class="max-w-7xl mx-auto px-4 py-8"></div>';
        searchModule.renderSearchPage(document.getElementById('search-root'));
    }

    _renderCart(content) {
        const cart  = cartManager.getCart();
        const total = cartManager.getTotal?.() || 0;
        content.innerHTML = cartHTML(cart, total);

        // Wire remove buttons — data-remove-id avoids inline onclick and window globals
        content.querySelectorAll('[data-remove-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                cartManager.removeItem(btn.dataset.removeId);
                this._renderCart(content);
            });
        });
    }

    _renderCheckout(content) {
        if (!this._currentUser) {
            content.innerHTML = authGateHTML('checkout-login-btn', 'Please sign in to complete your purchase.');
            document.getElementById('checkout-login-btn').addEventListener('click', () => this._showLoginModal());
            return;
        }
        content.innerHTML = checkoutHTML(checkoutManager.getCheckoutSummary());
        this._initCheckoutForm();
    }

    async _initCheckoutForm() {
        try {
            const { stripeService } = await import('./checkout/stripe.js');
            const { cardElement }   = stripeService.createCardElement('#card-element');

            document.getElementById('pay-btn').addEventListener('click', async () => {
                const btn     = document.getElementById('pay-btn');
                const errorEl = document.getElementById('payment-error');
                errorEl.classList.add('hidden');
                btn.disabled    = true;
                btn.textContent = 'Processing…';

                try {
                    const { orderId } = await checkoutManager.processCheckout(cardElement);
                    window.location.hash = `/order-success/${encodeURIComponent(orderId)}`;
                } catch (err) {
                    errorEl.textContent = err.message || 'Payment failed. Please try again.';
                    errorEl.classList.remove('hidden');
                    btn.disabled    = false;
                    btn.textContent = `Pay €${checkoutManager.getCheckoutSummary().total.toFixed(2)}`;
                }
            });
        } catch (err) {
            document.getElementById('card-element').innerHTML =
                `<p class="text-red-600 text-sm">Payment form unavailable: ${escapeHtml(err.message)}</p>`;
        }
    }

    async _renderDashboard(content) {
        if (!this._currentUser) {
            content.innerHTML = authGateHTML('dash-login-btn');
            document.getElementById('dash-login-btn').addEventListener('click', () => this._showLoginModal());
            return;
        }
        content.innerHTML = '<div id="dashboardContainer" class="max-w-7xl mx-auto px-4 py-8"></div>';
        await userDashboard.loadDashboard('dashboardContainer');
    }

    _renderStandDetail(content, standId) {
        if (!standId) { content.innerHTML = notFoundHTML(); return; }
        content.innerHTML = '<div id="standDetailContainer" class="max-w-7xl mx-auto px-4 py-8"></div>';
        standDetailManager.loadStandDetails(standId, 'standDetailContainer');
    }

    _handleLoginRoute() {
        // #/login is a virtual route — redirect home and open the modal.
        window.location.hash = '/';
        setTimeout(() => this._showLoginModal(), 50);
    }
}

new AIPavilion();
