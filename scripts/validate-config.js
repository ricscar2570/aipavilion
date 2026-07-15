#!/usr/bin/env node
/**
 * AI Pavilion frontend configuration validator.
 *
 * Usage:
 *   node scripts/validate-config.js
 *   node scripts/validate-config.js --env .env.development.local
 *
 * Backend secrets are stack parameters / Secrets Manager values and are
 * intentionally not accepted in frontend environment files.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const envArg = process.argv.indexOf("--env");
const envFile =
    envArg !== -1
        ? process.argv[envArg + 1]
        : path.join(__dirname, "..", ".env");

if (!envFile || !fs.existsSync(envFile)) {
    console.error(
        `\n❌  Environment file not found at: ${envFile || "(missing)"}`,
    );
    console.error(
        "    Deploy the dev stack or copy .env.example to .env and configure it.\n",
    );
    process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
        continue;
    }
    const [key, ...rest] = trimmed.split("=");
    env[key.trim()] = rest.join("=").trim();
}

const PLACEHOLDER_PATTERNS = [
    /^CHANGEME/i,
    /^your[-_]/i,
    /^XXXXXXXXX/,
    /example\.execute-api/i,
    /_Example/i,
    /^exampleclient/i,
    /^pk_(test|live)_CHANGEME/i,
];

const BASE_RULES = [
    { key: "AWS_REGION", label: "AWS Region", pattern: /^[a-z]{2}-[a-z]+-\d$/ },
    {
        key: "API_GATEWAY_URL",
        label: "API Gateway URL",
        pattern: /^https:\/\/.+\.execute-api\..+\.amazonaws\.com\/.+/,
    },
    {
        key: "ALLOWED_ORIGIN",
        label: "Allowed CORS Origin",
        pattern: /^https?:\/\/[^\s/$.?#].[^\s]*$/,
    },
    {
        key: "COGNITO_USER_POOL_ID",
        label: "Cognito User Pool ID",
        pattern: /^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/,
    },
    {
        key: "COGNITO_CLIENT_ID",
        label: "Cognito Client ID",
        pattern: /^[A-Za-z0-9]{10,}$/,
    },
    {
        key: "PAYMENT_MODE",
        label: "Payment mode",
        pattern: /^(disabled|simulated|stripe)$/,
    },
];

const FORBIDDEN_FRONTEND_KEYS = [
    "STRIPE_SECRET_KEY",
    "STRIPE_SECRET_KEY_ARN",
    "STRIPE_WEBHOOK_SECRET",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "BOT_CHALLENGE_SECRET",
    "TURNSTILE_SECRET_KEY",
];

let errors = 0;
let warnings = 0;

console.log("\n🔍  AI Pavilion — Frontend Config Validator");
console.log("─".repeat(62));

for (const key of FORBIDDEN_FRONTEND_KEYS) {
    if (env[key]) {
        console.error(
            `❌  SECRET    ${key.padEnd(35)} must not be stored in frontend env files`,
        );
        errors += 1;
    }
}

for (const rule of BASE_RULES) {
    const value = env[rule.key];
    if (!value) {
        console.error(`❌  MISSING   ${rule.key.padEnd(35)} — ${rule.label}`);
        errors += 1;
        continue;
    }

    if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))) {
        console.error(`❌  PLACEHOLDER  ${rule.key.padEnd(31)} = ${value}`);
        errors += 1;
        continue;
    }

    if (!rule.pattern.test(value)) {
        console.error(`❌  FORMAT    ${rule.key.padEnd(35)} = ${value}`);
        errors += 1;
        continue;
    }

    console.log(`✅  OK        ${rule.key.padEnd(35)} = ${value}`);
}

const botChallengeMode = env.BOT_CHALLENGE_MODE || "disabled";
if (!/^(disabled|simulated|turnstile)$/.test(botChallengeMode)) {
    console.error(
        "❌  FORMAT    BOT_CHALLENGE_MODE                  must be disabled, simulated or turnstile",
    );
    errors += 1;
} else {
    console.log(
        `✅  OK        ${"BOT_CHALLENGE_MODE".padEnd(35)} = ${botChallengeMode}`,
    );
}
if (
    botChallengeMode === "turnstile" &&
    !/^0x[A-Za-z0-9_-]{10,}$/.test(env.TURNSTILE_SITE_KEY || "")
) {
    console.error(
        "❌  TURNSTILE TURNSTILE_SITE_KEY is required in turnstile mode",
    );
    errors += 1;
}

if (env.PAYMENT_MODE === "stripe") {
    if (!/^pk_test_[A-Za-z0-9_]+$/.test(env.STRIPE_PUBLISHABLE_KEY || "")) {
        console.error(
            "❌  STRIPE    STRIPE_PUBLISHABLE_KEY must be a pk_test_ key in Stripe mode",
        );
        errors += 1;
    } else {
        console.log(
            "✅  OK        STRIPE_PUBLISHABLE_KEY              = (test key hidden)",
        );
    }
} else if (env.STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_")) {
    console.warn(
        "⚠️   UNUSED    A live Stripe publishable key is present while Stripe mode is off",
    );
    warnings += 1;
}

if (
    env.NODE_ENV !== "production" &&
    env.ALLOWED_ORIGIN?.startsWith("https://")
) {
    console.log(
        "ℹ️   INFO      Development environment uses an HTTPS allowed origin.",
    );
}

console.log("─".repeat(62));
if (errors > 0) {
    console.error(
        `\n❌  ${errors} error(s) found — fix before running the frontend.\n`,
    );
    process.exit(1);
}
if (warnings > 0) {
    console.warn(`\n⚠️   ${warnings} warning(s) — review before continuing.\n`);
    process.exit(0);
}

console.log("\n✅  Frontend configuration is valid.\n");
