/**
 * AI Pavilion - Comprehensive Input Validation
 * Production-grade validation with Joi schemas
 * 
 * Features:
 * - Schema-based validation
 * - Type checking
 * - Sanitization
 * - Custom validators
 * - Error messages
 */

const Joi = require('joi');
const { createValidationError } = require('./error-handler');

// Custom validators
const customValidators = {
    // Validate stand_id format
    standId: Joi.string()
        .pattern(/^stand_[a-zA-Z0-9]{8,}$/)
        .message('Invalid stand ID format'),
    
    // Validate product_id format
    productId: Joi.string()
        .pattern(/^prod_[a-zA-Z0-9]{8,}$/)
        .message('Invalid product ID format'),
    
    // Validate phone number (international)
    phone: Joi.string()
        .pattern(/^\+?[1-9]\d{1,14}$/)
        .message('Invalid phone number format'),
    
    // Validate URL
    url: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .message('Invalid URL format'),
    
    // Validate price (positive, max 2 decimals)
    price: Joi.number()
        .positive()
        .precision(2)
        .max(999999.99)
        .message('Invalid price format'),
    
    // Validate rating (0-5)
    rating: Joi.number()
        .min(0)
        .max(5)
        .precision(1)
        .message('Rating must be between 0 and 5')
};

// Stand Schemas
const standSchemas = {
    create: Joi.object({
        name: Joi.string()
            .min(3)
            .max(100)
            .required()
            .trim()
            .messages({
                'string.empty': 'Stand name is required',
                'string.min': 'Stand name must be at least 3 characters',
                'string.max': 'Stand name must not exceed 100 characters'
            }),
        
        booth_number: Joi.string()
            .pattern(/^[A-Z0-9]{1,10}$/)
            .required()
            .uppercase()
            .messages({
                'string.empty': 'Booth number is required',
                'string.pattern.base': 'Booth number must contain only letters and numbers'
            }),
        
        category: Joi.string()
            .valid('gaming', 'vr', 'ar', 'esports', 'indie', 'retro', 'merchandise', 'other')
            .required()
            .messages({
                'any.only': 'Invalid category. Must be one of: gaming, vr, ar, esports, indie, retro, merchandise, other'
            }),
        
        description: Joi.string()
            .min(10)
            .max(1000)
            .allow('')
            .trim(),
        
        image_url: customValidators.url
            .allow('')
            .optional(),
        
        website: customValidators.url
            .allow('')
            .optional(),
        
        contact_email: Joi.string()
            .email()
            .allow('')
            .optional(),
        
        contact_phone: customValidators.phone
            .allow('')
            .optional(),
        
        is_sponsored: Joi.boolean()
            .default(false),
        
        ar_enabled: Joi.boolean()
            .default(false),
        
        tour_enabled: Joi.boolean()
            .default(false),
        
        tags: Joi.array()
            .items(Joi.string().max(50))
            .max(10)
            .optional(),
        
        social_links: Joi.object({
            twitter: customValidators.url.optional(),
            facebook: customValidators.url.optional(),
            instagram: customValidators.url.optional(),
            youtube: customValidators.url.optional(),
            discord: customValidators.url.optional()
        }).optional()
    }).options({ stripUnknown: true }),
    
    update: Joi.object({
        name: Joi.string()
            .min(3)
            .max(100)
            .trim()
            .optional(),
        
        booth_number: Joi.string()
            .pattern(/^[A-Z0-9]{1,10}$/)
            .uppercase()
            .optional(),
        
        category: Joi.string()
            .valid('gaming', 'vr', 'ar', 'esports', 'indie', 'retro', 'merchandise', 'other')
            .optional(),
        
        description: Joi.string()
            .min(10)
            .max(1000)
            .trim()
            .optional(),
        
        image_url: customValidators.url.optional(),
        website: customValidators.url.optional(),
        contact_email: Joi.string().email().optional(),
        contact_phone: customValidators.phone.optional(),
        is_sponsored: Joi.boolean().optional(),
        ar_enabled: Joi.boolean().optional(),
        tour_enabled: Joi.boolean().optional(),
        tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
        social_links: Joi.object({
            twitter: customValidators.url.optional(),
            facebook: customValidators.url.optional(),
            instagram: customValidators.url.optional(),
            youtube: customValidators.url.optional(),
            discord: customValidators.url.optional()
        }).optional()
    }).min(1).options({ stripUnknown: true })
};

// Product Schemas
const productSchemas = {
    create: Joi.object({
        stand_id: customValidators.standId.required(),
        
        name: Joi.string()
            .min(3)
            .max(200)
            .required()
            .trim(),
        
        description: Joi.string()
            .min(10)
            .max(2000)
            .required()
            .trim(),
        
        price: customValidators.price.required(),
        
        currency: Joi.string()
            .valid('USD', 'EUR', 'GBP')
            .default('EUR'),
        
        image_url: customValidators.url.optional(),
        
        category: Joi.string()
            .max(50)
            .optional(),
        
        stock: Joi.number()
            .integer()
            .min(0)
            .default(0),
        
        is_digital: Joi.boolean()
            .default(false),
        
        download_url: customValidators.url
            .when('is_digital', {
                is: true,
                then: Joi.required(),
                otherwise: Joi.optional()
            }),
        
        ar_model_url: customValidators.url.optional(),
        
        tags: Joi.array()
            .items(Joi.string().max(50))
            .max(10)
            .optional()
    }).options({ stripUnknown: true }),
    
    update: Joi.object({
        name: Joi.string().min(3).max(200).trim().optional(),
        description: Joi.string().min(10).max(2000).trim().optional(),
        price: customValidators.price.optional(),
        currency: Joi.string().valid('USD', 'EUR', 'GBP').optional(),
        image_url: customValidators.url.optional(),
        category: Joi.string().max(50).optional(),
        stock: Joi.number().integer().min(0).optional(),
        is_digital: Joi.boolean().optional(),
        download_url: customValidators.url.optional(),
        ar_model_url: customValidators.url.optional(),
        tags: Joi.array().items(Joi.string().max(50)).max(10).optional()
    }).min(1).options({ stripUnknown: true })
};

