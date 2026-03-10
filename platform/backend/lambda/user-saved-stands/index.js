/**
 * User Saved Stands Lambda
 *
 * GET    /user/saved-stands           — list saved stands for the authed user
 * POST   /user/saved-stands           — save a stand  { standId, name, imageUrl }
 * DELETE /user/saved-stands/:standId  — remove a saved stand
 *
 * Table schema (SAVED_STANDS_TABLE):
 *   PK: user_id  (HASH)
 *   SK: stand_id (RANGE)
 *   Other attrs: name, image_url, saved_at
 *
 * Environment variables:
 *   SAVED_STANDS_TABLE  — DynamoDB table name
 *   ALLOWED_ORIGIN      — CORS allowed origin
 */

'use strict';

const { DynamoDBClient, QueryCommand, PutItemCommand, DeleteItemCommand } =
    require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const { corsHeaders, respond, preflight } = require('../common/cors');

const dynamo     = new DynamoDBClient({});
const TABLE_NAME = process.env.SAVED_STANDS_TABLE || 'ai-pavilion-saved-stands';

// ─── Auth helper ─────────────────────────────────────────────────────────────

/**
 * Extract the Cognito sub (userId) from the API Gateway authorizer context.
 * Returns null if the request is unauthenticated.
 */
function getUserId(event) {
    return event.requestContext?.authorizer?.claims?.sub || null;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function listSavedStands(userId, event) {
    const result = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'user_id = :uid',
        ExpressionAttributeValues: marshall({ ':uid': userId }),
        // Sort newest saves first
        ScanIndexForward: false,
    }));

    const stands = (result.Items || []).map(item => unmarshall(item));
    return respond(200, { stands, count: stands.length }, event);
}

async function saveStand(userId, body, event) {
    let parsed;
    try {
        parsed = typeof body === 'string' ? JSON.parse(body) : body;
    } catch {
        return respond(400, { error: 'VALIDATION_ERROR', message: 'Invalid JSON body' }, event);
    }

    const { standId, name, imageUrl } = parsed || {};

    if (!standId || typeof standId !== 'string') {
        return respond(400, { error: 'VALIDATION_ERROR', message: 'standId is required' }, event);
    }

    const item = {
        user_id:   userId,
        stand_id:  standId,
        name:      name      || '',
        image_url: imageUrl  || '',
        saved_at:  new Date().toISOString(),
    };

    await dynamo.send(new PutItemCommand({
        TableName:           TABLE_NAME,
        Item:                marshall(item),
        // Idempotent: saving the same stand twice just updates the timestamp
        ConditionExpression: 'attribute_not_exists(stand_id) OR attribute_exists(stand_id)',
    }));

    return respond(201, { saved: true, standId }, event);
}

async function deleteSavedStand(userId, standId, event) {
    if (!standId) {
        return respond(400, { error: 'VALIDATION_ERROR', message: 'standId is required' }, event);
    }

    await dynamo.send(new DeleteItemCommand({
        TableName: TABLE_NAME,
        Key: marshall({ user_id: userId, stand_id: standId }),
    }));

    // DynamoDB DeleteItem is idempotent — no error if the item didn't exist
    return respond(200, { deleted: true, standId }, event);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return preflight(event);

    const userId = getUserId(event);
    if (!userId) {
        return respond(401, { error: 'UNAUTHORIZED', message: 'Authentication required' }, event);
    }

    const method  = event.httpMethod;
    const path    = event.path || '';

    // DELETE /user/saved-stands/:standId
    const deleteMatch = path.match(/\/user\/saved-stands\/([^/]+)$/);
    if (deleteMatch && method === 'DELETE') {
        return deleteSavedStand(userId, decodeURIComponent(deleteMatch[1]), event);
    }

    // GET /user/saved-stands
    if (path === '/user/saved-stands' && method === 'GET') {
        return listSavedStands(userId, event);
    }

    // POST /user/saved-stands
    if (path === '/user/saved-stands' && method === 'POST') {
        return saveStand(userId, event.body, event);
    }

    return respond(404, { error: 'NOT_FOUND' }, event);
};
