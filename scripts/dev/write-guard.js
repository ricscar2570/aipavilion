"use strict";

const path = require("path");

const PRODUCTION_NAMES = new Set(["production", "prod", "live"]);

function normalized(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function inferEnvironment() {
    return normalized(
        process.env.ENVIRONMENT ||
            process.env.TEST_USER_ENVIRONMENT ||
            process.env.STAGE ||
            process.env.NODE_ENV,
    );
}

function looksProductionLike(value) {
    const text = normalized(value);
    return (
        PRODUCTION_NAMES.has(text) ||
        /(^|[-_.])(production|prod|live)([-_.]|$)/.test(text)
    );
}

function assertSyntheticWriteAllowed(purpose = "synthetic fixture write") {
    if (process.env.ALLOW_SYNTHETIC_FIXTURES !== "true") {
        throw new Error(
            `${purpose} is disabled. Set ALLOW_SYNTHETIC_FIXTURES=true only for an isolated dev or staging-evidence stack.`,
        );
    }

    const environment = inferEnvironment();
    const stackName = normalized(process.env.STACK_NAME);
    const outputsFile = normalized(
        process.env.STACK_OUTPUTS_FILE ||
            path.resolve(".artifacts/dev-stack-outputs.json"),
    );

    if (
        looksProductionLike(environment) ||
        looksProductionLike(stackName) ||
        looksProductionLike(outputsFile)
    ) {
        throw new Error(
            `${purpose} is forbidden for production-like environments, stack names or output files.`,
        );
    }

    if (!environment) {
        throw new Error(
            `${purpose} requires an explicit dev, test, ci or staging environment.`,
        );
    }

    if (
        !["dev", "development", "test", "ci", "staging"].includes(environment)
    ) {
        throw new Error(
            `${purpose} received unsupported environment ${environment}.`,
        );
    }

    return {
        environment,
        stackName: stackName || null,
        outputsFile,
    };
}

module.exports = {
    assertSyntheticWriteAllowed,
    inferEnvironment,
    looksProductionLike,
};
