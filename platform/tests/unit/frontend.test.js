/**
 * Unit tests — Frontend modules
 *
 * These modules are pure JS with no DOM or Vite build step required,
 * so they run in Jest directly.
 *
 * cart.js is the only module that touches browser APIs (localStorage,
 * CustomEvent) — those are shimmed below.
 */

'use strict';

// ─── Browser shims ────────────────────────────────────────────────────────────

// localStorage shim (jest uses jsdom but let's be explicit)
const _store = {};
global.localStorage = {
    getItem:    (k)    => _store[k] ?? null,
    setItem:    (k, v) => { _store[k] = String(v); },
    removeItem: (k)    => { delete _store[k]; },
    clear:      ()     => { Object.keys(_store).forEach(k => delete _store[k]); },
};

// CustomEvent shim
global.CustomEvent = class CustomEvent {
    constructor(name, opts = {}) {
        this.type   = name;
        this.detail = opts.detail ?? null;
    }
};
global.window = {
    dispatchEvent:    jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    location: { hash: '' },
};

// __APP_CONFIG__ shim (Vite defines this at build time)
global.__APP_CONFIG__ = {};

// ─── helpers.js ───────────────────────────────────────────────────────────────

const {
    escapeHtml,
    formatPrice,
    formatDate,
    retry,
    getFromStorage,
    saveToStorage,
    removeFromStorage,
    isEmpty,
} = require('../../frontend/src/core/helpers.js');

describe('helpers — escapeHtml', () => {
    test('escapes all five dangerous characters', () => {
        expect(escapeHtml('<script>alert("x\'s")</script>'))
            .toBe('&lt;script&gt;alert(&quot;x&#039;s&quot;)&lt;/script&gt;');
    });
    test('returns empty string for falsy input', () => {
        expect(escapeHtml('')).toBe('');
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });
    test('coerces numbers to string', () => {
        expect(escapeHtml(42)).toBe('42');
    });
});

