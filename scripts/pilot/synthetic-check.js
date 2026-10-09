#!/usr/bin/env node
"use strict";
const { readStackOutputs } = require("../dev/stack-outputs");

async function check(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            redirect: "follow",
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(
                `${url} returned ${response.status}: ${text.slice(0, 200)}`,
            );
        }
        return { response, text };
    } finally {
        clearTimeout(timeout);
    }
}

async function run() {
    const backendFile =
        process.env.STACK_OUTPUTS_FILE ||
        ".artifacts/staging-backend-outputs.json";
    const frontendFile =
        process.env.FRONTEND_OUTPUTS_FILE ||
        ".artifacts/staging-frontend-outputs.json";
    const backend = readStackOutputs(backendFile);
    const frontend = readStackOutputs(frontendFile);
    const siteUrl =
        frontend.SiteUrl || `https://${frontend.DistributionDomainName}`;
    const site = await check(siteUrl);
    const csp = site.response.headers.get("content-security-policy") || "";
    if (
        !csp.includes("default-src 'self'") ||
        !csp.includes("frame-ancestors 'none'")
    ) {
        throw new Error("Frontend security headers are missing or incomplete");
    }
    if (!site.text.includes('id="app"')) {
        throw new Error("Frontend shell is not available");
    }
    const api = await check(`${backend.ApiEndpoint}/events`);
    const payload = JSON.parse(api.text);
    if (!Array.isArray(payload.events)) {
        throw new Error("Public events response has an invalid shape");
    }
    const requestId = api.response.headers.get("x-request-id");
    if (!requestId) {
        throw new Error("API correlation header is missing");
    }
    console.log(
        JSON.stringify(
            {
                siteUrl,
                apiEndpoint: backend.ApiEndpoint,
                events: payload.events.length,
                requestId,
            },
            null,
            2,
        ),
    );
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
