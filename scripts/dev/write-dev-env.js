"use strict";

const fs = require("fs");
const { readStackOutputs } = require("./stack-outputs");

const outputs = readStackOutputs();
const region =
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-west-1";
const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";
const allowedOrigin = process.env.ALLOWED_ORIGIN || "http://127.0.0.1:3000";

const lines = [
    "# Generated from the disposable AWS development stack.",
    "# Do not commit this file.",
    "NODE_ENV=development",
    `AWS_REGION=${region}`,
    `APP_URL=${allowedOrigin}`,
    `ALLOWED_ORIGIN=${allowedOrigin}`,
    `API_GATEWAY_URL=${outputs.ApiEndpoint}`,
    `COGNITO_USER_POOL_ID=${outputs.UserPoolId}`,
    `COGNITO_CLIENT_ID=${outputs.UserPoolClientId}`,
    `STRIPE_PUBLISHABLE_KEY=${publishableKey}`,
    "PAYMENT_MODE=simulated",
    "BOT_CHALLENGE_MODE=simulated",
    "TURNSTILE_SITE_KEY=",
    "FEATURE_AR=false",
    "FEATURE_360_TOURS=false",
    "FEATURE_ANALYTICS=false",
    "FEATURE_REVIEWS=false",
    "FEATURE_WISHLIST=true",
    "",
];

fs.writeFileSync(".env.development.local", lines.join("\n"), {
    mode: 0o600,
});
console.log("Wrote .env.development.local from stack outputs.");
