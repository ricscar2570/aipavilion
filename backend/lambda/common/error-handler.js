/**
 * AI Pavilion - Comprehensive Error Handling System
 * Production-grade error management with structured responses
 * 
 * Features:
 * - Error classification
 * - Structured responses
 * - User-friendly messages
 * - Proper logging
 * - Error codes
 * - Stack trace handling
 */

// Error Types Enum
const ErrorTypes = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
    AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
    NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
    CONFLICT_ERROR: 'CONFLICT_ERROR',
    RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
    PAYMENT_ERROR: 'PAYMENT_ERROR',
    EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
};

// Error Codes
const ErrorCodes = {
    // Validation (1000-1999)
    MISSING_REQUIRED_FIELD: 1001,
    INVALID_EMAIL: 1002,
    INVALID_PHONE: 1003,
    INVALID_FORMAT: 1004,
    VALUE_TOO_LONG: 1005,
    VALUE_TOO_SHORT: 1006,
    INVALID_TYPE: 1007,
    
    // Authentication (2000-2999)
    INVALID_CREDENTIALS: 2001,
    TOKEN_EXPIRED: 2002,
    TOKEN_INVALID: 2003,
    SESSION_EXPIRED: 2004,
    
    // Authorization (3000-3999)
    INSUFFICIENT_PERMISSIONS: 3001,
    RESOURCE_FORBIDDEN: 3002,
    
    // Not Found (4000-4999)
    RESOURCE_NOT_FOUND: 4001,
    STAND_NOT_FOUND: 4002,
    PRODUCT_NOT_FOUND: 4003,
    USER_NOT_FOUND: 4004,
    
    // Conflict (5000-5999)
    RESOURCE_ALREADY_EXISTS: 5001,
    EMAIL_ALREADY_EXISTS: 5002,
    DUPLICATE_ENTRY: 5003,
    
    // Rate Limiting (6000-6999)
    TOO_MANY_REQUESTS: 6001,
    QUOTA_EXCEEDED: 6002,
    
    // Payment (7000-7999)
    PAYMENT_FAILED: 7001,
    CARD_DECLINED: 7002,
    INSUFFICIENT_FUNDS: 7003,
    INVALID_CARD: 7004,
    
    // External Services (8000-8999)
    STRIPE_ERROR: 8001,
    AWS_ERROR: 8002,
    S3_ERROR: 8003,
    COGNITO_ERROR: 8004,
    
    // Database (9000-9999)
    DATABASE_CONNECTION_ERROR: 9001,
    QUERY_FAILED: 9002,
    TRANSACTION_FAILED: 9003,
    
    // Internal (10000+)
    INTERNAL_SERVER_ERROR: 10001,
    UNHANDLED_ERROR: 10002
};

// Custom Error Class
class AppError extends Error {
    constructor(type, code, message, details = null, statusCode = 500) {
        super(message);
        this.name = 'AppError';
        this.type = type;
        this.code = code;
        this.details = details;
        this.statusCode = statusCode;
        this.timestamp = new Date().toISOString();
        
        // Capture stack trace
        Error.captureStackTrace(this, this.constructor);
    }
    
    toJSON() {
        return {
            error: {
                type: this.type,
                code: this.code,
                message: this.message,
                details: this.details,
                timestamp: this.timestamp
            }
        };
    }
}

// Error Factory Functions
const createValidationError = (message, details = null) => {
    return new AppError(
        ErrorTypes.VALIDATION_ERROR,
        ErrorCodes.INVALID_FORMAT,
        message,
        details,
        400
    );
};

const createAuthenticationError = (message = 'Authentication failed') => {
    return new AppError(
        ErrorTypes.AUTHENTICATION_ERROR,
        ErrorCodes.INVALID_CREDENTIALS,
        message,
        null,
        401
    );
};

const createAuthorizationError = (message = 'Insufficient permissions') => {
    return new AppError(
        ErrorTypes.AUTHORIZATION_ERROR,
        ErrorCodes.INSUFFICIENT_PERMISSIONS,
        message,
        null,
        403
    );
};

const createNotFoundError = (resource, id = null) => {
    return new AppError(
        ErrorTypes.NOT_FOUND_ERROR,
        ErrorCodes.RESOURCE_NOT_FOUND,
        `${resource} not found${id ? `: ${id}` : ''}`,
        { resource, id },
        404
    );
};

const createConflictError = (message, details = null) => {
    return new AppError(
        ErrorTypes.CONFLICT_ERROR,
        ErrorCodes.RESOURCE_ALREADY_EXISTS,
        message,
        details,
        409
    );
};

const createRateLimitError = () => {
    return new AppError(
        ErrorTypes.RATE_LIMIT_ERROR,
        ErrorCodes.TOO_MANY_REQUESTS,
        'Too many requests. Please try again later.',
        { retryAfter: 60 },
        429
    );
};

const createPaymentError = (message, details = null) => {
    return new AppError(
        ErrorTypes.PAYMENT_ERROR,
        ErrorCodes.PAYMENT_FAILED,
        message,
        details,
        402
    );
};

const createDatabaseError = (message, originalError = null) => {
    return new AppError(
        ErrorTypes.DATABASE_ERROR,
        ErrorCodes.QUERY_FAILED,
        'Database operation failed',
        { message, originalError: originalError?.message },
        500
    );
};

