#!/usr/bin/env node
"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const plan = require("../config/internal-pilot-plan.json");
const packageJson = require("../package.json");

assert.equal(plan.schemaVersion, 1);
assert.equal(plan.release, packageJson.version);
assert.ok(plan.allowedEnvironments.includes("staging"));
assert.equal(
    plan.allowedEnvironments.some((item) => /prod|live/i.test(item)),
    false,
);
const machineKinds = new Set(plan.machineEvidence.map((item) => item.kind));
const manualKinds = new Set(plan.manualApprovals.map((item) => item.kind));
assert.equal(machineKinds.size, plan.machineEvidence.length);
assert.equal(manualKinds.size, plan.manualApprovals.length);
for (const kind of [
    "dependency-ci",
    "sam-build",
    "aws-deployment",
    "auth-aws",
    "tenant-escape",
    "failure-injection",
    "stripe-test-mode",
    "ses-delivery",
    "waf-rate-limit",
    "load-profile",
    "restore-rpo-rto",
]) {
    assert.ok(machineKinds.has(kind), `missing machine gate ${kind}`);
}
for (const file of [
    "scripts/internal-pilot/lib.js",
    "scripts/internal-pilot/preflight.js",
    "scripts/internal-pilot/command-proof.js",
    "scripts/internal-pilot/status.js",
    "scripts/internal-pilot/promote.js",
    "scripts/internal-pilot/run.js",
    ".github/workflows/internal-pilot.yml",
    "docs/operations/INTERNAL-PILOT-RUNBOOK.md",
    "tests/node/internal-pilot-gate.test.js",
]) {
    assert.ok(fs.existsSync(file), `missing internal-pilot asset ${file}`);
}
const promotion = fs.readFileSync("scripts/internal-pilot/promote.js", "utf8");
assert.match(promotion, /promotionEligible/);
assert.match(promotion, /production: false/);
assert.match(promotion, /customerData: false/);
console.log(
    `Internal-pilot contract passed: ${machineKinds.size} machine gates and ${manualKinds.size} manual approvals are mandatory.`,
);
