#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const errors = [];

function read(relative) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) {
        errors.push(`Missing Sprint 4.5C file: ${relative}`);
        return "";
    }
    return fs.readFileSync(absolute, "utf8");
}

function requireText(content, needle, label = needle) {
    if (!content.includes(needle)) {
        errors.push(`Missing Sprint 4.5C contract: ${label}`);
    }
}

const packageJson = JSON.parse(read("package.json") || "{}");
const template = read("template.yaml");
const pilot = read("infrastructure/backend-pilot.yaml");
const openapi = read("docs/api/openapi.json");
const auth = read("frontend/src/account/auth.js");
const app = read("frontend/src/app.js");
const dashboard = read("frontend/src/account/dashboard.js");
const validators = read("frontend/src/core/validators.js");
const accountHandler = read("backend/lambda/user-account/index.js");
const organizations = read("backend/lambda/organizations/index.js");
const events = read("backend/lambda/events/index.js");

const versionParts = String(packageJson.version || "")
    .split("-", 1)[0]
    .split(".")
    .map(Number);
const versionNumber =
    versionParts.length === 3
        ? versionParts[0] * 1_000_000 +
          versionParts[1] * 1_000 +
          versionParts[2]
        : -1;
if (versionNumber < 8_003) {
    errors.push(
        `Expected package version 0.8.3 or later, found ${packageJson.version || "missing"}.`,
    );
}

for (const content of [template, pilot]) {
    requireText(content, "MfaConfiguration: OPTIONAL");
    requireText(content, "- SOFTWARE_TOKEN_MFA");
    requireText(
        content,
        "Path: /organizations/{organizationId}/ownership-transfer",
    );
    requireText(
        content,
        "Path: /organizations/{organizationId}/events/{eventId}/stands/{standId}/assignment",
    );
    requireText(content, "Path: /user/account");
    requireText(content, "Method: GET");
    requireText(content, "Method: DELETE");
    requireText(content, "MEMBERSHIPS_TABLE: !Ref MembershipsTable");
    requireText(content, "STANDS_TABLE: !Ref StandsTable");
    requireText(content, "OWNER_STANDS_INDEX: owner-stands-index");
}

for (const route of [
    '"/user/account"',
    '"/organizations/{organizationId}/ownership-transfer"',
    '"/organizations/{organizationId}/events/{eventId}/stands/{standId}/assignment"',
]) {
    requireText(openapi, route);
}

for (const challenge of ["NEW_PASSWORD_REQUIRED", "MFA_REQUIRED"]) {
    requireText(auth, challenge);
    requireText(app, challenge);
}
requireText(auth, "SOFTWARE_TOKEN_MFA");

for (const method of [
    "completeNewPassword",
    "completeMfa",
    "confirmPassword",
    "changePassword",
    "beginTotpSetup",
    "completeTotpSetup",
    "disableTotp",
]) {
    requireText(auth, method);
}
requireText(dashboard, "beginTotpSetup");
requireText(dashboard, "disableTotp");
requireText(dashboard, 'apiService.get("/user/account")');

for (const passwordRule of [
    "password.length < 12",
    "/[a-z]/",
    "/[A-Z]/",
    "/\\d/",
    "/[^A-Za-z0-9]/",
]) {
    requireText(validators, passwordRule);
}

for (const blocker of [
    "OWNERSHIP_TRANSFER_REQUIRED",
    "STAND_REASSIGNMENT_REQUIRED",
]) {
    requireText(accountHandler, blocker);
}
requireText(accountHandler, 'event.httpMethod === "GET"');
requireText(accountHandler, '["GET", "DELETE"].includes(event.httpMethod)');
requireText(accountHandler, "deleteMemberships");
requireText(accountHandler, "anonymizeOrders");

requireText(organizations, "transferOrganizationOwnership");
requireText(organizations, "TransactWriteCommand");
requireText(events, "reassignStand");
requireText(events, "TransactWriteCommand");

for (const testFile of [
    "tests/unit/auth-lifecycle.test.js",
    "tests/unit/user-account.test.js",
    "tests/unit/phase3-endpoints.test.js",
]) {
    read(testFile);
}

if (errors.length) {
    console.error("Sprint 4.5C asset check failed:\n");
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exit(1);
}

console.log(
    "Sprint 4.5C asset check passed: Cognito challenges, ownership transfer, stand reassignment and deletion blockers verified.",
);