// Error Handler Middleware
const errorHandler = (error, context = {}) => {
    // Log error with context
    logError(error, context);
    
    // Handle known AppError
    if (error instanceof AppError) {
        return {
            statusCode: error.statusCode,
            headers: {
                'Content-Type': 'application/json',
                'X-Error-Code': error.code.toString()
            },
            body: JSON.stringify(error.toJSON())
        };
    }
    
    // Handle Stripe errors
    if (error.type && error.type.startsWith('Stripe')) {
        return handleStripeError(error);
    }
    
    // Handle AWS SDK errors
    if (error.name && error.name.includes('AWS')) {
        return handleAWSError(error);
    }
    
    // Handle unknown errors
    const internalError = new AppError(
        ErrorTypes.INTERNAL_ERROR,
        ErrorCodes.UNHANDLED_ERROR,
        'An unexpected error occurred',
        process.env.NODE_ENV === 'development' ? {
            message: error.message,
            stack: error.stack
        } : null,
        500
    );
    
    logError(internalError, { originalError: error, context });
    
    return {
        statusCode: 500,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(internalError.toJSON())
    };
};

// Stripe Error Handler
const handleStripeError = (error) => {
    let appError;
    
    switch (error.type) {
        case 'StripeCardError':
            appError = new AppError(
                ErrorTypes.PAYMENT_ERROR,
                ErrorCodes.CARD_DECLINED,
                error.message,
                { decline_code: error.decline_code },
                402
            );
            break;
            
        case 'StripeInvalidRequestError':
            appError = createValidationError(
                'Invalid payment request',
                { message: error.message }
            );
            break;
            
        case 'StripeAPIError':
        case 'StripeConnectionError':
            appError = new AppError(
                ErrorTypes.EXTERNAL_SERVICE_ERROR,
                ErrorCodes.STRIPE_ERROR,
                'Payment service temporarily unavailable',
                null,
                503
            );
            break;
            
        default:
            appError = createPaymentError('Payment processing failed');
    }
    
    return {
        statusCode: appError.statusCode,
        headers: {
            'Content-Type': 'application/json',
            'X-Error-Code': appError.code.toString()
        },
        body: JSON.stringify(appError.toJSON())
    };
};

// AWS Error Handler
const handleAWSError = (error) => {
    let appError;
    
    switch (error.code) {
        case 'ResourceNotFoundException':
            appError = createNotFoundError('Resource', error.message);
            break;
            
        case 'ConditionalCheckFailedException':
            appError = createConflictError('Resource conflict');
            break;
            
        case 'ProvisionedThroughputExceededException':
        case 'ThrottlingException':
            appError = createRateLimitError();
            break;
            
        case 'ValidationException':
            appError = createValidationError(error.message);
            break;
            
        default:
            appError = new AppError(
                ErrorTypes.EXTERNAL_SERVICE_ERROR,
                ErrorCodes.AWS_ERROR,
                'Service temporarily unavailable',
                process.env.NODE_ENV === 'development' ? {
                    code: error.code,
                    message: error.message
                } : null,
                503
            );
    }
    
    return {
        statusCode: appError.statusCode,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(appError.toJSON())
    };
};

// Structured Logging
const logError = (error, context = {}) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        error: {
            name: error.name,
            message: error.message,
            type: error.type || 'Unknown',
            code: error.code || 'N/A',
            stack: error.stack
        },
        context: {
            requestId: context.requestId,
            userId: context.userId,
            path: context.path,
            method: context.method,
            ...context
        }
    };
    
    // Log to CloudWatch (structured JSON)
    console.error(JSON.stringify(logEntry));
    
    // In production, also send to error tracking service
    if (process.env.NODE_ENV === 'production' && shouldAlert(error)) {
        // Send alert (implement based on your alerting system)
        sendErrorAlert(logEntry);
    }
};

// Determine if error should trigger alert
const shouldAlert = (error) => {
    // Alert on:
    // - Internal errors
    // - Database errors
    // - External service errors (after retries)
    // - Payment errors (high value)
    
    const alertableTypes = [
        ErrorTypes.INTERNAL_ERROR,
        ErrorTypes.DATABASE_ERROR,
        ErrorTypes.EXTERNAL_SERVICE_ERROR
    ];
    
    return alertableTypes.includes(error.type) ||
           (error.type === ErrorTypes.PAYMENT_ERROR && 
            error.details?.amount > 10000); // Alert on payments >€100
};

// Send error alert (placeholder)
const sendErrorAlert = async (logEntry) => {
    // Implement SNS notification or PagerDuty integration
    console.log('ALERT:', JSON.stringify(logEntry));
};

// Success Response Helper
const successResponse = (data, statusCode = 200, headers = {}) => {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            ...headers
        },
        body: JSON.stringify({
            success: true,
            data,
            timestamp: new Date().toISOString()
        })
    };
};

// Export
module.exports = {
    ErrorTypes,
    ErrorCodes,
    AppError,
    createValidationError,
    createAuthenticationError,
    createAuthorizationError,
    createNotFoundError,
    createConflictError,
    createRateLimitError,
    createPaymentError,
    createDatabaseError,
    errorHandler,
    successResponse,
    logError
};

// Example Usage in Lambda:
/*
const { errorHandler, createNotFoundError, successResponse } = require('./error-handler');

exports.handler = async (event, context) => {
    try {
        const { stand_id } = event.pathParameters;
        
        // Get stand from DB
        const stand = await getStand(stand_id);
        
        if (!stand) {
            throw createNotFoundError('Stand', stand_id);
        }
        
        return successResponse(stand);
        
    } catch (error) {
        return errorHandler(error, {
            requestId: context.requestId,
            path: event.path,
            method: event.httpMethod
        });
    }
};
*/
