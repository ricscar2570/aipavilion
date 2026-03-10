/**
 * Shared CORS utility for AI Pavilion Lambda functions.
 *
 * Usage:
 *   const { corsHeaders, respond, preflight } = require('../common/cors');
 *
 *   if (event.httpMethod === 'OPTIONS') return preflight(event);
 *   return respond(200, { data }, event);
 */

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://localhost:3000';

/**
 * Returns CORS headers, reflecting the request origin only if it matches
 * the configured ALLOWED_ORIGIN environment variable.
 */
function corsHeaders(event = {}) {
    const headers = event.headers || {};
    const requestOrigin = headers['origin'] || headers['Origin'] || '';
    const allowedOrigin = requestOrigin === ALLOWED_ORIGIN ? requestOrigin : ALLOWED_ORIGIN;

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Content-Type': 'application/json',
    };
}

/** Standard JSON response with proper CORS headers. */
function respond(statusCode, body, event = {}) {
    return {
        statusCode,
        headers: corsHeaders(event),
        body: JSON.stringify(body),
    };
}

/** Preflight OPTIONS response. */
function preflight(event = {}) {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
}

module.exports = { corsHeaders, respond, preflight, ALLOWED_ORIGIN };
