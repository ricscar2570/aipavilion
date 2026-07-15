#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const packageJson = require(path.join(root, "package.json"));
const spec = JSON.parse(
    fs.readFileSync(path.join(root, "docs", "api", "openapi.json"), "utf8"),
);
const template = fs.readFileSync(path.join(root, "template.yaml"), "utf8");
const lines = template.split(/\r?\n/);
const errors = [];
const operations = new Set(["get", "post", "put", "patch", "delete"]);
const operationIds = new Set();

if (spec.openapi !== "3.1.0") {
    errors.push("OpenAPI version must be 3.1.0");
}
if (spec.info?.version !== packageJson.version) {
    errors.push(
        `OpenAPI info.version ${spec.info?.version} does not match package ${packageJson.version}`,
    );
}

const templateRoutes = [];
for (let i = 0; i < lines.length; i += 1) {
    const pathMatch = lines[i].match(/^\s+Path:\s+(\S+)\s*$/);
    if (!pathMatch) {
        continue;
    }
    const nearby = lines.slice(i, i + 12).join("\n");
    const method = nearby.match(/^\s+Method:\s+(\S+)\s*$/m)?.[1]?.toLowerCase();
    templateRoutes.push({ route: pathMatch[1], method });
}

for (const [route, pathItem] of Object.entries(spec.paths || {})) {
    for (const operation of operations) {
        const definition = pathItem[operation];
        if (!definition) {
            continue;
        }
        if (!definition.operationId) {
            errors.push(
                `Missing operationId: ${operation.toUpperCase()} ${route}`,
            );
        } else if (operationIds.has(definition.operationId)) {
            errors.push(`Duplicate operationId: ${definition.operationId}`);
        } else {
            operationIds.add(definition.operationId);
        }
        const responses = definition.responses || {};
        if (Object.keys(responses).length === 0) {
            errors.push(
                `No responses documented: ${operation.toUpperCase()} ${route}`,
            );
        }
        for (const [status, response] of Object.entries(responses)) {
            if (!response.description) {
                errors.push(
                    `Response ${status} has no description: ${operation.toUpperCase()} ${route}`,
                );
            }
        }
        if (
            ["post", "put", "patch"].includes(operation) &&
            route !== "/checkout/webhook"
        ) {
            const schema =
                definition.requestBody?.content?.["application/json"]?.schema;
            if (!definition.requestBody?.required || !schema) {
                errors.push(
                    `JSON request schema missing: ${operation.toUpperCase()} ${route}`,
                );
            }
        }
        const pathParameters = [...route.matchAll(/\{([^}]+)\}/g)].map(
            (match) => match[1],
        );
        const parameters = [
            ...(pathItem.parameters || []),
            ...(definition.parameters || []),
        ];
        for (const parameterName of pathParameters) {
            const parameter = parameters.find(
                (candidate) =>
                    candidate.name === parameterName && candidate.in === "path",
            );
            if (!parameter?.required) {
                errors.push(
                    `Required path parameter ${parameterName} is undocumented: ${operation.toUpperCase()} ${route}`,
                );
            }
        }
    }
}

const idempotentOperations = [
    ["/stands/contact", "post", "Idempotency-Key"],
    ["/checkout/create-intent", "post", "Idempotency-Key"],
    [
        "/organizations/{organizationId}/billing/checkout",
        "post",
        "Idempotency-Key",
    ],
    ["/interactions", "post", "X-Interaction-Id"],
];
for (const [route, operation, headerName] of idempotentOperations) {
    const parameters = spec.paths?.[route]?.[operation]?.parameters || [];
    const refName =
        headerName === "X-Interaction-Id" ? "InteractionId" : "IdempotencyKey";
    const documented = parameters.some(
        (parameter) =>
            parameter.name === headerName ||
            parameter.$ref === `#/components/parameters/${refName}`,
    );
    if (!documented) {
        errors.push(
            `Required idempotency header missing: ${operation.toUpperCase()} ${route}`,
        );
    }
}

for (const { route, method } of templateRoutes) {
    const pathItem = spec.paths?.[route];
    if (!pathItem) {
        errors.push(`Infrastructure route missing from OpenAPI: ${route}`);
        continue;
    }
    if (method === "any") {
        if (![...operations].some((operation) => pathItem[operation])) {
            errors.push(`ANY route ${route} has no documented operation`);
        }
    } else if (!pathItem[method]) {
        errors.push(
            `Operation missing from OpenAPI: ${method?.toUpperCase()} ${route}`,
        );
    }
}

const templatePathSet = new Set(templateRoutes.map(({ route }) => route));
for (const route of Object.keys(spec.paths || {})) {
    if (!templatePathSet.has(route)) {
        errors.push(`OpenAPI path has no infrastructure route: ${route}`);
    }
}

function verifyRefs(value, location = "#") {
    if (!value || typeof value !== "object") {
        return;
    }
    if (typeof value.$ref === "string" && value.$ref.startsWith("#/")) {
        const parts = value.$ref.slice(2).split("/");
        let target = spec;
        for (const part of parts) {
            target = target?.[part];
        }
        if (target === undefined) {
            errors.push(`Broken $ref at ${location}: ${value.$ref}`);
        }
    }
    for (const [key, child] of Object.entries(value)) {
        verifyRefs(child, `${location}/${key}`);
    }
}
verifyRefs(spec);

const protectedPrefixes = [
    "/user/",
    "/admin/",
    "/platform/",
    "/organizations/",
    "/me/",
    "/exhibitor/",
    "/invitations/",
];
const protectedExact = new Set([
    "/checkout/create-intent",
    "/checkout/confirm-order",
    "/checkout/order/{orderId}",
]);
for (const [route, pathItem] of Object.entries(spec.paths || {})) {
    const isProtected =
        protectedExact.has(route) ||
        protectedPrefixes.some((prefix) => route.startsWith(prefix));
    if (!isProtected) {
        continue;
    }
    for (const operation of operations) {
        if (pathItem[operation] && !pathItem[operation].security) {
            errors.push(
                `Protected OpenAPI operation has no security: ${operation.toUpperCase()} ${route}`,
            );
        }
    }
}

if (errors.length) {
    console.error("OpenAPI contract check failed:\n");
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exit(1);
}
console.log(
    `OpenAPI contract check passed: ${Object.keys(spec.paths).length} paths documented.`,
);
