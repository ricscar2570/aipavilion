/**
 * GET /stands/{id}  — Single stand detail
 *
 * Fixes applied:
 *  - CORS restricted to ALLOWED_ORIGIN env var (was '*')
 *  - Region read from environment (was hardcoded 'us-east-1')
 *  - Internal error.message no longer sent to client
 *  - Table name from env var (was hardcoded)
 */

const { DynamoDBClient }         = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { corsHeaders, preflight } = require('../common/cors');

const client    = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const STANDS_TABLE = process.env.STANDS_TABLE || 'ai-pavilion-stands';

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return preflight(event);

    const standId = event.pathParameters?.id;

    if (!standId) {
        return {
            statusCode: 400,
            headers: corsHeaders(event),
            body: JSON.stringify({ message: 'Missing stand ID' }),
        };
    }

    try {
        const result = await docClient.send(new GetCommand({
            TableName: STANDS_TABLE,
            Key: { stand_id: standId },
        }));

        if (!result.Item) {
            return {
                statusCode: 404,
                headers: corsHeaders(event),
                body: JSON.stringify({ message: 'Stand not found' }),
            };
        }

        return {
            statusCode: 200,
            headers: corsHeaders(event),
            body: JSON.stringify(result.Item),
        };
    } catch (error) {
        console.error('Error fetching stand detail:', error);
        return {
            statusCode: 500,
            headers: corsHeaders(event),
            body: JSON.stringify({ message: 'Error fetching stand' }),
        };
    }
};
