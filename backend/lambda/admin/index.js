/**
 * AI Pavilion - Admin API Lambda
 * Handles all administrative operations with role-based access control
 * Consolidated administrative API with explicit Cognito admin checks.
 */

const { withObservability } = require("../common/observability");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
    DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const STANDS_TABLE = process.env.STANDS_TABLE || "ai-pavilion-stands";
const ORDERS_TABLE = process.env.ORDERS_TABLE || "ai-pavilion-orders";
const INTERACTIONS_TABLE =
    process.env.INTERACTIONS_TABLE || "ai-pavilion-interactions";

const { corsHeaders, preflight } = require("../common/cors");
const { scanAll, scanPage } = require("../common/dynamo");
const { CognitoJwtVerifier } = require("aws-jwt-verify");
const {
    CognitoIdentityProviderClient,
    ListUsersCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const { randomUUID } = require("crypto");

const cognito = new CognitoIdentityProviderClient({});

// Cognito JWT verifier — verifies token signature AND checks the user is in the "admin" group.
// Cached per Lambda container for performance.
let _verifier = null;
function getVerifier() {
    if (_verifier) {
        return _verifier;
    }
    _verifier = CognitoJwtVerifier.create({
        userPoolId: process.env.COGNITO_USER_POOL_ID,
        tokenUse: "access",
        clientId: process.env.COGNITO_CLIENT_ID,
    });
    return _verifier;
}

/**
 * Main Lambda handler
 */
const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return preflight(event);
    }

    try {
        // Verify admin authorization — returns decoded JWT payload or null
        const adminPayload = await verifyAdminRole(event);
        if (!adminPayload) {
            return errorResponse(
                403,
                "Forbidden: Admin access required",
                event,
            );
        }
        const path = event.path;
        const method = event.httpMethod;
        if (path === "/admin/dashboard" && method === "GET") {
            return await getDashboardOverview(event);
        }
        if (path === "/admin/stands" && method === "GET") {
            return await listStands(event);
        }
        if (path.match(/\/admin\/stands\/[^/]+$/) && method === "GET") {
            return await getStand(event);
        }
        if (path === "/admin/stands" && method === "POST") {
            return await createStand(event);
        }
        if (path.match(/\/admin\/stands\/[^/]+$/) && method === "PUT") {
            return await updateStand(event);
        }
        if (path.match(/\/admin\/stands\/[^/]+$/) && method === "DELETE") {
            return await deleteStand(event);
        }
        if (path === "/admin/users" && method === "GET") {
            return await listUsers(event);
        }
        if (path === "/admin/orders" && method === "GET") {
            return await listOrders(event);
        }

        // Analytics
        if (path === "/admin/analytics" && method === "GET") {
            return await getAnalytics(event);
        }

        return errorResponse(404, "Endpoint not found", event);
    } catch (error) {
        console.error("Unhandled error in admin Lambda:", error);
        return errorResponse(500, "Internal server error", event);
    }
};

exports.handler = withObservability("admin", handler);

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
    const authHeader =
        headers["Authorization"] || headers["authorization"] || "";

    if (!authHeader.startsWith("Bearer ")) {
        return null;
    }

    const token = authHeader.slice(7);
    if (!token) {
        return null;
    }

    try {
        const payload = await getVerifier().verify(token);

        // Check the user belongs to the "admin" Cognito group
        const groups = payload["cognito:groups"] || [];
        if (!groups.includes("admin")) {
            console.warn("Access denied: user not in admin group", payload.sub);
            return null;
        }

        return payload;
    } catch (err) {
        // Log for CloudWatch but never expose details to caller
        console.warn("JWT verification failed:", err.message);
        return null;
    }
}

function parseLimit(value, fallback = 50, maximum = 100) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(Math.max(parsed, 1), maximum);
}

function decodeCursor(value) {
    if (!value) {
        return undefined;
    }
    try {
        return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    } catch {
        return null;
    }
}

function encodeCursor(value) {
    return value
        ? Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
        : null;
}

function parseBody(event) {
    try {
        return typeof event.body === "string"
            ? JSON.parse(event.body || "{}")
            : event.body || {};
    } catch {
        return null;
    }
}

