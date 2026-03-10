/**
 * GET /stands  — List all stands (with optional /stands/sponsored filter)
 *
 * Fixes applied:
 *  - Full DynamoDB pagination via scanAll (was silently truncating at 1MB)
 *  - CORS restricted to ALLOWED_ORIGIN env var (was '*')
 *  - Region read from environment (was hardcoded 'us-east-1')
 *  - Internal error.message no longer sent to client
 */

const { DynamoDBClient }        = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { corsHeaders, preflight } = require('../common/cors');
const { scanAll }                = require('../common/dynamo');

const client    = new DynamoDBClient({});   // region from Lambda environment
const docClient = DynamoDBDocumentClient.from(client);

const STANDS_TABLE = process.env.STANDS_TABLE || 'ai-pavilion-stands';

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return preflight(event);

    const path = event.path || event.rawPath || '';

    try {
        let items = await scanAll(docClient, { TableName: STANDS_TABLE });

        if (path.includes('/sponsored')) {
            items = items.filter(s => s.is_sponsored === true);
        }

        return {
            statusCode: 200,
            headers: corsHeaders(event),
            body: JSON.stringify({ stands: items, count: items.length }),
        };
    } catch (error) {
        console.error('Error fetching stands:', error);
        return {
            statusCode: 500,
            headers: corsHeaders(event),
            body: JSON.stringify({ message: 'Error fetching stands' }),
        };
    }
};
