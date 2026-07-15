#!/usr/bin/env node
"use strict";
const fs = require("fs");
const { readStackOutputs } = require("../dev/stack-outputs");
const backend = readStackOutputs(".artifacts/staging-backend-outputs.json");
const frontend = readStackOutputs(".artifacts/staging-frontend-outputs.json");
const values = {
    APP_URL:
        process.env.APP_URL ||
        process.env.ALLOWED_ORIGIN ||
        frontend.SiteUrl ||
        "",
    ALLOWED_ORIGIN:
        process.env.ALLOWED_ORIGIN ||
        process.env.APP_URL ||
        frontend.SiteUrl ||
        "",
    API_GATEWAY_URL: backend.ApiEndpoint,
    COGNITO_USER_POOL_ID: backend.UserPoolId,
    COGNITO_CLIENT_ID: backend.UserPoolClientId,
    AWS_REGION: process.env.AWS_REGION || "eu-west-1",
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || "",
    PAYMENT_MODE: "stripe",
    CLOUDFRONT_DOMAIN: frontend.DistributionDomainName || "",
    FEATURE_AR: "false",
    FEATURE_360_TOURS: "false",
    FEATURE_ANALYTICS: "true",
    FEATURE_REVIEWS: "false",
    FEATURE_WISHLIST: "true",
    BOT_CHALLENGE_MODE: process.env.BOT_CHALLENGE_MODE || "turnstile",
    TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY || "",
    NODE_ENV: process.env.ENVIRONMENT || "staging",
};
const content = Object.entries(values)
    .map(([key, value]) => `${key}=${String(value).replace(/\n/g, "")}`)
    .join("\n");
fs.writeFileSync(".env.production.local", `${content}\n`, { mode: 0o600 });
console.log("Wrote .env.production.local from stack outputs.");