/**
 * Get dashboard overview statistics
 */
async function getDashboardOverview(event) {
    try {
        const [stands, orders, totalUsers] = await Promise.all([
            scanAll(docClient, { TableName: STANDS_TABLE }),
            scanAll(docClient, { TableName: ORDERS_TABLE }).catch(() => []),
            countCognitoUsers().catch(() => 0),
        ]);

        const paidOrders = orders.filter((order) => order.status === "paid");
        const totalRevenueInCents = paidOrders.reduce((sum, order) => {
            if (typeof order.amountInCents === "number") {
                return sum + order.amountInCents;
            }
            if (typeof order.total_amount === "number") {
                return sum + Math.round(order.total_amount * 100);
            }
            return sum;
        }, 0);

        const stats = {
            totalStands: stands.length,
            totalUsers,
            totalOrders: orders.length,
            paidOrders: paidOrders.length,
            totalRevenue: totalRevenueInCents / 100,
            recentActivity: orders
                .sort((a, b) =>
                    (b.createdAt || b.created_at || "").localeCompare(
                        a.createdAt || a.created_at || "",
                    ),
                )
                .slice(0, 5)
                .map((order) => ({
                    type: "order",
                    id: order.orderId || order.order_id || "(unknown)",
                    amountEur: ((order.amountInCents || 0) / 100).toFixed(2),
                    status: order.status || "unknown",
                    createdAt: order.createdAt || order.created_at || null,
                })),
        };

        return successResponse(stats, 200, event);
    } catch (error) {
        console.error("Dashboard error:", error);
        throw error;
    }
}

/**
 * List all stands with pagination
 */
async function listStands(event) {
    const queryParams = event.queryStringParameters || {};
    const limit = parseLimit(queryParams.limit);
    const status = queryParams.status; // 'pending', 'approved', 'all'

    try {
        let params = {
            TableName: STANDS_TABLE,
            Limit: limit,
        };
        if (status && status !== "all") {
            params.FilterExpression = "#status = :status";
            params.ExpressionAttributeNames = { "#status": "status" };
            params.ExpressionAttributeValues = { ":status": status };
        }

        const exclusiveStartKey = decodeCursor(queryParams.cursor);
        if (queryParams.cursor && exclusiveStartKey === null) {
            return errorResponse(400, "Invalid pagination cursor", event);
        }

        const { items, nextKey } = await scanPage(
            docClient,
            params,
            exclusiveStartKey,
        );

        return successResponse(
            {
                stands: items,
                count: items.length,
                nextCursor: encodeCursor(nextKey),
            },
            200,
            event,
        );
    } catch (error) {
        console.error("List stands error:", error);
        throw error;
    }
}

/**
 * Get single stand details
 */
async function getStand(event) {
    const standId =
        event.pathParameters?.standId || event.path.split("/").pop();

    try {
        const result = await docClient.send(
            new GetCommand({
                TableName: STANDS_TABLE,
                Key: { stand_id: standId },
            }),
        );

        if (!result.Item) {
            return errorResponse(404, "Stand not found", event);
        }

        return successResponse(result.Item, 200, event);
    } catch (error) {
        console.error("Get stand error:", error);
        throw error;
    }
}

/**
 * Create new stand
 */
