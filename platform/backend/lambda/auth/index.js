// Cognito Authentication Handler
const { CognitoIdentityProviderClient, InitiateAuthCommand } = require("@aws-sdk/client-cognito-identity-provider");

const client = new CognitoIdentityProviderClient({});

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://localhost:3000';

exports.handler = async (event) => {
    const requestOrigin = (event.headers || {})['origin'] || (event.headers || {})['Origin'] || '';
    const allowedOrigin = requestOrigin === ALLOWED_ORIGIN ? requestOrigin : ALLOWED_ORIGIN;

    const headers = {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Content-Type': 'application/json'
    };
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }
    
    try {
        let parsed;
        try {
            parsed = JSON.parse(event.body || '{}');
        } catch {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
        }
        const { action, username, password } = parsed;
        if (!action || !username || !password) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields: action, username, password' }) };
        }
        
        if (action === 'login') {
            const command = new InitiateAuthCommand({
                AuthFlow: 'USER_PASSWORD_AUTH',
                ClientId: process.env.COGNITO_CLIENT_ID,
                AuthParameters: {
                    USERNAME: username,
                    PASSWORD: password
                }
            });
            
            const response = await client.send(command);
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    tokens: response.AuthenticationResult
                })
            };
        }
        
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid action' })
        };
        
    } catch (error) {
        console.error('Auth Lambda error:', error);

        // Map Cognito error codes to safe, user-facing messages.
        // Never expose error.message — it may contain internal AWS details.
        const cognitoErrorMap = {
            // Both map to the same message deliberately: telling a caller which one
            // fired leaks whether the email exists in the system (user enumeration).
            'NotAuthorizedException':  { status: 401, message: 'Invalid username or password' },
            'UserNotFoundException':    { status: 401, message: 'Invalid username or password' },
            'UserNotConfirmedException':    { status: 403, message: 'Account not confirmed. Check your email.' },
            'PasswordResetRequiredException': { status: 403, message: 'Password reset required.' },
            'TooManyRequestsException':     { status: 429, message: 'Too many attempts. Please try again later.' },
            'LimitExceededException':       { status: 429, message: 'Too many attempts. Please try again later.' },
        };

        const mapped = cognitoErrorMap[error.name] || cognitoErrorMap[error.__type];
        if (mapped) {
            return {
                statusCode: mapped.status,
                headers,
                body: JSON.stringify({ error: mapped.message })
            };
        }

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Authentication service unavailable' })
        };
    }
};
