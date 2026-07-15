/**
 * Unit tests — frontend configuration validator.
 */

"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.join(__dirname, "../../scripts/validate-config.js");

function runValidator(envContent) {
    const tmpFile = path.join(
        os.tmpdir(),
        `ai-pavilion-test-env-${process.pid}-${Date.now()}-${Math.random()}.env`,
    );
    fs.writeFileSync(tmpFile, envContent, { mode: 0o600 });
    try {
        execFileSync(process.execPath, [SCRIPT, "--env", tmpFile], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        });
        return { code: 0 };
    } catch (error) {
        return {
            code: error.status,
            stdout: error.stdout,
            stderr: error.stderr,
        };
    } finally {
        fs.unlinkSync(tmpFile);
    }
}

const VALID_BASE = `
NODE_ENV=development
AWS_REGION=eu-west-1
API_GATEWAY_URL=https://abc123.execute-api.eu-west-1.amazonaws.com/dev
ALLOWED_ORIGIN=http://127.0.0.1:3000
COGNITO_USER_POOL_ID=eu-west-1_AbCdEfGhI
COGNITO_CLIENT_ID=abcdef1234567890abcdef1234
PAYMENT_MODE=simulated
STRIPE_PUBLISHABLE_KEY=
`.trim();

describe("validate-config.js", () => {
    test("accepts the disposable stack simulated-payment configuration", () => {
        expect(runValidator(VALID_BASE).code).toBe(0);
    });

    test("accepts Stripe test mode with a publishable test key", () => {
        const env = VALID_BASE.replace(
            "PAYMENT_MODE=simulated\nSTRIPE_PUBLISHABLE_KEY=",
            "PAYMENT_MODE=stripe\nSTRIPE_PUBLISHABLE_KEY=pk_test_abc123_xyz",
        );
        expect(runValidator(env).code).toBe(0);
    });

    test("rejects Stripe mode without a publishable test key", () => {
        const env = VALID_BASE.replace(
            "PAYMENT_MODE=simulated",
            "PAYMENT_MODE=stripe",
        );
        expect(runValidator(env).code).toBe(1);
    });

    test("rejects a missing required value", () => {
        const env = VALID_BASE.split("\n")
            .filter((line) => !line.startsWith("COGNITO_CLIENT_ID="))
            .join("\n");
        expect(runValidator(env).code).toBe(1);
    });

    test("rejects generated-file placeholders", () => {
        const env = VALID_BASE.replace(
            "https://abc123.execute-api.eu-west-1.amazonaws.com/dev",
            "https://example.execute-api.eu-west-1.amazonaws.com/dev",
        );
        expect(runValidator(env).code).toBe(1);
    });

    test("rejects backend secrets in a frontend env file", () => {
        const env = `${VALID_BASE}\nSTRIPE_WEBHOOK_SECRET=whsec_should_not_be_here`;
        expect(runValidator(env).code).toBe(1);
    });

    test("rejects an unknown payment mode", () => {
        const env = VALID_BASE.replace(
            "PAYMENT_MODE=simulated",
            "PAYMENT_MODE=magic",
        );
        expect(runValidator(env).code).toBe(1);
    });

    test("exits 1 when the requested environment file does not exist", () => {
        expect(() =>
            execFileSync(
                process.execPath,
                [SCRIPT, "--env", `/tmp/does-not-exist-${Date.now()}.env`],
                { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
            ),
        ).toThrow();
    });
});
