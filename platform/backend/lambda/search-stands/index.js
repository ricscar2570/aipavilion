/**
 * GET /stands/search?q=<query>  — Full-text search across stands
 *
 * Fixes applied:
 *  - Full DynamoDB pagination via scanAll (was silently truncating at 1MB)
 *  - CORS restricted to ALLOWED_ORIGIN env var (was '*')
 *  - Region read from environment (was hardcoded 'us-east-1')
 *  - Internal error.message no longer sent to client
 *  - Query string sanitised before use in filter
 */

const { DynamoDBClient }         = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient }  = require('@aws-sdk/lib-dynamodb');
const { corsHeaders, preflight }  = require('../common/cors');
const { scanAll }                 = require('../common/dynamo');

const client    = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const STANDS_TABLE = process.env.STANDS_TABLE || 'ai-pavilion-stands';
const MAX_QUERY_LENGTH = 200;

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return preflight(event);

    const rawQuery = (event.queryStringParameters?.q || '').trim();

    if (!rawQuery) {
        return {
            statusCode: 400,
            headers: corsHeaders(event),
            body: JSON.stringify({ message: 'Missing search query parameter: q' }),
        };
    }

    // Limit query length to avoid pathological regex/filter performance
    const query = rawQuery.slice(0, MAX_QUERY_LENGTH).toLowerCase();

    try {
        // Scan all pages — search filters are applied in-memory after full scan
        const allItems = await scanAll(docClient, { TableName: STANDS_TABLE });

        const filtered = allItems.filter(item => {
            const tags = Array.isArray(item.tags) ? item.tags.join(' ') : '';
            const searchText = [
                item.name        || '',
                item.category    || '',
                item.description || '',
                tags,
            ].join(' ').toLowerCase();
            return searchText.includes(query);
        });

        return {
            statusCode: 200,
            headers: corsHeaders(event),
            body: JSON.stringify({ stands: filtered, count: filtered.length, query: rawQuery }),
        };
    } catch (error) {
        console.error('Error searching stands:', error);
        return {
            statusCode: 500,
            headers: corsHeaders(event),
            body: JSON.stringify({ message: 'Error searching stands' }),
        };
    }
};
