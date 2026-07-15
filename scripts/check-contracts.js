#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const templatePath = path.join(root, "template.yaml");
const template = fs.readFileSync(templatePath, "utf8");
const lines = template.split(/\r?\n/);
const errors = [];

function fail(message) {
    errors.push(message);
}

function normalizeRoute(route) {
    return route.replace(/\{[^}]+\}/g, "{}");
}

// Collect API route/method pairs and verify sensitive routes declare an authorizer.
const routes = [];
for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s+Path:\s+(\S+)\s*$/);
    if (!match) {
        continue;
    }

    const route = match[1];
    const nearby = lines.slice(index, index + 12).join("\n");
    const methodMatch = nearby.match(/^\s+Method:\s+(\S+)\s*$/m);
    if (!methodMatch) {
        fail(`Route ${route} has no Method in its event block.`);
        continue;
    }

    const method = methodMatch[1].toUpperCase();
    routes.push({ route, method, nearby });

    const isProtected =
        route.startsWith("/admin/") ||
        route.startsWith("/user/") ||
        route.startsWith("/platform/") ||
        route.startsWith("/organizations/") ||
        route.startsWith("/me/") ||
        route.startsWith("/exhibitor/") ||
        route.startsWith("/invitations/") ||
        [
            "/checkout/create-intent",
            "/checkout/confirm-order",
            "/checkout/order/{orderId}",
        ].includes(route);

    if (isProtected && !nearby.includes("Authorizer: CognitoAuthorizer")) {
        fail(
            `Protected route ${method} ${route} does not declare CognitoAuthorizer.`,
        );
    }
}

const seenRouteMethods = new Set();
for (const { route, method } of routes) {
    const key = `${method} ${route}`;
    if (seenRouteMethods.has(key)) {
        fail(`Duplicate API event: ${key}`);
    }
    seenRouteMethods.add(key);
}

const requiredRoutes = [
    ["GET", "/stands"],
    ["GET", "/stands/{standId}"],
    ["GET", "/stands/search"],
    ["POST", "/stands/contact"],
    ["POST", "/interactions"],
    ["POST", "/checkout/create-intent"],
    ["POST", "/checkout/confirm-order"],
    ["GET", "/checkout/order/{orderId}"],
    ["POST", "/checkout/webhook"],
    ["GET", "/user/orders"],
    ["GET", "/user/stats"],
    ["GET", "/user/saved-stands"],
    ["POST", "/user/saved-stands"],
    ["DELETE", "/user/saved-stands/{standId}"],
    ["DELETE", "/user/account"],
    ["GET", "/admin/dashboard"],
    ["ANY", "/admin/stands"],
    ["ANY", "/admin/stands/{standId}"],
    ["GET", "/admin/users"],
    ["GET", "/admin/orders"],
    ["GET", "/admin/analytics"],
    ["GET", "/me/memberships"],
    ["POST", "/platform/organizations"],
    ["ANY", "/organizations/{organizationId}"],
    ["ANY", "/organizations/{organizationId}/memberships"],
    ["ANY", "/organizations/{organizationId}/memberships/{userId}"],
    ["GET", "/organizations/{organizationId}/entitlement"],
    ["ANY", "/organizations/{organizationId}/events"],
    ["ANY", "/organizations/{organizationId}/events/{eventId}"],
    ["POST", "/organizations/{organizationId}/events/{eventId}/publish"],
    ["POST", "/organizations/{organizationId}/events/{eventId}/duplicate"],
    ["POST", "/organizations/{organizationId}/events/{eventId}/archive"],
    ["GET", "/organizations/{organizationId}/events/{eventId}/stands"],
    [
        "PATCH",
        "/organizations/{organizationId}/events/{eventId}/stands/{standId}/moderation",
    ],
    ["ANY", "/organizations/{organizationId}/events/{eventId}/invitations"],
    [
        "ANY",
        "/organizations/{organizationId}/events/{eventId}/invitations/{invitationId}",
    ],
    [
        "POST",
        "/organizations/{organizationId}/events/{eventId}/invitations/{invitationId}/resend",
    ],
    ["POST", "/invitations/{invitationId}/accept"],
    ["GET", "/exhibitor/stands"],
    ["ANY", "/exhibitor/stands/{standId}"],
    ["POST", "/exhibitor/stands/{standId}/submit"],
    ["GET", "/exhibitor/leads"],
    ["GET", "/exhibitor/leads/export"],
    ["PATCH", "/exhibitor/leads/{leadId}"],
    ["GET", "/events"],
    ["GET", "/events/{eventId}"],
    ["GET", "/events/{eventId}/stands"],
    ["GET", "/organizations/{organizationId}/billing"],
    ["POST", "/organizations/{organizationId}/billing/checkout"],
    ["POST", "/organizations/{organizationId}/billing/portal"],
    ["POST", "/billing/webhook"],
    ["GET", "/organizations/{organizationId}/audit"],
    ["GET", "/user/export"],
];

