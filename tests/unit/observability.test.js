"use strict";

const {
    requestIdFor,
    withObservability,
} = require("../../backend/lambda/common/observability");

describe("request observability", () => {
    test("preserves a valid caller correlation identifier", () => {
        expect(
            requestIdFor({
                headers: { "X-Request-Id": "client-request-1234" },
            }),
        ).toBe("client-request-1234");
    });

    test("rejects malformed correlation identifiers", () => {
        const requestId = requestIdFor({
            headers: { "x-request-id": "bad id with spaces and bearer data" },
        });
        expect(requestId).not.toContain(" ");
        expect(requestId).not.toContain("bearer");
    });

    test("adds the request id and logs metadata without request bodies", async () => {
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        const wrapped = withObservability("test-handler", async () => ({
            statusCode: 201,
            headers: {},
            body: JSON.stringify({ ok: true }),
        }));
        const response = await wrapped({
            httpMethod: "POST",
            path: "/test",
            headers: { "x-request-id": "safe-request-1234" },
            body: JSON.stringify({ password: "secret-value" }),
        });

        expect(response.headers["X-Request-Id"]).toBe("safe-request-1234");
        const records = log.mock.calls.map(([message]) => JSON.parse(message));
        expect(records).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    event: "request.started",
                    requestId: "safe-request-1234",
                    path: "/test",
                }),
                expect.objectContaining({
                    event: "request.completed",
                    statusCode: 201,
                }),
            ]),
        );
        expect(JSON.stringify(records)).not.toContain("secret-value");
        log.mockRestore();
    });
});
