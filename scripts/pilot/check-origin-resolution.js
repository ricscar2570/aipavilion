#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { resolveOriginContext } = require("./resolve-deployment-origin");

const generated = resolveOriginContext({
    BACKEND_STACK: "ai-pavilion-staging-backend",
});
assert.deepStrictEqual(generated, {
    configuredOrigin: "",
    bootstrapOrigin: "https://ai-pavilion-staging-backend.invalid",
});

const custom = resolveOriginContext({
    BACKEND_STACK: "ai-pavilion-staging-backend",
    DOMAIN_NAME: "staging.example.com",
    ACM_CERTIFICATE_ARN: "arn:aws:acm:us-east-1:123456789012:certificate/test",
    APP_URL: "https://staging.example.com/",
    ALLOWED_ORIGIN: "https://staging.example.com",
});
assert.deepStrictEqual(custom, {
    configuredOrigin: "https://staging.example.com",
    bootstrapOrigin: "https://staging.example.com",
});

assert.throws(
    () =>
        resolveOriginContext({
            APP_URL: "https://one.example.com",
            ALLOWED_ORIGIN: "https://two.example.com",
        }),
    /same origin/,
);
assert.throws(
    () => resolveOriginContext({ APP_URL: "http://staging.example.com" }),
    /must use HTTPS/,
);
assert.throws(
    () =>
        resolveOriginContext({
            ACM_CERTIFICATE_ARN:
                "arn:aws:acm:us-east-1:123456789012:certificate/test",
        }),
    /DOMAIN_NAME is required/,
);

console.log(
    "Pilot origin-resolution check passed: generated CloudFront and custom-domain paths are coherent.",
);
