/**
 * Utility functions — only what the codebase actually calls.
 */

// ─── XSS prevention ──────────────────────────────────────────────────────────

export function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatPrice(amount, currency = 'EUR', locale = 'it-IT') {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

export function formatDate(date, format = 'YYYY-MM-DD') {
    const d = new Date(date);
    const year    = d.getFullYear();
    const month   = String(d.getMonth() + 1).padStart(2, '0');
    const day     = String(d.getDate()).padStart(2, '0');
    const hours   = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}

// ─── Async helpers ────────────────────────────────────────────────────────────

/**
 * Retry an async function up to maxAttempts times with linear back-off.
 * Used by ApiService to absorb transient 5xx / network errors.
 */
export async function retry(fn, maxAttempts = 3, delayMs = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (attempt === maxAttempts) throw err;
            await new Promise(r => setTimeout(r, delayMs * attempt));
        }
    }
}

// ─── localStorage ─────────────────────────────────────────────────────────────

export function getFromStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch {
        return defaultValue;
    }
}

export function saveToStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

export function removeFromStorage(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

// ─── Object ───────────────────────────────────────────────────────────────────

export function isEmpty(obj) {
    if (obj == null) return true;
    if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
    return Object.keys(obj).length === 0;
}
