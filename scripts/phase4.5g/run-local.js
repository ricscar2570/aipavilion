#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");

const required = [
    "scripts/phase4.5g/check-all-js.js",
    "scripts/phase4.5g/check-foundations.js",
    "scripts/phase4.5g/tenant-escape.js",
    "scripts/phase4.5g/failure-injection.js",
    "scripts/phase4.5g/load-profile.js",
    "scripts/phase4.5g/stripe-proof.js",
    "scripts/phase4.5g/ses-proof.js",
    "scripts/phase4.5g/waf-proof.js",
    "scripts/phase4.5g/restore-proof.js",
    "scripts/phase4.5g/security-assessment.js",
    "config/phase4.5g-evidence.schema.json",
    "docs/development/SPRINT-4.5G.md",
    "tests/node/phase4.5g-foundations.test.js",
    "tests/node/phase4.5f-runtime-integration.test.js",
    "tests/node/phase4.5f-events-saga.test.js",
];

const missing = required.filter((file) => !fs.existsSync(file));
if (missing.length) {
    console.error(`Missing 4.5G files: ${missing.join(", ")}`);
    process.exit(1);
}

function run(label, command, args) {
    console.log(`\n== ${label} ==`);
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

run("All runtime JavaScript parses", process.execPath, [
    "scripts/phase4.5g/check-all-js.js",
]);
run("4.5F/4.5G runtime contract", process.execPath, [
    "scripts/phase4.5g/check-foundations.js",
]);
run("4.5F runtime integration tests", process.execPath, [
    "--test",
    "tests/node/phase4.5f-runtime-integration.test.js",
]);
run("4.5F publishing saga handler test", process.execPath, [
    "--test",
    "tests/node/phase4.5f-events-saga.test.js",
]);
run("4.5G foundation tests", process.execPath, [
    "--test",
    "tests/node/phase4.5g-foundations.test.js",
]);
run("Static security assessment", process.execPath, [
    "scripts/phase4.5g/security-assessment.js",
]);

console.log("\nPASS: local 4.5G source gate completed.");
