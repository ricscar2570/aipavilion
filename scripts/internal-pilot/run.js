#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");
const { loadPlan, writeJson } = require("./lib");

const map = {
    "security-assessment": ["npm", ["run", "phase4.5g:security"]],
    "tenant-escape": ["npm", ["run", "phase4.5g:tenant-escape"]],
    "failure-injection": ["npm", ["run", "phase4.5g:failure-injection"]],
    "stripe-test-mode": ["npm", ["run", "phase4.5g:stripe"]],
    "ses-delivery": ["npm", ["run", "phase4.5g:ses"]],
    "waf-rate-limit": ["npm", ["run", "phase4.5g:waf"]],
    "load-profile": ["npm", ["run", "phase4.5g:load"]],
    "restore-rpo-rto": ["npm", ["run", "phase4.5g:restore"]],
};

function argValue(name, fallback) {
    const index = process.argv.indexOf(name);
    return index === -1 ? fallback : process.argv[index + 1];
}

const plan = loadPlan();
const requested = argValue("--suite", "all");
const suites =
    requested === "all"
        ? plan.orderedExternalSuites
        : requested
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
const startedAt = new Date().toISOString();
const results = [];
for (const suite of suites) {
    if (!map[suite]) {
        results.push({ suite, status: "FAIL", reason: "unknown suite" });
        continue;
    }
    const [command, args] = map[suite];
    const run = spawnSync(command, args, {
        stdio: "inherit",
        env: process.env,
    });
    results.push({
        suite,
        exitCode: run.status,
        status:
            run.status === 0 ? "PASS" : run.status === 2 ? "PENDING" : "FAIL",
    });
    if (run.status === 1 && !process.argv.includes("--continue-on-failure")) {
        break;
    }
}
const status = results.some((item) => item.status === "FAIL")
    ? "FAIL"
    : results.some((item) => item.status === "PENDING")
      ? "PENDING"
      : "PASS";
const manifest = {
    schemaVersion: 1,
    release: plan.release,
    startedAt,
    completedAt: new Date().toISOString(),
    requested,
    status,
    results,
};
const output = path.resolve(
    process.env.INTERNAL_PILOT_RUN_MANIFEST ||
        "evidence/internal-pilot/runtime/latest-run-manifest.json",
);
writeJson(output, manifest);
process.stdout.write(`${output}\n`);
process.exitCode = status === "PASS" ? 0 : status === "PENDING" ? 2 : 1;
