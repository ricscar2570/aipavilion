#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const failures = [];

function assert(condition, message) {
    if (!condition) {
        failures.push(message);
    }
}

function read(relative) {
    return fs.readFileSync(path.join(root, relative), "utf8");
}

const template = read("template.yaml");
for (const token of [
    "Type: AWS::Cognito::UserPool",
    "Type: AWS::Cognito::UserPoolClient",
    "Type: AWS::Cognito::UserPoolGroup",
    "Type: AWS::SecretsManager::Secret",
    "PaymentMode:",
    "SavedStandsTableName:",
    "InteractionsTableName:",
    "PaymentEventsTableName:",
    "user-saved-at-index",
    "stand-created-index",
    "Type: AWS::Logs::LogGroup",
    "RetentionInDays: 7",
]) {
    assert(template.includes(token), `template.yaml is missing ${token}`);
}
assert(
    !template.includes("CognitoUserPoolId:"),
    "The disposable stack must not require an external Cognito User Pool parameter.",
);
assert(
    !template.includes("CognitoClientId:"),
    "The disposable stack must not require an external Cognito client parameter.",
);
assert(
    /Environment:\s+[\s\S]*?AllowedValues: \[dev\]/.test(template),
    "The disposable stack Environment parameter must be restricted to dev.",
);
assert(
    !template.includes("IsProduction"),
    "The disposable stack must not contain a production condition.",
);

const fixtures = JSON.parse(read("data/dev-fixtures.json"));
assert(
    Array.isArray(fixtures.stands),
    "dev fixtures must contain a stands array",
);
assert(
    fixtures.stands.length >= 3,
    "at least three canonical stands are required",
);
for (const stand of fixtures.stands || []) {
    assert(Boolean(stand.stand_id), "every fixture stand needs stand_id");
    assert(Boolean(stand.category), `fixture ${stand.stand_id} needs category`);
    assert(
        Array.isArray(stand.products) && stand.products.length > 0,
        `fixture ${stand.stand_id} needs at least one product`,
    );
}
assert(
    fixtures.stands.some(
        (stand) =>
            stand.stand_id === "stand_unpublished_preview" &&
            !["approved", "published"].includes(stand.status),
    ),
    "fixtures must contain the unpublished leakage-test stand",
);

const requiredFiles = [
    "scripts/dev/deploy-dev.sh",
    "scripts/dev/destroy-dev.sh",
    "scripts/dev/seed-dev.js",
    "scripts/dev/create-test-users.js",
    "scripts/dev/smoke-deployed.js",
    "scripts/dev/run-browser-e2e.sh",
    "tests/integration/dynamodb.deployed.test.js",
    "tests/e2e/test_deployed.py",
    "docs/operations/DEV-STACK-RUNBOOK.md",
    "docs/api/openapi.json",
    "docs/development/SPRINT-2.5-REPORT.md",
    "backend/lambda/common/validation.js",
    "samconfig.toml",
    "requirements-dev.txt",
];
for (const relative of requiredFiles) {
    const absolute = path.join(root, relative);
    assert(fs.existsSync(absolute), `missing Phase 2 asset: ${relative}`);
}

for (const relative of [
    "scripts/dev/deploy-dev.sh",
    "scripts/dev/destroy-dev.sh",
    "scripts/dev/run-browser-e2e.sh",
]) {
    const mode = fs.statSync(path.join(root, relative)).mode;
    assert((mode & 0o111) !== 0, `${relative} is not executable`);
}

assert(
    !template.includes("/auth/login") && !template.includes("/auth/refresh"),
    "custom password/refresh authentication routes must remain removed",
);
assert(
    !fs.existsSync(path.join(root, "backend", "lambda", "auth")),
    "orphan custom authentication Lambda directory must not exist",
);
const openapi = JSON.parse(read("docs/api/openapi.json"));
const packageJson = JSON.parse(read("package.json"));
assert(openapi.openapi === "3.1.0", "OpenAPI document must use version 3.1.0");
assert(
    openapi.info?.version === packageJson.version,
    "OpenAPI and package versions must match",
);

const forbiddenCredentialPatterns = [
    /sk_live_[A-Za-z0-9]+/,
    /sk_test_(?!not_configured)[A-Za-z0-9]{12,}/,
    /whsec_(?!not_configured)[A-Za-z0-9]{12,}/,
];
const checked = [
    template,
    read("data/dev-fixtures.json"),
    read("scripts/dev/deploy-dev.sh"),
];
for (const pattern of forbiddenCredentialPatterns) {
    assert(
        !checked.some((content) => pattern.test(content)),
        `repository contains a credential-like value matching ${pattern}`,
    );
}

if (failures.length) {
    console.error("Phase 2 asset check failed:\n");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log("Phase 2 asset check passed.");
