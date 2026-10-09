#!/usr/bin/env node
"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const { spawnSync } = require("child_process");
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
    "scripts/internal-pilot/export-test-context.js",
    "scripts/internal-pilot/prepare-staging-fixtures.sh",
    ".github/workflows/internal-pilot.yml",
    "docs/operations/INTERNAL-PILOT-RUNBOOK.md",
    "tests/node/internal-pilot-gate.test.js",
]) {
    assert.ok(fs.existsSync(file), `missing internal-pilot asset ${file}`);
}

const workflow = fs.readFileSync(".github/workflows/internal-pilot.yml", "utf8");
assert.match(workflow, /EVIDENCE_ENVIRONMENT: internal-pilot/);
assert.match(workflow, /ENVIRONMENT: staging/);
assert.match(workflow, /aws-actions\/setup-sam@v2/);
assert.match(workflow, /actions\/setup-python@v5/);
assert.match(workflow, /RUN_DEPLOYED_INTEGRATION: "1"/);
assert.match(workflow, /prepare-staging-fixtures\.sh/);
assert.match(workflow, /TENANT_ESCAPE_MATRIX_JSON/);
assert.match(workflow, /FAILURE_INJECTION_CASES_JSON/);
assert.match(workflow, /npm run manifest:verify/);
assert.match(workflow, /npm run test:e2e:deployed/);
const fixtureSyntax = spawnSync(
    "bash",
    ["-n", "scripts/internal-pilot/prepare-staging-fixtures.sh"],
    { encoding: "utf8" },
);
assert.equal(
    fixtureSyntax.status,
    0,
    fixtureSyntax.stderr || "internal-pilot fixture script has invalid shell syntax",
);

const promotion = fs.readFileSync("scripts/internal-pilot/promote.js", "utf8");
assert.match(promotion, /promotionEligible/);
assert.match(promotion, /production: false/);
assert.match(promotion, /customerData: false/);
console.log(
    `Internal-pilot contract passed: ${machineKinds.size} machine gates and ${manualKinds.size} manual approvals are mandatory.`,
);
