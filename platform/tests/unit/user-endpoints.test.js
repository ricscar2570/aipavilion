/**
 * Unit tests — user-saved-stands and user-stats Lambdas
 *
 * Both Lambdas use DynamoDB only (no Stripe, no Secrets Manager).
 * Mocks are reset between each test to ensure isolation.
 */

'use strict';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockDynamoSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient:      jest.fn(() => ({ send: mockDynamoSend })),
    QueryCommand:        jest.fn(input => ({ type: 'Query',  input })),
    PutItemCommand:      jest.fn(input => ({ type: 'Put',    input })),
    DeleteItemCommand:   jest.fn(input => ({ type: 'Delete', input })),
}));

jest.mock('@aws-sdk/util-dynamodb', () => ({
    marshall:   jest.fn(obj => obj),
    unmarshall: jest.fn(obj => obj),
}));

jest.mock('../../backend/lambda/common/cors', () => ({
    corsHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
    respond:     jest.fn((status, body) => ({
        statusCode: status,
        body: JSON.stringify(body),
    })),
    preflight:   jest.fn(() => ({ statusCode: 204, body: '' })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides = {}) {
    return {
        httpMethod:     'GET',
        path:           '/user/saved-stands',
        headers:        { origin: 'https://test.example.com' },
        body:           null,
        requestContext: {
            authorizer: { claims: { sub: 'user-abc' } },
        },
        ...overrides,
    };
}

// ─── user-saved-stands ────────────────────────────────────────────────────────

describe('user-saved-stands Lambda', () => {
    let handler;

    beforeAll(() => {
        handler = require('../../backend/lambda/user-saved-stands/index').handler;
    });

    beforeEach(() => {
        mockDynamoSend.mockReset();
    });

    test('OPTIONS returns 204 preflight', async () => {
        const res = await handler(makeEvent({ httpMethod: 'OPTIONS' }));
        expect(res.statusCode).toBe(204);
    });

    test('returns 401 when no auth claims', async () => {
        const event = makeEvent({ requestContext: {} });
        const res   = await handler(event);
        expect(res.statusCode).toBe(401);
    });

    describe('GET /user/saved-stands', () => {
        test('returns 200 with empty list when no saved stands', async () => {
            mockDynamoSend.mockResolvedValue({ Items: [] });
            const res  = await handler(makeEvent());
            const body = JSON.parse(res.body);
            expect(res.statusCode).toBe(200);
            expect(body.stands).toEqual([]);
            expect(body.count).toBe(0);
        });

        test('returns saved stands for the user', async () => {
            const items = [
                { user_id: 'user-abc', stand_id: 's1', name: 'Alpha Stand', saved_at: '2024-01-01' },
                { user_id: 'user-abc', stand_id: 's2', name: 'Beta Stand',  saved_at: '2024-01-02' },
            ];
            mockDynamoSend.mockResolvedValue({ Items: items });
            const res  = await handler(makeEvent());
            const body = JSON.parse(res.body);
            expect(res.statusCode).toBe(200);
            expect(body.count).toBe(2);
            expect(body.stands[0].stand_id).toBe('s1');
        });
    });

    describe('POST /user/saved-stands', () => {
        test('returns 201 when stand is saved successfully', async () => {
            mockDynamoSend.mockResolvedValue({});
            const res = await handler(makeEvent({
                httpMethod: 'POST',
                body: JSON.stringify({ standId: 'stand-99', name: 'New Stand', imageUrl: '' }),
            }));
            expect(res.statusCode).toBe(201);
            expect(JSON.parse(res.body).saved).toBe(true);
        });

        test('returns 400 when standId is missing', async () => {
            const res = await handler(makeEvent({
                httpMethod: 'POST',
                body: JSON.stringify({ name: 'No ID' }),
            }));
            expect(res.statusCode).toBe(400);
        });

        test('returns 400 on invalid JSON body', async () => {
            const res = await handler(makeEvent({
                httpMethod: 'POST',
                body: 'not-json',
            }));
            expect(res.statusCode).toBe(400);
        });
    });

    describe('DELETE /user/saved-stands/:standId', () => {
        test('returns 200 when stand is deleted', async () => {
            mockDynamoSend.mockResolvedValue({});
            const res = await handler(makeEvent({
                httpMethod: 'DELETE',
                path: '/user/saved-stands/stand-99',
            }));
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body).deleted).toBe(true);
        });

        test('is idempotent — returns 200 even if stand was not saved', async () => {
            // DynamoDB DeleteItem does not error if the key doesn't exist
            mockDynamoSend.mockResolvedValue({});
            const res = await handler(makeEvent({
                httpMethod: 'DELETE',
                path: '/user/saved-stands/ghost-stand',
            }));
            expect(res.statusCode).toBe(200);
        });
    });
});

// ─── user-stats ───────────────────────────────────────────────────────────────

describe('user-stats Lambda', () => {
    let handler;

    beforeAll(() => {
        // Clear the module cache so user-stats gets its own mock instance
        jest.resetModules();
        // Re-apply mocks after resetModules
        jest.mock('@aws-sdk/client-dynamodb', () => ({
            DynamoDBClient:  jest.fn(() => ({ send: mockDynamoSend })),
            QueryCommand:    jest.fn(input => ({ type: 'Query', input })),
        }));
        jest.mock('@aws-sdk/util-dynamodb', () => ({
            marshall:   jest.fn(obj => obj),
            unmarshall: jest.fn(obj => obj),
        }));
        jest.mock('../../backend/lambda/common/cors', () => ({
            respond:   jest.fn((status, body) => ({ statusCode: status, body: JSON.stringify(body) })),
            preflight: jest.fn(() => ({ statusCode: 204, body: '' })),
        }));
        handler = require('../../backend/lambda/user-stats/index').handler;
    });

    beforeEach(() => mockDynamoSend.mockReset());

    test('OPTIONS returns 204', async () => {
        const res = await handler(makeEvent({ httpMethod: 'OPTIONS', path: '/user/stats' }));
        expect(res.statusCode).toBe(204);
    });

    test('returns 401 when unauthenticated', async () => {
        const res = await handler(makeEvent({ path: '/user/stats', requestContext: {} }));
        expect(res.statusCode).toBe(401);
    });

    test('returns correct stats for a user with orders and saved stands', async () => {
        const orders = [
            { status: 'paid',      amountInCents: 2000 },
            { status: 'paid',      amountInCents: 3000 },
            { status: 'cancelled', amountInCents: 1000 },
        ];

        // First call → orders query, second call → saved-stands count
        mockDynamoSend
            .mockResolvedValueOnce({ Items: orders, Count: 3 })  // orders
            .mockResolvedValueOnce({ Count: 5 });                 // saved stands COUNT

        const res  = await handler(makeEvent({ path: '/user/stats' }));
        const body = JSON.parse(res.body);

        expect(res.statusCode).toBe(200);
        expect(body.totalOrders).toBe(2);          // 2 paid, 1 cancelled excluded
        expect(body.totalSpent).toBeCloseTo(50);   // (2000 + 3000) / 100
        expect(body.savedStands).toBe(5);
    });

    test('returns zero stats for a new user with no orders', async () => {
        mockDynamoSend
            .mockResolvedValueOnce({ Items: [], Count: 0 })
            .mockResolvedValueOnce({ Count: 0 });

        const res  = await handler(makeEvent({ path: '/user/stats' }));
        const body = JSON.parse(res.body);

        expect(res.statusCode).toBe(200);
        expect(body.totalOrders).toBe(0);
        expect(body.totalSpent).toBe(0);
        expect(body.savedStands).toBe(0);
    });

    test('returns 500 on DynamoDB error', async () => {
        mockDynamoSend.mockRejectedValue(new Error('DynamoDB timeout'));
        const res = await handler(makeEvent({ path: '/user/stats' }));
        expect(res.statusCode).toBe(500);
    });
});
