/**
 * AI Pavilion - Validation Utilities
 */

// ==================== EMAIL VALIDATION ====================

export function validateEmail(email) {
    if (!email || typeof email !== 'string') {
        return {
            isValid: false,
            error: 'Email is required'
        };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(email)) {
        return {
            isValid: false,
            error: 'Invalid email format'
        };
    }

    if (email.length > 254) {
        return {
            isValid: false,
            error: 'Email is too long'
        };
    }

    return {
        isValid: true,
        error: null
    };
}

// ==================== PASSWORD VALIDATION ====================

export function validatePassword(password, options = {}) {
    const {
        minLength = 8,
        requireUppercase = true,
        requireLowercase = true,
        requireNumbers = true,
        requireSpecialChars = true
    } = options;

    if (!password || typeof password !== 'string') {
        return {
            isValid: false,
            error: 'Password is required'
        };
    }

    if (password.length < minLength) {
        return {
            isValid: false,
            error: `Password must be at least ${minLength} characters long`
        };
    }

    if (requireUppercase && !/[A-Z]/.test(password)) {
        return {
            isValid: false,
            error: 'Password must contain at least one uppercase letter'
        };
    }

    if (requireLowercase && !/[a-z]/.test(password)) {
        return {
            isValid: false,
            error: 'Password must contain at least one lowercase letter'
        };
    }

    if (requireNumbers && !/[0-9]/.test(password)) {
        return {
            isValid: false,
            error: 'Password must contain at least one number'
        };
    }

    if (requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        return {
            isValid: false,
            error: 'Password must contain at least one special character'
        };
    }

    return {
        isValid: true,
        error: null
    };
}

// ==================== REQUIRED FIELD VALIDATION ====================

export function validateRequired(value, fieldName = 'Field') {
    if (value === null || value === undefined) {
        return {
            isValid: false,
            error: `${fieldName} is required`
        };
    }

    if (typeof value === 'string' && value.trim().length === 0) {
        return {
            isValid: false,
            error: `${fieldName} cannot be empty`
        };
    }

    if (Array.isArray(value) && value.length === 0) {
        return {
            isValid: false,
            error: `${fieldName} cannot be empty`
        };
    }

    return {
        isValid: true,
        error: null
    };
}

// ==================== PHONE VALIDATION ====================

export function validatePhone(phone) {
    if (!phone || typeof phone !== 'string') {
        return {
            isValid: false,
            error: 'Phone number is required'
        };
    }

    // Remove all non-digit characters
    const cleanPhone = phone.replace(/\D/g, '');

    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        return {
            isValid: false,
            error: 'Invalid phone number length'
        };
    }

    return {
        isValid: true,
        error: null
    };
}

// ==================== URL VALIDATION ====================

export function validateURL(url) {
    if (!url || typeof url !== 'string') {
        return {
            isValid: false,
            error: 'URL is required'
        };
    }

    try {
        new URL(url);
        return {
            isValid: true,
            error: null
        };
    } catch (e) {
        return {
            isValid: false,
            error: 'Invalid URL format'
        };
    }
}

// ==================== NUMBER VALIDATION ====================

export function validateNumber(value, options = {}) {
    const {
        min = -Infinity,
        max = Infinity,
        integer = false
    } = options;

    const num = Number(value);

    if (isNaN(num)) {
        return {
            isValid: false,
            error: 'Must be a valid number'
        };
    }

    if (integer && !Number.isInteger(num)) {
        return {
            isValid: false,
            error: 'Must be an integer'
        };
    }

    if (num < min) {
        return {
            isValid: false,
            error: `Must be at least ${min}`
        };
    }

    if (num > max) {
        return {
            isValid: false,
            error: `Must be at most ${max}`
        };
    }

    return {
        isValid: true,
        error: null
    };
}

// ==================== CREDIT CARD VALIDATION ====================

export function validateCreditCard(cardNumber) {
    if (!cardNumber || typeof cardNumber !== 'string') {
        return {
            isValid: false,
            error: 'Card number is required'
        };
    }

    // Remove spaces and dashes
    const cleanCard = cardNumber.replace(/[\s-]/g, '');

    if (!/^\d+$/.test(cleanCard)) {
        return {
            isValid: false,
            error: 'Card number must contain only digits'
        };
    }

    if (cleanCard.length < 13 || cleanCard.length > 19) {
        return {
            isValid: false,
            error: 'Invalid card number length'
        };
    }

    // Luhn algorithm
    let sum = 0;
    let isEven = false;

    for (let i = cleanCard.length - 1; i >= 0; i--) {
        let digit = parseInt(cleanCard.charAt(i), 10);

        if (isEven) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }

        sum += digit;
        isEven = !isEven;
    }

    if (sum % 10 !== 0) {
        return {
            isValid: false,
            error: 'Invalid card number'
        };
    }

    return {
        isValid: true,
        error: null
    };
}

// ==================== FORM VALIDATION ====================

export function validateForm(formData, rules) {
    const errors = {};
    let isValid = true;

    Object.keys(rules).forEach(field => {
        const rule = rules[field];
        const value = formData[field];

        if (rule.required) {
            const result = validateRequired(value, field);
            if (!result.isValid) {
                errors[field] = result.error;
                isValid = false;
                return;
            }
        }

        if (rule.email && value) {
            const result = validateEmail(value);
            if (!result.isValid) {
                errors[field] = result.error;
                isValid = false;
            }
        }

        if (rule.password && value) {
            const result = validatePassword(value, rule.passwordOptions);
            if (!result.isValid) {
                errors[field] = result.error;
                isValid = false;
            }
        }

        if (rule.phone && value) {
            const result = validatePhone(value);
            if (!result.isValid) {
                errors[field] = result.error;
                isValid = false;
            }
        }

        if (rule.url && value) {
            const result = validateURL(value);
            if (!result.isValid) {
                errors[field] = result.error;
                isValid = false;
            }
        }

        if (rule.number && value !== undefined) {
            const result = validateNumber(value, rule.numberOptions);
            if (!result.isValid) {
                errors[field] = result.error;
                isValid = false;
            }
        }

        if (rule.custom && value !== undefined) {
            const result = rule.custom(value);
            if (!result.isValid) {
                errors[field] = result.error;
                isValid = false;
            }
        }
    });

    return {
        isValid,
        errors
    };
}

export default {
    validateEmail,
    validatePassword,
    validateRequired,
    validatePhone,
    validateURL,
    validateNumber,
    validateCreditCard,
    validateForm
};
