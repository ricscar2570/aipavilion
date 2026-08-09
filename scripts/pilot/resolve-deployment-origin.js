#!/usr/bin/env node
"use strict";

function normalizeOrigin(value, label) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`${label} is not a valid URL: ${value}`);
    }
    if (url.protocol !== "https:") {
        throw new Error(`${label} must use HTTPS: ${value}`);
    }
    if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
        throw new Error(
            `${label} must not contain a path, query or fragment: ${value}`,
        );
    }
    return url.origin;
}

function resolveOriginContext(environment = process.env) {
    const appUrl = String(environment.APP_URL || "").trim();
    const allowedOrigin = String(environment.ALLOWED_ORIGIN || "").trim();
    const domainName = String(environment.DOMAIN_NAME || "").trim();
    const certificateArn = String(
        environment.ACM_CERTIFICATE_ARN || "",
    ).trim();
    const backendStack = String(
        environment.BACKEND_STACK || "ai-pavilion-staging-backend",
    ).trim();

    if (!/^[A-Za-z][A-Za-z0-9-]{0,127}$/.test(backendStack)) {
        throw new Error(`BACKEND_STACK is invalid: ${backendStack}`);
    }
    if (domainName && !certificateArn) {
        throw new Error(
            "ACM_CERTIFICATE_ARN is required when DOMAIN_NAME is set",
        );
    }
    if (!domainName && certificateArn) {
        throw new Error(
            "DOMAIN_NAME is required when ACM_CERTIFICATE_ARN is set",
        );
    }

    let configuredOrigin = "";
    if (appUrl) configuredOrigin = normalizeOrigin(appUrl, "APP_URL");
    if (allowedOrigin) {
        const normalizedAllowed = normalizeOrigin(
            allowedOrigin,
            "ALLOWED_ORIGIN",
        );
        if (configuredOrigin && configuredOrigin !== normalizedAllowed) {
            throw new Error(
                "APP_URL and ALLOWED_ORIGIN must resolve to the same origin",
            );
        }
        configuredOrigin = normalizedAllowed;
    }
    if (domainName) {
        const domainOrigin = normalizeOrigin(
            `https://${domainName}`,
            "DOMAIN_NAME",
        );
        if (configuredOrigin && configuredOrigin !== domainOrigin) {
            throw new Error(
                "APP_URL/ALLOWED_ORIGIN must match DOMAIN_NAME",
            );
        }
        configuredOrigin = domainOrigin;
    }

    return {
        configuredOrigin,
        bootstrapOrigin:
            configuredOrigin || `https://${backendStack}.invalid`,
    };
}

function main() {
    try {
        process.stdout.write(`${JSON.stringify(resolveOriginContext())}\n`);
    } catch (error) {
        console.error(error.message);
        process.exit(2);
    }
}

if (require.main === module) main();

module.exports = { normalizeOrigin, resolveOriginContext };