// Payment Schemas
const paymentSchemas = {
    createIntent: Joi.object({
        amount: Joi.number()
            .integer()
            .min(50) // Minimum €0.50
            .max(99999999) // Maximum €999,999.99
            .required()
            .messages({
                'number.min': 'Amount must be at least €0.50',
                'number.max': 'Amount exceeds maximum allowed'
            }),
        
        currency: Joi.string()
            .valid('EUR', 'USD', 'GBP')
            .default('EUR'),
        
        customer_email: Joi.string()
            .email()
            .required(),
        
        items: Joi.array()
            .items(Joi.object({
                product_id: customValidators.productId.required(),
                quantity: Joi.number().integer().min(1).max(100).required(),
                price: customValidators.price.required()
            }))
            .min(1)
            .required()
    }).options({ stripUnknown: true })
};

// User Schemas
const userSchemas = {
    register: Joi.object({
        email: Joi.string()
            .email()
            .required()
            .lowercase()
            .trim(),
        
        password: Joi.string()
            .min(8)
            .max(128)
            .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
            .required()
            .messages({
                'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
            }),
        
        name: Joi.string()
            .min(2)
            .max(100)
            .required()
            .trim(),
        
        phone: customValidators.phone.optional(),
        
        company: Joi.string()
            .max(200)
            .optional()
            .trim(),
        
        role: Joi.string()
            .valid('visitor', 'exhibitor', 'admin')
            .default('visitor')
    }).options({ stripUnknown: true }),
    
    login: Joi.object({
        email: Joi.string()
            .email()
            .required()
            .lowercase()
            .trim(),
        
        password: Joi.string()
            .required()
    }).options({ stripUnknown: true })
};

// Query Parameter Schemas
const querySchemas = {
    listStands: Joi.object({
        category: Joi.string()
            .valid('gaming', 'vr', 'ar', 'esports', 'indie', 'retro', 'merchandise', 'other')
            .optional(),
        
        search: Joi.string()
            .max(100)
            .trim()
            .optional(),
        
        limit: Joi.number()
            .integer()
            .min(1)
            .max(100)
            .default(20),
        
        offset: Joi.number()
            .integer()
            .min(0)
            .default(0),
        
        sort: Joi.string()
            .valid('name', 'rating', 'views', 'created_at')
            .default('created_at'),
        
        order: Joi.string()
            .valid('asc', 'desc')
            .default('desc')
    }).options({ stripUnknown: true })
};

// Validation Middleware
const validate = (schema, source = 'body') => {
    return (event) => {
        let data;
        
        switch (source) {
            case 'body':
                data = typeof event.body === 'string' 
                    ? JSON.parse(event.body) 
                    : event.body;
                break;
            case 'query':
                data = event.queryStringParameters || {};
                break;
            case 'path':
                data = event.pathParameters || {};
                break;
            default:
                data = event;
        }
        
        const { error, value } = schema.validate(data, {
            abortEarly: false,
            stripUnknown: true
        });
        
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                type: detail.type
            }));
            
            throw createValidationError(
                'Validation failed',
                details
            );
        }
        
        return value;
    };
};

// Sanitization Functions
const sanitize = {
    // Remove HTML tags and dangerous characters
    html: (input) => {
        if (typeof input !== 'string') return input;
        
        return input
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '');
    },
    
    // Remove SQL injection patterns
    sql: (input) => {
        if (typeof input !== 'string') return input;
        
        const dangerous = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
            /(--|;|\/\*|\*\/|xp_)/gi,
            /(\bOR\b.*=.*)/gi,
            /(\bAND\b.*=.*)/gi
        ];
        
        let sanitized = input;
        dangerous.forEach(pattern => {
            sanitized = sanitized.replace(pattern, '');
        });
        
        return sanitized;
    },
    
    // Sanitize object recursively
    object: (obj, sanitizer = sanitize.html) => {
        if (typeof obj !== 'object' || obj === null) {
            return typeof obj === 'string' ? sanitizer(obj) : obj;
        }
        
        const sanitized = Array.isArray(obj) ? [] : {};
        
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                sanitized[key] = sanitize.object(obj[key], sanitizer);
            }
        }
        
        return sanitized;
    }
};

// Combined validation and sanitization
const validateAndSanitize = (schema, source = 'body') => {
    return (event) => {
        // First validate
        const validated = validate(schema, source)(event);
        
        // Then sanitize
        return sanitize.object(validated, sanitize.html);
    };
};

// Export
module.exports = {
    // Schemas
    standSchemas,
    productSchemas,
    paymentSchemas,
    userSchemas,
    querySchemas,
    
    // Validators
    validate,
    validateAndSanitize,
    sanitize,
    
    // Custom validators (for reuse)
    customValidators
};

// Example Usage:
/*
const { validateAndSanitize, standSchemas } = require('./validation');

exports.handler = async (event, context) => {
    try {
        // Validate and sanitize input
        const validatedData = validateAndSanitize(
            standSchemas.create,
            'body'
        )(event);
        
        // Now validatedData is validated AND sanitized
        // Safe to use in database
        
    } catch (error) {
        return errorHandler(error, { requestId: context.requestId });
    }
};
*/
