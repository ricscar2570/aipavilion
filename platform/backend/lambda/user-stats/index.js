/**
 * User Stats Lambda
 *
 * GET /user/stats — returns aggregated stats for the authenticated user.
 *
 * Stats are computed on-the-fly from the Orders and SavedStands tables.
 * This is acceptable at current scale (users rarely have >1000 orders).
 * If latency becomes a concern, pre-aggregate on order creation instead.
 *
 * Response shape:
 *   {
 *     totalOrders:   number,   // all non-cancelled orders
 *     totalSpent:    number,   // sum in EUR (amountInCents / 100)
 *     savedStands:   number,   // current saved-stand count
 *   }
 *
 * Environment variables:
 *   ORDERS_TABLE       — DynamoDB orders table
 *   SAVED_STANDS_TABLE — DynamoDB saved stands table
 *   ALLOWED_ORIGIN     — CORS allowed origin
 */

'use strict';

const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall }         = require('@aws-sdk/util-dynamodb');
const { respond, preflight }           = require('../common/cors');

const dynamo             = new DynamoDBClient({});
const ORDERS_TABLE       = process.env.ORDERS_TABLE       || 'ai-pavilion-orders';
const SAVED_STANDS_TABLE = process.env.SAVED_STANDS_TABLE || 'ai-pavilion-saved-stands';

function getUserId(event) {
    return event.requestContext?.authorizer?.claims?.sub || null;
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

/**
 * Query all orders for a user via the user-orders-index GSI.
 * Paginates automatically — users with many orders still get accurate totals.
 */
async function fetchAllUserOrders(userId) {
    const orders = [];
    let lastKey;

    do {
        const params = {
            TableName:                 ORDERS_TABLE,
            IndexName:                 'user-orders-index',
            KeyConditionExpression:    'user_id = :uid',
            ExpressionAttributeValues: marshall({ ':uid': userId }),
            // Only fetch fields needed for stats — reduces read capacity
            ProjectionExpression:      'amountInCents, #s',
            ExpressionAttributeNames:  { '#s': 'status' },
        };
        if (lastKey) params.ExclusiveStartKey = lastKey;

        const result = await dynamo.send(new QueryCommand(params));
        (result.Items || []).forEach(item => orders.push(unmarshall(item)));
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return orders;
}

/**
 * Count saved stands for a user (SELECT COUNT(*) equivalent).
 * Uses Select: COUNT to avoid fetching full items.
 */
async function countSavedStands(userId) {
    let total = 0;
    let lastKey;

    do {
        const params = {
            TableName:                 SAVED_STANDS_TABLE,
            KeyConditionExpression:    'user_id = :uid',
            ExpressionAttributeValues: marshall({ ':uid': userId }),
            Select:                    'COUNT',
        };
        if (lastKey) params.ExclusiveStartKey = lastKey;

        const result = await dynamo.send(new QueryCommand(params));
        total  += result.Count || 0;
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return total;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return preflight(event);

    const userId = getUserId(event);
    if (!userId) {
        return respond(401, { error: 'UNAUTHORIZED', message: 'Authentication required' }, event);
    }

    try {
        // Run both queries in parallel — independent tables
        const [orders, savedStands] = await Promise.all([
            fetchAllUserOrders(userId),
            countSavedStands(userId),
        ]);

        // Exclude cancelled orders from spend total
        const completedOrders = orders.filter(o => o.status !== 'cancelled');

        const totalSpentCents = completedOrders.reduce(
            (sum, o) => sum + (o.amountInCents || 0), 0
        );

        return respond(200, {
            totalOrders: completedOrders.length,
            totalSpent:  totalSpentCents / 100,   // convert to currency units
            savedStands,
        }, event);

    } catch (error) {
        console.error('user-stats error:', error);
        return respond(500, { error: 'INTERNAL_ERROR', message: 'Failed to compute stats' }, event);
    }
};
