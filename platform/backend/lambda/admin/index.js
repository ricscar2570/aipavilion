/**
 * AI Pavilion - Admin API Lambda
 * Handles all administrative operations with role-based access control
 * Production-ready with comprehensive error handling
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { 
    DynamoDBDocumentClient,
    ScanCommand,
    GetCommand,
    PutCommand,
    UpdateCommand,
    DeleteCommand,
    QueryCommand
} = require("@aws-sdk/lib-dynamodb");
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const STANDS_TABLE = process.env.STANDS_TABLE || 'ai-pavilion-stands';
const USERS_TABLE = process.env.USERS_TABLE || 'ai-pavilion-users';
const ORDERS_TABLE = process.env.ORDERS_TABLE || 'ai-pavilion-orders';

const { corsHeaders, preflight } = require('../common/cors');
const { scanAll, scanPage } = require('../common/dynamo');
const { CognitoJwtVerifier } = require('aws-jwt-verify');

// Cognito JWT verifier — verifies token signature AND checks the user is in the "admin" group.
// Cached per Lambda container for performance.
let _verifier = null;
function getVerifier() {
    if (_verifier) return _verifier;
    _verifier = CognitoJwtVerifier.create({
        userPoolId: process.env.COGNITO_USER_POOL_ID,
        tokenUse:   'access',
        clientId:   process.env.COGNITO_CLIENT_ID,
    });
    return _verifier;
}

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    if (event.httpMethod === 'OPTIONS') {
        return preflight(event);
    }
    
    try {
        // Verify admin authorization — returns decoded JWT payload or null
        const adminPayload = await verifyAdminRole(event);
        if (!adminPayload) {
            return errorResponse(403, 'Forbidden: Admin access required', event);
        }
        const path = event.path;
        const method = event.httpMethod;
        if (path === '/admin/dashboard' && method === 'GET') {
            return await getDashboardOverview();
        }
        if (path === '/admin/stands' && method === 'GET') {
            return await listStands(event);
        }
        if (path.match(/\/admin\/stands\/[^\/]+$/) && method === 'GET') {
            return await getStand(event);
        }
        if (path === '/admin/stands' && method === 'POST') {
            return await createStand(event);
        }
        if (path.match(/\/admin\/stands\/[^\/]+$/) && method === 'PUT') {
            return await updateStand(event);
        }
        if (path.match(/\/admin\/stands\/[^\/]+$/) && method === 'DELETE') {
            return await deleteStand(event);
        }
        if (path === '/admin/users' && method === 'GET') {
            return await listUsers(event);
        }
        if (path.match(/\/admin\/users\/[^\/]+$/) && method === 'PUT') {
            return await updateUser(event);
        }
        if (path === '/admin/orders' && method === 'GET') {
            return await listOrders(event);
        }
        
        // Analytics
        if (path === '/admin/analytics' && method === 'GET') {
            return await getAnalytics(event);
        }
        
        return errorResponse(404, 'Endpoint not found');
        
    } catch (error) {
        console.error('Unhandled error in admin Lambda:', error);
        return errorResponse(500, 'Internal server error', event);
    }
};

/**
 * Verify admin role from JWT token.
 *
 * Requires:
 *   - Valid Cognito access token in Authorization: Bearer <token> header
 *   - Token issuer matches COGNITO_USER_POOL_ID
 *   - Token "cognito:groups" claim includes "admin"
 *
 * Returns the decoded payload on success, null on failure.
 */
async function verifyAdminRole(event) {
    const headers = event.headers || {};
    const authHeader = headers['Authorization'] || headers['authorization'] || '';

    if (!authHeader.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);
    if (!token) return null;

    try {
        const payload = await getVerifier().verify(token);

        // Check the user belongs to the "admin" Cognito group
        const groups = payload['cognito:groups'] || [];
        if (!groups.includes('admin')) {
            console.warn('Access denied: user not in admin group', payload.sub);
            return null;
        }

        return payload;
    } catch (err) {
        // Log for CloudWatch but never expose details to caller
        console.warn('JWT verification failed:', err.message);
        return null;
    }
}

/**
 * Get dashboard overview statistics
 */
