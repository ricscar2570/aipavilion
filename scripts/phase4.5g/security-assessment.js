#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const { complete, context, writeEvidence } = require("./lib/evidence");

const ROOTS = ["backend", "frontend", "infrastructure", "template.yaml"];
const findings = [];
function walk(target) {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
        for (const name of fs.readdirSync(target)) {
            if (["node_modules", ".git", "dist", "coverage"].includes(name)) {
                continue;
            }
            walk(path.join(target, name));
        }
    } else if (/\.(js|mjs|html|yaml|yml|json)$/.test(target)) {
        scan(target);
    }
}
function finding(file, severity, rule, excerpt) {
    findings.push({ file, severity, rule, excerpt: excerpt.slice(0, 180) });
}
function scan(file) {
    const text = fs.readFileSync(file, "utf8");
    const rules = [
        [
            "HIGH",
            "live-secret",
            /(?:sk_live_|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/g,
        ],
        ["HIGH", "unsafe-eval", /['"]unsafe-eval['"]/g],
        [
            "HIGH",
            "wildcard-cors",
            /Access-Control-Allow-Origin[^\n]{0,80}['"]\*['"]/g,
        ],
        ["MEDIUM", "inline-handler", /\son(?:click|error|load)=/gi],
        [
            "MEDIUM",
            "event-log",
            /console\.(?:log|info)\([^\n]*(?:event|authorization|token)/gi,
        ],
    ];
    for (const [severity, rule, regex] of rules) {
        for (const match of text.matchAll(regex)) {
            finding(file, severity, rule, match[0]);
        }
    }
}
async function main() {
    const report = context("security-assessment");
    for (const target of ROOTS) {
        if (fs.existsSync(target)) {
            walk(target);
        }
    }
    const high = findings.filter((item) => item.severity === "HIGH");
    const status = high.length ? "FAIL" : "PASS";
    writeEvidence(
        complete(report, status, {
            findings,
            counts: {
                high: high.length,
                medium: findings.length - high.length,
            },
        }),
        "security-assessment",
    );
    process.exitCode = status === "PASS" ? 0 : 1;
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
