"use strict";

global.__APP_CONFIG__ = { apiEndpoint: "https://api.example.test" };

const mockGetAccessToken = jest.fn();
jest.mock("../../frontend/src/account/auth.js", () => ({
    authService: { getAccessToken: mockGetAccessToken },
}));

const { apiService, ApiError } = require("../../frontend/src/core/api.js");
const { CONFIG } = require("../../frontend/src/core/config.js");

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

describe("frontend API client", () => {
    beforeEach(() => {
        mockGetAccessToken.mockReset();
        mockGetAccessToken.mockResolvedValue(null);
        CONFIG.api.retryAttempts = 3;
        CONFIG.api.retryDelay = 0;
        CONFIG.api.timeout = 1000;
        global.fetch = jest.fn();
    });

    test("sends the Cognito access token from the auth service", async () => {
        mockGetAccessToken.mockResolvedValue("access-token");
        fetch.mockResolvedValue(jsonResponse(200, { stands: [] }));

        await apiService.get("/stands");
        const headers = fetch.mock.calls[0][1].headers;
        expect(headers.Authorization).toBe("Bearer access-token");
        expect(headers.Authorization).not.toContain("id-token");
    });

    test("does not retry a client error", async () => {
        fetch.mockResolvedValue(jsonResponse(400, { message: "bad request" }));
        await expect(apiService.get("/stands")).rejects.toMatchObject({
            status: 400,
            message: "bad request",
        });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test("retries a safe GET on transient 503", async () => {
        fetch
            .mockResolvedValueOnce(jsonResponse(503, { message: "busy" }))
            .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
        await expect(apiService.get("/stands")).resolves.toEqual({ ok: true });
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    test("does not retry an ordinary mutating request", async () => {
        fetch.mockResolvedValue(jsonResponse(503, { message: "busy" }));
        await expect(
            apiService.post("/stands/contact", {}),
        ).rejects.toBeInstanceOf(ApiError);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test("retries checkout only with the same explicit idempotency key", async () => {
        fetch
            .mockResolvedValueOnce(jsonResponse(503, { message: "busy" }))
            .mockResolvedValueOnce(
                jsonResponse(200, {
                    orderId: "ord_1",
                    paymentIntentId: "pi_1",
                }),
            );
        await apiService.createPaymentIntent(
            [
                {
                    standId: "s1",
                    productId: "p1",
                    quantity: 1,
                    name: "untrusted",
                    priceInCents: 1,
                },
            ],
            "buyer@example.com",
            "checkout-request-00000001",
        );
        expect(fetch).toHaveBeenCalledTimes(2);
        for (const [, options] of fetch.mock.calls) {
            expect(options.headers["Idempotency-Key"]).toBe(
                "checkout-request-00000001",
            );
            const body = JSON.parse(options.body);
            expect(body.items[0]).toEqual({
                standId: "s1",
                productId: "p1",
                quantity: 1,
            });
            expect(body.items[0].priceInCents).toBeUndefined();
        }
    });
});