describe('helpers — formatDate', () => {
    test('formats YYYY-MM-DD correctly', () => {
        expect(formatDate('2024-06-15T10:00:00Z', 'YYYY-MM-DD')).toMatch(/2024-06-\d{2}/);
    });
    test('uses default format when none given', () => {
        const result = formatDate('2024-01-01T00:00:00Z');
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe('helpers — retry', () => {
    test('returns value on first success', async () => {
        const fn = jest.fn().mockResolvedValue('ok');
        await expect(retry(fn, 3, 0)).resolves.toBe('ok');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('retries on failure and succeeds on third attempt', async () => {
        const fn = jest.fn()
            .mockRejectedValueOnce(new Error('fail 1'))
            .mockRejectedValueOnce(new Error('fail 2'))
            .mockResolvedValueOnce('success');
        await expect(retry(fn, 3, 0)).resolves.toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    test('throws after exhausting all attempts', async () => {
        const err = new Error('always fails');
        const fn  = jest.fn().mockRejectedValue(err);
        await expect(retry(fn, 2, 0)).rejects.toThrow('always fails');
        expect(fn).toHaveBeenCalledTimes(2);
    });
});

describe('helpers — localStorage wrappers', () => {
    beforeEach(() => localStorage.clear());

    test('saveToStorage and getFromStorage roundtrip', () => {
        saveToStorage('test_key', { a: 1, b: [2, 3] });
        expect(getFromStorage('test_key')).toEqual({ a: 1, b: [2, 3] });
    });

    test('getFromStorage returns defaultValue for missing key', () => {
        expect(getFromStorage('does_not_exist', 'default')).toBe('default');
    });

    test('removeFromStorage deletes the key', () => {
        saveToStorage('del_me', 'value');
        removeFromStorage('del_me');
        expect(getFromStorage('del_me')).toBeNull();
    });
});

describe('helpers — isEmpty', () => {
    test.each([
        [null,      true],
        [undefined, true],
        ['',        true],
        [[],        true],
        [{},        true],
        ['a',       false],
        [[1],       false],
        [{ a: 1 },  false],
    ])('isEmpty(%p) === %p', (input, expected) => {
        expect(isEmpty(input)).toBe(expected);
    });
});

// ─── validators.js ────────────────────────────────────────────────────────────

const {
    validateEmail,
    validatePassword,
    validateRequired,
} = require('../../frontend/src/core/validators.js');

describe('validators — validateEmail', () => {
    test.each([
        ['user@example.com',  true],
        ['a+b@x.co',         true],
        ['',                  false],
        [null,                false],
        ['notanemail',        false],
        ['missing@tld',       false],
        ['@nodomain.com',     false],
    ])('validateEmail(%p).ok === %p', (email, ok) => {
        expect(validateEmail(email).ok).toBe(ok);
    });

    test('rejects emails over 254 characters', () => {
        const long = 'a'.repeat(250) + '@b.com';
        expect(validateEmail(long).ok).toBe(false);
    });
});

describe('validators — validatePassword', () => {
    test('accepts a valid password', () => {
        expect(validatePassword('Secret1234').ok).toBe(true);
    });

    test('rejects password shorter than minLength', () => {
        const result = validatePassword('Ab1', { minLength: 8 });
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/at least 8/);
    });

    test('rejects password with no digits when requireNumber is true', () => {
        const result = validatePassword('NoDigitsHere', { requireNumber: true });
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/number/i);
    });

    test('accepts password without digit when requireNumber is false', () => {
        expect(validatePassword('NoDigitsOk', { requireNumber: false }).ok).toBe(true);
    });

    test('rejects empty password', () => {
        expect(validatePassword('').ok).toBe(false);
    });
});

describe('validators — validateRequired', () => {
    test('passes for non-empty string', () => {
        expect(validateRequired('hello').ok).toBe(true);
    });
    test('fails for empty string', () => {
        expect(validateRequired('').ok).toBe(false);
    });
    test('fails for whitespace-only string', () => {
        expect(validateRequired('   ').ok).toBe(false);
    });
    test('fails for null', () => {
        expect(validateRequired(null).ok).toBe(false);
    });
    test('includes the field label in the error message', () => {
        const result = validateRequired('', 'Email');
        expect(result.error).toMatch(/Email/);
    });
});

// ─── templates.js ─────────────────────────────────────────────────────────────
//
// Templates are pure functions: string-in, string-out.
// We test that they return valid markup without crashing and that
// user-supplied values are escaped (no XSS in templates).

const {
    loginFormHTML,
    notFoundHTML,
    cartHTML,
    homepageHTML,
    authGateHTML,
} = require('../../frontend/src/core/templates.js');

describe('templates — loginFormHTML', () => {
    test('returns a non-empty string', () => {
        const html = loginFormHTML();
        expect(typeof html).toBe('string');
        expect(html.length).toBeGreaterThan(0);
    });
    test('contains an email and password input', () => {
        const html = loginFormHTML();
        expect(html).toMatch(/type="email"/);
        expect(html).toMatch(/type="password"/);
    });
});

describe('templates — notFoundHTML', () => {
    test('contains a 404 indicator', () => {
        expect(notFoundHTML()).toMatch(/404/);
    });
});

describe('templates — cartHTML', () => {
    test('returns a string regardless of items argument', () => {
        expect(typeof cartHTML([])).toBe('string');
        expect(typeof cartHTML([], 0)).toBe('string');
    });
});

describe('templates — homepageHTML', () => {
    test('returns a string', () => {
        expect(typeof homepageHTML([])).toBe('string');
    });

    test('renders homepage stats', () => {
        // homepageHTML takes no args — XSS coverage is via escapeHtml tests
        const html = homepageHTML();
        expect(html).toMatch(/Gaming Expos/i);
    });
});

describe('templates — authGateHTML', () => {
    test('returns a string with a login reference', () => {
        const html = authGateHTML();
        expect(typeof html).toBe('string');
        expect(html).toMatch(/sign.?in/i);
    });
});

// ─── cart.js — logic unit tests ───────────────────────────────────────────────
//
// cart.js imports CONFIG (needs __APP_CONFIG__ shim above) and helpers.
// We reset localStorage before each test to isolate state.

const { cartManager } = require('../../frontend/src/checkout/cart.js');

describe('CartManager', () => {
    let cart;

    beforeEach(() => {
        localStorage.clear();
        // Reset the singleton's in-memory state by reloading from (empty) storage
        cartManager.clearCart();
        cart = cartManager;
    });

    test('starts empty', () => {
        expect(cart.isEmpty()).toBe(true);
        expect(cart.getItemCount()).toBe(0);
    });

    test('addItem adds a product', () => {
        cart.addItem('p1', 'Widget', 9.99, 1);
        expect(cart.isEmpty()).toBe(false);
        expect(cart.getItemCount()).toBe(1);
    });

    test('addItem increments quantity for duplicate product', () => {
        cart.addItem('p1', 'Widget', 9.99, 1);
        cart.addItem('p1', 'Widget', 9.99, 2);
        const items = cart.getCart();
        expect(items).toHaveLength(1);
        expect(items[0].quantity).toBe(3);
    });

    test('getTotal sums price × quantity correctly', () => {
        cart.addItem('p1', 'A', 10.00, 2);
        cart.addItem('p2', 'B', 5.50, 1);
        expect(cart.getTotal()).toBeCloseTo(25.50, 2);
    });

    test('getTotalInCents returns integer cents', () => {
        cart.addItem('p1', 'A', 9.99, 1);
        expect(cart.getTotalInCents()).toBe(999);
    });

    test('removeItem removes the product', () => {
        cart.addItem('p1', 'Widget', 9.99, 1);
        cart.removeItem('p1');
        expect(cart.isEmpty()).toBe(true);
    });

    test('clearCart empties the cart', () => {
        cart.addItem('p1', 'A', 1, 1);
        cart.addItem('p2', 'B', 2, 3);
        cart.clearCart();
        expect(cart.isEmpty()).toBe(true);
    });

    test('throws when maxQuantityPerItem is exceeded', () => {
        cart.maxQuantityPerItem = 5;
        cart.addItem('p1', 'A', 1, 5);
        expect(() => cart.addItem('p1', 'A', 1, 1)).toThrow(/maximum quantity/i);
    });

    test('throws when maxItems is exceeded', () => {
        cart.maxItems = 2;
        cart.addItem('p1', 'A', 1, 1);
        cart.addItem('p2', 'B', 1, 1);
        expect(() => cart.addItem('p3', 'C', 1, 1)).toThrow(/cart is full/i);
    });

    test('persists cart state to localStorage', () => {
        cart.addItem('p1', 'Widget', 9.99, 2);
        // Verify data was written to storage so a new page load would restore it
        const raw = localStorage.getItem(cart.storageKey);
        const stored = JSON.parse(raw);
        expect(stored).toHaveLength(1);
        expect(stored[0].quantity).toBe(2);
        expect(stored[0].price).toBeCloseTo(9.99, 2);
    });
});

// ─── dashboard-templates.js ───────────────────────────────────────────────────

const {
    dashboardShellHTML,
    statsHTML,
    ordersHTML: dashboardOrdersHTML,
    savedStandsHTML: dashboardSavedStandsHTML,
    editProfileFormHTML,
    orderDetailsHTML: dashboardOrderDetailsHTML,
} = require('../../frontend/src/account/dashboard-templates.js');

describe('dashboard-templates — statsHTML', () => {
    test('renders zero values gracefully', () => {
        const html = statsHTML({});
        expect(html).toMatch(/0/);
    });
    test('formats totalSpent as currency string', () => {
        const html = statsHTML({ totalOrders: 3, totalSpent: 49.99, savedStands: 2 });
        expect(html).toMatch(/49/);
        expect(html).toMatch(/Total Orders/);
    });
});

describe('dashboard-templates — ordersHTML', () => {
    test('shows empty message when no orders', () => {
        expect(dashboardOrdersHTML([])).toMatch(/No orders yet/);
    });
    test('renders order card with data-action buttons', () => {
        const orders = [{ order_id: 'abc-123-xyz', status: 'paid', total: 20, created_at: '2024-01-01', items: [] }];
        const html   = dashboardOrdersHTML(orders);
        expect(html).toMatch(/abc-123/);
        expect(html).toMatch(/data-action="view-order"/);
        expect(html).toMatch(/data-id="abc-123-xyz"/);
    });
    test('shows Load More button only when 10+ orders', () => {
        const orders = Array.from({ length: 10 }, (_, i) => ({
            order_id: `o${i}`, status: 'paid', total: 1, created_at: '2024-01-01', items: [],
        }));
        expect(dashboardOrdersHTML(orders)).toMatch(/load-more-orders/);
        expect(dashboardOrdersHTML(orders.slice(0, 9))).not.toMatch(/load-more-orders/);
    });
    test('escapes XSS in order status', () => {
        const orders = [{ order_id: 'x', status: '<script>', total: 0, created_at: '2024-01-01', items: [] }];
        const html   = dashboardOrdersHTML(orders);
        expect(html).not.toMatch(/<script>/);
    });
});

describe('dashboard-templates — savedStandsHTML', () => {
    test('shows empty message when no saved stands', () => {
        expect(dashboardSavedStandsHTML([])).toMatch(/No saved stands/);
    });
    test('renders visit and remove buttons with data-action', () => {
        const stands = [{ stand_id: 's1', name: 'Test Stand', image_url: '' }];
        const html   = dashboardSavedStandsHTML(stands);
        expect(html).toMatch(/data-action="visit-stand"/);
        expect(html).toMatch(/data-action="unsave-stand"/);
        expect(html).toMatch(/data-id="s1"/);
    });
    test('escapes XSS in stand name', () => {
        const stands = [{ stand_id: 's1', name: '<img onerror=alert(1)>', image_url: '' }];
        expect(dashboardSavedStandsHTML(stands)).not.toMatch(/<img onerror/);
    });
});

describe('dashboard-templates — editProfileFormHTML', () => {
    test('pre-fills form with user attributes', () => {
        const html = editProfileFormHTML({ given_name: 'Mario', family_name: 'Rossi' });
        expect(html).toMatch(/value="Mario"/);
        expect(html).toMatch(/value="Rossi"/);
    });
    test('handles missing attributes gracefully', () => {
        expect(() => editProfileFormHTML({})).not.toThrow();
    });
});

describe('dashboard-templates — dashboardShellHTML', () => {
    test('renders without throwing', () => {
        const html = dashboardShellHTML({
            username: 'mario', stats: {}, ordersHTML: '', savedStandsHTML: '',
        });
        expect(typeof html).toBe('string');
        expect(html.length).toBeGreaterThan(0);
    });
    test('escapes XSS in username', () => {
        const html = dashboardShellHTML({
            username: '<script>alert(1)</script>', stats: {}, ordersHTML: '', savedStandsHTML: '',
        });
        expect(html).not.toMatch(/<script>/);
    });
});
