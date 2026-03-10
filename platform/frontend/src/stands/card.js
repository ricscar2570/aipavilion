/**
 * Stand card rendering — single source of truth for all stand list views.
 *
 * Three contexts use this: homepage grid, search results, related stands panel.
 * Keeping them in sync via one function prevents the subtle divergences that
 * accumulate when the same template is copy-pasted across modules.
 */

import { escapeHtml } from '../core/helpers.js';

const FALLBACK_IMAGE = 'https://via.placeholder.com/400x300?text=Stand';

/**
 * Returns a validated image URL.
 * Rejects non-http(s) URLs (e.g. javascript:) and falls back to placeholder.
 */
function safeImage(url) {
    return /^https?:\/\//.test(url || '') ? escapeHtml(url) : FALLBACK_IMAGE;
}

/**
 * Render a stand summary card as an HTML string.
 *
 * @param {object} stand
 * @param {{ compact?: boolean }} options
 *   compact — smaller variant used in the related-stands panel
 * @returns {string} HTML string (not yet in DOM)
 */
export function renderStandCard(stand, { compact = false } = {}) {
    const name    = escapeHtml(stand.name  || 'Unnamed Stand');
    const desc    = escapeHtml(stand.description || '');
    const booth   = stand.booth_number ? `<span class="booth">📍 ${escapeHtml(String(stand.booth_number))}</span>` : '';
    const rating  = stand.rating       ? `<span class="rating">⭐ ${escapeHtml(String(stand.rating))}</span>` : '';
    const sponsor = stand.is_sponsored ? '<span class="sponsored">✨ Sponsored</span>' : '';
    const ar      = stand.ar_enabled   ? '<span class="badge-ar">🥽 AR</span>' : '';
    const img     = safeImage(stand.image_url);
    const id      = escapeHtml(stand.stand_id || '');

    if (compact) {
        return `
            <div class="related-stand-card" data-stand-id="${id}">
                <img src="${img}" alt="${name}"
                     onerror="this.src='${FALLBACK_IMAGE}'">
                <h4>${name}</h4>
                ${booth}
            </div>`;
    }

    return `
        <div class="stand-card" data-stand-id="${id}">
            <div class="stand-image">
                <img src="${img}"
                     alt="${name}"
                     onerror="this.src='${FALLBACK_IMAGE}'">
                ${ar}${sponsor}
            </div>
            <div class="stand-content">
                <h3>${name}</h3>
                <p class="stand-description">${desc}</p>
                <div class="stand-meta">${rating}${booth}</div>
            </div>
        </div>`;
}
