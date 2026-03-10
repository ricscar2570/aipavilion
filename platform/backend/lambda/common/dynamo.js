/**
 * DynamoDB pagination helper.
 *
 * DynamoDB ScanCommand returns at most 1MB per call. It does not error when truncating —
 * it just sets LastEvaluatedKey. Without this loop, any table over ~4k items would
 * return partial results with no warning to the caller. This helper loops until LastEvaluatedKey is absent,
 * collecting all pages into a single array.
 *
 * Usage:
 *   const { scanAll, scanPage } = require('../common/dynamo');
 *
 *   // Fetch ALL items (use carefully on large tables — add FilterExpression to limit)
 *   const items = await scanAll(docClient, { TableName: 'my-table', FilterExpression: '...' });
 *
 *   // Fetch ONE page (for paginated API responses)
 *   const { items, nextKey } = await scanPage(docClient, params, exclusiveStartKey);
 */

const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

/**
 * Scan all pages of a DynamoDB table.
 * @param {DynamoDBDocumentClient} client
 * @param {object} baseParams  - ScanCommand params WITHOUT ExclusiveStartKey
 * @returns {Promise<Array>}
 */
async function scanAll(client, baseParams) {
    const items = [];
    let lastKey;

    do {
        const params = lastKey
            ? { ...baseParams, ExclusiveStartKey: lastKey }
            : { ...baseParams };

        const result = await client.send(new ScanCommand(params));
        items.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return items;
}

/**
 * Scan a single page of a DynamoDB table (for cursor-based API pagination).
 * @param {DynamoDBDocumentClient} client
 * @param {object} baseParams
 * @param {object|undefined} exclusiveStartKey  - Cursor from previous page
 * @returns {Promise<{ items: Array, nextKey: object|undefined }>}
 */
async function scanPage(client, baseParams, exclusiveStartKey) {
    const params = exclusiveStartKey
        ? { ...baseParams, ExclusiveStartKey: exclusiveStartKey }
        : { ...baseParams };

    const result = await client.send(new ScanCommand(params));
    return {
        items:   result.Items || [],
        nextKey: result.LastEvaluatedKey,
    };
}

module.exports = { scanAll, scanPage };
