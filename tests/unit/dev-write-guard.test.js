"use strict";

const {
    assertSyntheticWriteAllowed,
    looksProductionLike,
} = require("../../scripts/dev/write-guard");

const ORIGINAL_ENV = { ...process.env };

function resetEnvironment() {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ALLOW_SYNTHETIC_FIXTURES;
    delete process.env.ENVIRONMENT;
    delete process.env.TEST_USER_ENVIRONMENT;
    delete process.env.STAGE;
    delete process.env.STACK_NAME;
    delete process.env.STACK_OUTPUTS_FILE;
}

beforeEach(resetEnvironment);
afterAll(() => {
    process.env = ORIGINAL_ENV;
});

describe("synthetic writer guard", () => {
    test("is disabled unless explicitly enabled", () => {
        expect(() => assertSyntheticWriteAllowed("seed")).toThrow(
            /ALLOW_SYNTHETIC_FIXTURES=true/,
        );
    });

    test("requires an explicit non-production environment", () => {
        process.env.ALLOW_SYNTHETIC_FIXTURES = "true";
        expect(() => assertSyntheticWriteAllowed("seed")).toThrow(
            /requires an explicit/,
        );
    });

    test.each(["production", "prod", "live", "ai-pavilion-prod"])(
        "recognizes production-like value %s",
        (value) => {
            expect(looksProductionLike(value)).toBe(true);
        },
    );

    test("rejects production-like environments and stack names", () => {
        process.env.ALLOW_SYNTHETIC_FIXTURES = "true";
        process.env.ENVIRONMENT = "production";
        expect(() => assertSyntheticWriteAllowed("seed")).toThrow(
            /forbidden for production-like/,
        );

        process.env.ENVIRONMENT = "staging";
        process.env.STACK_NAME = "ai-pavilion-live";
        expect(() => assertSyntheticWriteAllowed("seed")).toThrow(
            /forbidden for production-like/,
        );
    });

    test.each(["dev", "development", "test", "ci", "staging"])(
        "allows explicit synthetic writes in %s",
        (environment) => {
            process.env.ALLOW_SYNTHETIC_FIXTURES = "true";
            process.env.ENVIRONMENT = environment;
            process.env.STACK_NAME = `ai-pavilion-${environment}`;
            process.env.STACK_OUTPUTS_FILE = `.artifacts/${environment}-outputs.json`;
            expect(assertSyntheticWriteAllowed("seed")).toEqual(
                expect.objectContaining({ environment }),
            );
        },
    );
});