async function createStand(event) {
    const body = parseBody(event);
    if (!body) {
        return errorResponse(400, "Invalid JSON body", event);
    }
    if (
        typeof body.name !== "string" ||
        typeof body.booth_number !== "string" ||
        !body.name.trim() ||
        !body.booth_number.trim()
    ) {
        return errorResponse(
            400,
            "Missing required fields: name, booth_number",
            event,
        );
    }

    const stand = {
        stand_id: `stand_${randomUUID()}`,
        name: body.name.trim().slice(0, 160),
        booth_number: body.booth_number.trim().slice(0, 80),
        category: body.category || "other",
        description: body.description || "",
        image_url: body.image_url || "",
        is_sponsored: body.is_sponsored || false,
        ar_enabled: body.ar_enabled || false,
        tour_enabled: body.tour_enabled || false,
        status: "approved", // Auto-approve admin-created stands
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    try {
        await docClient.send(
            new PutCommand({
                TableName: STANDS_TABLE,
                Item: stand,
            }),
        );

        return successResponse(stand, 201, event);
    } catch (error) {
        console.error("Create stand error:", error);
        throw error;
    }
}

/**
 * Update existing stand
 */
async function updateStand(event) {
    const standId =
        event.pathParameters?.standId || event.path.split("/").pop();
    const body = parseBody(event);
    if (!body) {
        return errorResponse(400, "Invalid JSON body", event);
    }

    // Build update expression
    let updateExpression = "SET updated_at = :updated_at";
    const expressionAttributeValues = {
        ":updated_at": new Date().toISOString(),
    };
    const expressionAttributeNames = {};

    // Add fields to update
    const allowedFields = [
        "name",
        "description",
        "image_url",
        "is_sponsored",
        "ar_enabled",
        "tour_enabled",
        "status",
        "category",
    ];
    allowedFields.forEach((field) => {
        if (body[field] !== undefined) {
            updateExpression += `, #${field} = :${field}`;
            expressionAttributeNames[`#${field}`] = field;
            expressionAttributeValues[`:${field}`] = body[field];
        }
    });

    try {
        const result = await docClient.send(
            new UpdateCommand({
                TableName: STANDS_TABLE,
                Key: { stand_id: standId },
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: "ALL_NEW",
                ConditionExpression: "attribute_exists(stand_id)",
            }),
        );

        return successResponse(result.Attributes, 200, event);
    } catch (error) {
        if (error?.name === "ConditionalCheckFailedException") {
            return errorResponse(404, "Stand not found", event);
        }
        console.error("Update stand error:", error);
        throw error;
    }
}

/**
 * Delete stand
 */
async function deleteStand(event) {
    const standId =
        event.pathParameters?.standId || event.path.split("/").pop();

    try {
        const result = await docClient.send(
            new DeleteCommand({
                TableName: STANDS_TABLE,
                Key: { stand_id: standId },
                ReturnValues: "ALL_OLD",
            }),
        );
        if (!result.Attributes) {
            return errorResponse(404, "Stand not found", event);
        }

        return successResponse(
            { message: "Stand deleted successfully" },
            200,
            event,
        );
    } catch (error) {
        console.error("Delete stand error:", error);
        throw error;
    }
}

/** Count all users in the configured Cognito user pool. */
async function countCognitoUsers() {
    let paginationToken;
    let count = 0;
    do {
        const page = await cognito.send(
            new ListUsersCommand({
                UserPoolId: process.env.COGNITO_USER_POOL_ID,
                Limit: 60,
                PaginationToken: paginationToken,
            }),
        );
        count += (page.Users || []).length;
        paginationToken = page.PaginationToken;
    } while (paginationToken);
    return count;
}

/** List Cognito users without exposing sensitive attributes. */
async function listUsers(event) {
    const queryParams = event.queryStringParameters || {};
    const limit = parseLimit(queryParams.limit, 25, 60);
    let paginationToken;

    if (queryParams.cursor) {
        try {
            paginationToken = Buffer.from(
                queryParams.cursor,
                "base64url",
            ).toString("utf8");
        } catch {
            return errorResponse(400, "Invalid pagination cursor", event);
        }
    }

    const page = await cognito.send(
        new ListUsersCommand({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Limit: limit,
            PaginationToken: paginationToken,
        }),
    );

    const users = (page.Users || []).map((user) => {
        const attributes = Object.fromEntries(
            (user.Attributes || []).map((attribute) => [
                attribute.Name,
                attribute.Value,
            ]),
        );
        return {
            username: user.Username,
            email: attributes.email || null,
            emailVerified: attributes.email_verified === "true",
            enabled: user.Enabled !== false,
            status: user.UserStatus || null,
            createdAt: user.UserCreateDate || null,
            updatedAt: user.UserLastModifiedDate || null,
        };
    });

    return successResponse(
        {
            users,
            count: users.length,
            nextCursor: page.PaginationToken
                ? Buffer.from(page.PaginationToken, "utf8").toString(
                      "base64url",
                  )
                : null,
        },
        200,
        event,
    );
}

/**
 * List orders
 */
async function listOrders(event) {
    const queryParams = event.queryStringParameters || {};
    const limit = parseLimit(queryParams.limit);

    try {
        const exclusiveStartKey = decodeCursor(queryParams.cursor);
        if (queryParams.cursor && exclusiveStartKey === null) {
            return errorResponse(400, "Invalid pagination cursor", event);
        }

        const { items, nextKey } = await scanPage(
            docClient,
            { TableName: ORDERS_TABLE, Limit: limit },
            exclusiveStartKey,
        );

        const orders = items.map((item) => {
            const order = { ...item };
            delete order.paymentIntentId;
            delete order.clientSecret;
            delete order.cartFingerprint;
            delete order.checkoutRequestId;
            delete order.customerEmail;
            return order;
        });

        return successResponse(
            {
                orders,
                count: orders.length,
                nextCursor: encodeCursor(nextKey),
            },
            200,
            event,
        );
    } catch (error) {
        console.error("List orders error:", error);
        return errorResponse(500, "Failed to load orders", event);
    }
}

/**
 * Get analytics data
 */
async function getAnalytics(event) {
    const queryParams = event.queryStringParameters || {};
    const days = parseLimit(queryParams.days, 30, 365);
    const cutoff = new Date(
        Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString();

    try {
        const [allStands, interactions] = await Promise.all([
            scanAll(docClient, { TableName: STANDS_TABLE }),
            scanAll(docClient, {
                TableName: INTERACTIONS_TABLE,
                FilterExpression: "createdAt >= :cutoff",
                ExpressionAttributeValues: { ":cutoff": cutoff },
                ProjectionExpression:
                    "standId, interactionType, createdAt, userId, anonymousId",
            }),
        ]);

        const byStand = new Map();
        for (const interaction of interactions) {
            if (!interaction.standId) {
                continue;
            }
            const current = byStand.get(interaction.standId) || {
                views: 0,
                clicks: 0,
                contacts: 0,
                downloads: 0,
                interactions: 0,
                visitors: new Set(),
            };
            current.interactions += 1;
            if (interaction.interactionType === "view") {
                current.views += 1;
            }
            if (interaction.interactionType === "click") {
                current.clicks += 1;
            }
            if (interaction.interactionType === "contact") {
                current.contacts += 1;
            }
            if (interaction.interactionType === "download") {
                current.downloads += 1;
            }
            const visitor = interaction.userId || interaction.anonymousId;
            if (visitor) {
                current.visitors.add(visitor);
            }
            byStand.set(interaction.standId, current);
        }

        const topStands = allStands
            .map((stand) => {
                const metrics = byStand.get(stand.stand_id) || {
                    views: 0,
                    clicks: 0,
                    contacts: 0,
                    downloads: 0,
                    interactions: 0,
                    visitors: new Set(),
                };
                return {
                    stand_id: stand.stand_id,
                    name: stand.name,
                    views: metrics.views,
                    clicks: metrics.clicks,
                    contacts: metrics.contacts,
                    downloads: metrics.downloads,
                    interactions: metrics.interactions,
                    uniqueVisitors: metrics.visitors.size,
                };
            })
            .sort(
                (a, b) => b.views - a.views || b.interactions - a.interactions,
            )
            .slice(0, 10);

        return successResponse(
            {
                period: `${days} days`,
                cutoff,
                stands: {
                    total: allStands.length,
                    active: allStands.filter((s) =>
                        ["approved", "published"].includes(s.status),
                    ).length,
                    pending: allStands.filter((s) => s.status === "pending")
                        .length,
                },
                totals: {
                    interactions: interactions.length,
                    views: interactions.filter(
                        (i) => i.interactionType === "view",
                    ).length,
                    contacts: interactions.filter(
                        (i) => i.interactionType === "contact",
                    ).length,
                },
                topStands,
            },
            200,
            event,
        );
    } catch (error) {
        console.error("Analytics error:", error);
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
        body: JSON.stringify(data),
    };
}

/**
 * Error response helper — never exposes internal error.message
 */
function errorResponse(statusCode, message, event = {}) {
    return {
        statusCode,
        headers: corsHeaders(event),
        body: JSON.stringify({ error: message, statusCode }),
    };
}
