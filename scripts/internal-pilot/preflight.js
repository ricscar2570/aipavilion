#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const crypto = require("crypto");
const {
    currentCommit,
    currentEnvironment,
    loadPlan,
    redact,
    writeRuntimeEvidence,
} = require("./lib");

function commandAvailable(command, args = ["--version"]) {
    const result = spawnSync(command, args, { encoding: "utf8" });
    return result.status === 0;
}

function productionLike(value) {
    return /(^|[./_-])(prod|production|live)([./_-]|$)/i.test(
        String(value || ""),
    );
}

function checkAwsIdentity() {
    if (!commandAvailable("aws")) {
        return { available: false, identity: null };
    }
    const result = spawnSync(
        "aws",
        ["sts", "get-caller-identity", "--output", "json"],
        {
            encoding: "utf8",
        },
    );
    if (result.status !== 0) {
        return { available: true, identity: null };
    }
    try {
        const body = JSON.parse(result.stdout);
        return {
            available: true,
            identity: {
                account: body.Account || null,
                arn: body.Arn || null,
                userId: body.UserId || null,
            },
        };
    } catch {
        return { available: true, identity: null };
    }
}

const plan = loadPlan();
const commit = currentCommit();
const environment = currentEnvironment();
const startedAt = new Date().toISOString();
const missing = [];
const failures = [];
const tools = {
    node: commandAvailable(process.execPath, ["--version"]),
    npm: commandAvailable("npm", ["--version"]),
    git: commandAvailable("git", ["--version"]),
    aws: commandAvailable("aws", ["--version"]),
    sam: commandAvailable("sam", ["--version"]),
    python3: commandAvailable("python3", ["--version"]),
};
for (const [name, available] of Object.entries(tools)) {
    if (!available) {
        missing.push(`tool:${name}`);
    }
}
if (process.env.ALLOW_INTERNAL_PILOT !== "true") {
    missing.push("ALLOW_INTERNAL_PILOT=true");
}
if (!plan.allowedEnvironments.includes(environment)) {
    failures.push(`environment:${environment}`);
}
const apiUrl = process.env.API_URL || "";
if (productionLike(apiUrl)) {
    failures.push("production-like API_URL refused");
}
if (productionLike(environment)) {
    failures.push("production-like environment refused");
}
if (!process.env.AWS_REGION) {
    missing.push("AWS_REGION");
}
const stripeKey = process.env.STRIPE_SECRET_KEY || "";
if (stripeKey && !stripeKey.startsWith("sk_test_")) {
    failures.push("non-test Stripe key refused");
}
const awsIdentity = checkAwsIdentity();
if (tools.aws && !awsIdentity.identity) {
    missing.push("AWS identity/credentials");
}
const status = failures.length ? "FAIL" : missing.length ? "PENDING" : "PASS";
const record = {
    schemaVersion: 1,
    kind: "internal-pilot-preflight",
    release: plan.release,
    commit,
    environment,
    runId: process.env.GITHUB_RUN_ID || crypto.randomUUID(),
    startedAt,
    completedAt: new Date().toISOString(),
    status,
    summary: redact({
        tools,
        missing,
        failures,
        apiUrlConfigured: Boolean(apiUrl),
        awsIdentity,
        targetGuard: "staging/disposable/internal-pilot only",
    }),
};
const file = writeRuntimeEvidence(record, "internal-pilot-preflight");
process.stdout.write(`${file}\n${JSON.stringify(record.summary, null, 2)}\n`);
if (status === "FAIL") {
    process.exitCode = 1;
} else if (status === "PENDING" && !process.argv.includes("--allow-pending")) {
    process.exitCode = 2;
}