async function getDashboardOverview() {
    try {
        // Get stands count
        const standsResult = await docClient.send(new ScanCommand({
            TableName: STANDS_TABLE,
            Select: 'COUNT'
        }));
        const stats = {
            totalStands: standsResult.Count || 0,
            totalUsers: 0, // Calculated from Cognito
            totalOrders: 0,
            totalRevenue: 0,
            recentActivity: []
        };
        try {
            const ordersResult = await docClient.send(new ScanCommand({
                TableName: ORDERS_TABLE,
                Limit: 100
            }));
            
            if (ordersResult.Items) {
                stats.totalOrders = ordersResult.Items.length;
                // amountInCents is what checkout Lambda writes; divide by 100 for display.
                // Older orders may have total_amount (legacy float) — fall back gracefully.
                stats.totalRevenue = ordersResult.Items.reduce((sum, order) => {
                    const cents  = typeof order.amountInCents === 'number' ? order.amountInCents : null;
                    const legacy = typeof order.total_amount  === 'number' ? order.total_amount * 100 : 0;
                    return sum + (cents !== null ? cents : legacy);
                }, 0) / 100;
                stats.recentActivity = ordersResult.Items
                    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
                    .slice(0, 5)
                    .map(order => ({
                        type:       'order',
                        id:         order.orderId || order.order_id || '(unknown)',
                        amountEur:  ((order.amountInCents || 0) / 100).toFixed(2),
                        status:     order.status || 'unknown',
                        createdAt:  order.createdAt || order.created_at || null,
                    }));
            }
        } catch (e) {
            console.log('Orders table not available:', e.message);
        }
        
        return successResponse(stats);
        
    } catch (error) {
        console.error('Dashboard error:', error);
        throw error;
    }
}

/**
 * List all stands with pagination
 */
async function listStands(event) {
    const queryParams = event.queryStringParameters || {};
    const limit = parseInt(queryParams.limit) || 50;
    const status = queryParams.status; // 'pending', 'approved', 'all'
    
    try {
        let params = {
            TableName: STANDS_TABLE,
            Limit: limit
        };
        if (status && status !== 'all') {
            params.FilterExpression = '#status = :status';
            params.ExpressionAttributeNames = { '#status': 'status' };
            params.ExpressionAttributeValues = { ':status': status };
        }
        
        const exclusiveStartKey = event.queryStringParameters?.cursor
            ? JSON.parse(Buffer.from(event.queryStringParameters.cursor, 'base64').toString())
            : undefined;

        const { items, nextKey } = await scanPage(docClient, params, exclusiveStartKey);

        return successResponse({
            stands:     items,
            count:      items.length,
            nextCursor: nextKey
                ? Buffer.from(JSON.stringify(nextKey)).toString('base64')
                : null,
        });
        
    } catch (error) {
        console.error('List stands error:', error);
        throw error;
    }
}

/**
 * Get single stand details
 */
async function getStand(event) {
    const standId = event.path.split('/').pop();
    
    try {
        const result = await docClient.send(new GetCommand({
            TableName: STANDS_TABLE,
            Key: { stand_id: standId }
        }));
        
        if (!result.Item) {
            return errorResponse(404, 'Stand not found');
        }
        
        return successResponse(result.Item);
        
    } catch (error) {
        console.error('Get stand error:', error);
        throw error;
    }
}

/**
 * Create new stand
 */
