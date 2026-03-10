/**
 * POST /interactions  — Track user interactions (views, clicks, add-to-cart, etc.)
 *
 * Fixes applied:
 *  - Migrated from AWS SDK v2 (aws-sdk) to v3 (@aws-sdk/client-dynamodb)
 *  - CORS restricted to ALLOWED_ORIGIN env var (was '*')
 *  - Internal error.message no longer sent to client
 *  - Replaced uuid package dependency with built-in crypto.randomUUID()
 *  - interaction_type validated against allowed whitelist
 */

const { DynamoDBClient }          = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { corsHeaders, preflight }  = require('../common/cors');
const { randomUUID }              = require('crypto');

const client    = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_INTERACTIONS = process.env.TABLE_INTERACTIONS || 'ai-pavilion-analytics';

const ALLOWED_INTERACTION_TYPES = new Set([
    'view', 'click', 'add_to_cart', 'purchase',
    'like', 'share', 'download', 'contact',
]);

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return preflight(event);

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return {
            statusCode: 400,
            headers: corsHeaders(event),
            body: JSON.stringify({ success: false, error: 'Invalid JSON' }),
        };
    }

    const { user_id, stand_id, interaction_type } = body;

    if (!user_id || !stand_id || !interaction_type) {
        return {
            statusCode: 400,
            headers: corsHeaders(event),
            body: JSON.stringify({ success: false, error: 'Missing required fields: user_id, stand_id, interaction_type' }),
        };
    }

    if (!ALLOWED_INTERACTION_TYPES.has(interaction_type)) {
        return {
            statusCode: 400,
            headers: corsHeaders(event),
            body: JSON.stringify({
                success: false,
                error: `Invalid interaction_type. Allowed: ${[...ALLOWED_INTERACTION_TYPES].join(', ')}`,
            }),
        };
    }

    try {
        const interaction = {
            interaction_id:   randomUUID(),
            user_id:          String(user_id),
            stand_id:         String(stand_id),
            interaction_type,
            timestamp:        Date.now(),
            created_at:       new Date().toISOString(),
        };

        await docClient.send(new PutCommand({
            TableName: TABLE_INTERACTIONS,
            Item: interaction,
        }));

        return {
            statusCode: 200,
            headers: corsHeaders(event),
            body: JSON.stringify({ success: true, interaction_id: interaction.interaction_id }),
        };
    } catch (error) {
        console.error('Error tracking interaction:', error);
        return {
            statusCode: 500,
            headers: corsHeaders(event),
            body: JSON.stringify({ success: false, error: 'Failed to record interaction' }),
        };
    }
};