for (const [method, route] of requiredRoutes) {
    if (!seenRouteMethods.has(`${method} ${route}`)) {
        fail(`Required route missing from template: ${method} ${route}`);
    }
}

// Verify every Lambda handler and esbuild entry point resolves to an actual source file.
const referencedSources = new Set();
let currentCodeUri = null;
for (const line of lines) {
    const codeUriMatch = line.match(/^\s+CodeUri:\s+(\S+)\s*$/);
    if (codeUriMatch) {
        currentCodeUri = codeUriMatch[1];
        continue;
    }

    const handlerMatch = line.match(/^\s+Handler:\s+(\S+)\s*$/);
    if (handlerMatch && currentCodeUri) {
        const handlerFile = handlerMatch[1].replace(/\.handler$/, ".js");
        const absolute = path.join(root, currentCodeUri, handlerFile);
        referencedSources.add(path.normalize(absolute));
        if (!fs.existsSync(absolute)) {
            fail(
                `Handler source does not exist: ${path.relative(root, absolute)}`,
            );
        }
    }

    const entryMatch = line.match(/^\s+EntryPoints:\s+\[([^\]]+)\]\s*$/);
    if (entryMatch && currentCodeUri) {
        for (const entry of entryMatch[1]
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)) {
            const absolute = path.join(root, currentCodeUri, entry);
            referencedSources.add(path.normalize(absolute));
            if (!fs.existsSync(absolute)) {
                fail(
                    `esbuild entry point does not exist: ${path.relative(root, absolute)}`,
                );
            }
        }
    }
}

const lambdaRoot = path.join(root, "backend", "lambda");
for (const directory of fs.readdirSync(lambdaRoot, { withFileTypes: true })) {
    if (!directory.isDirectory() || directory.name === "common") {
        continue;
    }
    const source = path.normalize(
        path.join(lambdaRoot, directory.name, "index.js"),
    );
    if (fs.existsSync(source) && !referencedSources.has(source)) {
        fail(
            `Orphan Lambda source is not referenced by template.yaml: ${path.relative(root, source)}`,
        );
    }
}

// Cross-check frontend endpoint constants against the infrastructure routes.
const constantsPath = path.join(
    root,
    "frontend",
    "src",
    "core",
    "constants.js",
);
const constants = fs.readFileSync(constantsPath, "utf8");
const endpointMatches = [
    ...constants.matchAll(/:\s*['"](\/[a-zA-Z0-9_/{}-]+)['"]/g),
].map((match) => match[1]);
const normalizedTemplateRoutes = new Set(
    routes.map(({ route }) => normalizeRoute(route)),
);
for (const endpoint of endpointMatches) {
    const normalized = normalizeRoute(endpoint);
    const isPrefixEndpoint = [...normalizedTemplateRoutes].some((route) =>
        route.startsWith(`${normalized}/`),
    );
    if (!normalizedTemplateRoutes.has(normalized) && !isPrefixEndpoint) {
        fail(
            `Frontend endpoint has no matching infrastructure route: ${endpoint}`,
        );
    }
}

if (errors.length > 0) {
    console.error("Contract check failed:\n");
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exit(1);
}

console.log(
    `Contract check passed: ${routes.length} API events and ${referencedSources.size} Lambda sources verified.`,
);