async function createStand(event) {
    const body = JSON.parse(event.body || '{}');
    if (!body.name || !body.booth_number) {
        return errorResponse(400, 'Missing required fields: name, booth_number');
    }
    
    const stand = {
        stand_id: `stand_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: body.name,
        booth_number: body.booth_number,
        category: body.category || 'other',
        description: body.description || '',
        image_url: body.image_url || '',
        is_sponsored: body.is_sponsored || false,
        ar_enabled: body.ar_enabled || false,
        tour_enabled: body.tour_enabled || false,
        status: 'approved', // Auto-approve admin-created stands
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    
    try {
        await docClient.send(new PutCommand({
            TableName: STANDS_TABLE,
            Item: stand
        }));
        
        return successResponse(stand, 201);
        
    } catch (error) {
        console.error('Create stand error:', error);
        throw error;
    }
}

/**
 * Update existing stand
 */
async function updateStand(event) {
    const standId = event.path.split('/').pop();
    const body = JSON.parse(event.body || '{}');
    
    // Build update expression
    let updateExpression = 'SET updated_at = :updated_at';
    const expressionAttributeValues = {
        ':updated_at': new Date().toISOString()
    };
    const expressionAttributeNames = {};
    
    // Add fields to update
    const allowedFields = ['name', 'description', 'image_url', 'is_sponsored', 'ar_enabled', 'tour_enabled', 'status', 'category'];
    allowedFields.forEach(field => {
        if (body[field] !== undefined) {
            updateExpression += `, #${field} = :${field}`;
            expressionAttributeNames[`#${field}`] = field;
            expressionAttributeValues[`:${field}`] = body[field];
        }
    });
    
    try {
        const result = await docClient.send(new UpdateCommand({
            TableName: STANDS_TABLE,
            Key: { stand_id: standId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        }));
        
        return successResponse(result.Attributes);
        
    } catch (error) {
        console.error('Update stand error:', error);
        throw error;
    }
}

/**
 * Delete stand
 */
async function deleteStand(event) {
    const standId = event.path.split('/').pop();
    
    try {
        await docClient.send(new DeleteCommand({
            TableName: STANDS_TABLE,
            Key: { stand_id: standId }
        }));
        
        return successResponse({ message: 'Stand deleted successfully' });
        
    } catch (error) {
        console.error('Delete stand error:', error);
        throw error;
    }
}

/**
 * List users (placeholder - integrate with Cognito)
 */
async function listUsers(event) {
    // TODO: Integrate with Cognito to list users
    // For now, return mock data
    return successResponse({
        users: [],
        message: 'User management via Cognito - integrate separately'
    });
}

/**
 * Update user (placeholder)
 */
async function updateUser(event) {
    // TODO: Integrate with Cognito
    return successResponse({
        message: 'User management via Cognito - integrate separately'
    });
}

/**
 * List orders
 */
async function listOrders(event) {
    const queryParams = event.queryStringParameters || {};
    const limit = parseInt(queryParams.limit) || 50;
    
    try {
        const exclusiveStartKey = event.queryStringParameters?.cursor
            ? JSON.parse(Buffer.from(event.queryStringParameters.cursor, 'base64').toString())
            : undefined;

        const { items, nextKey } = await scanPage(
            docClient,
            { TableName: ORDERS_TABLE, Limit: limit },
            exclusiveStartKey
        );

        return successResponse({
            orders:     items,
            count:      items.length,
            nextCursor: nextKey
                ? Buffer.from(JSON.stringify(nextKey)).toString('base64')
                : null,
        });
        
    } catch (error) {
        // Table might not exist yet
        return successResponse({
            orders: [],
            count: 0,
            message: 'Orders table not initialized'
        });
    }
}

/**
 * Get analytics data
 */
async function getAnalytics(event) {
    const queryParams = event.queryStringParameters || {};
    const days = parseInt(queryParams.days) || 30;
    
    try {
        // Get stands performance — scanAll ensures we get all pages
        const allStands = await scanAll(docClient, { TableName: STANDS_TABLE });

        const analytics = {
            period: `${days} days`,
            stands: {
                total:   allStands.length,
                active:  allStands.filter(s => s.status === 'approved').length,
                pending: allStands.filter(s => s.status === 'pending').length,
            },
            topStands: allStands
                .sort((a, b) => (b.views || 0) - (a.views || 0))
                .slice(0, 10)
                .map(stand => ({
                    stand_id: stand.stand_id,
                    name:     stand.name,
                    views:    stand.views || 0,
                    rating:   stand.rating || 0,
                })),
        };
        
        return successResponse(analytics);
        
    } catch (error) {
        console.error('Analytics error:', error);
        throw error;
    }
}

/**
 * Success response helper
 */
function successResponse(data, statusCode = 200, event = {}) {
    return {
        statusCode,
        headers: corsHeaders(event),
        body: JSON.stringify(data)
    };
}

/**
 * Error response helper — never exposes internal error.message
 */
function errorResponse(statusCode, message, event = {}) {
    return {
        statusCode,
        headers: corsHeaders(event),
        body: JSON.stringify({ error: message, statusCode })
    };
}
