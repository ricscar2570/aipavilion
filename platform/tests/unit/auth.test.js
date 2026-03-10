/**
 * Unit tests — Auth Lambda
 */

'use strict';

const mockCognitoSend = jest.fn();

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
    CognitoIdentityProviderClient: jest.fn(() => ({ send: mockCognitoSend })),
    InitiateAuthCommand: jest.fn(input => ({ type: 'InitiateAuth', input })),
}));

function makeEvent(overrides = {}) {
    return {
        httpMethod: 'POST',
        path: '/auth',
        headers: { origin: 'https://test.cloudfront.net' },
        body: null,
        ...overrides,
    };
}

describe('Auth Lambda', () => {
    let handler;

    beforeAll(() => {
        process.env.ALLOWED_ORIGIN = 'https://test.cloudfront.net';
        process.env.COGNITO_CLIENT_ID = 'test-client-id';
        handler = require('../../backend/lambda/auth/index').handler;
    });

    beforeEach(() => jest.clearAllMocks());

    test('OPTIONS returns 200 with CORS headers', async () => {
        const event = makeEvent({ httpMethod: 'OPTIONS' });
        const res = await handler(event);
        expect(res.statusCode).toBe(200);
        expect(res.headers['Access-Control-Allow-Origin']).toBe('https://test.cloudfront.net');
    });

    test('CORS origin is restricted — unknown origin gets allowed origin', async () => {
        const event = makeEvent({ httpMethod: 'OPTIONS', headers: { origin: 'https://attacker.com' } });
        const res = await handler(event);
        expect(res.headers['Access-Control-Allow-Origin']).not.toBe('https://attacker.com');
        expect(res.headers['Access-Control-Allow-Origin']).toBe('https://test.cloudfront.net');
    });

    test('login action returns tokens on success', async () => {
        mockCognitoSend.mockResolvedValue({
            AuthenticationResult: { IdToken: 'id-tok', AccessToken: 'access-tok', RefreshToken: 'refresh-tok' },
        });

        const event = makeEvent({
            body: JSON.stringify({ action: 'login', username: 'user@test.com', password: 'P@ssw0rd!' }),
        });
        const res = await handler(event);
        const body = JSON.parse(res.body);

        expect(res.statusCode).toBe(200);
        expect(body.success).toBe(true);
        expect(body.tokens.IdToken).toBe('id-tok');
    });

    test('returns 400 for invalid action', async () => {
        const event = makeEvent({
            body: JSON.stringify({ action: 'hack', username: 'x', password: 'y' }),
        });
        const res = await handler(event);
        expect(res.statusCode).toBe(400);
    });

    test('returns 500 when Cognito throws', async () => {
        mockCognitoSend.mockRejectedValue(new Error('UserNotFoundException'));
        const event = makeEvent({
            body: JSON.stringify({ action: 'login', username: 'bad@test.com', password: 'wrong' }),
        });
        const res = await handler(event);
        expect(res.statusCode).toBe(500);
    });
});
