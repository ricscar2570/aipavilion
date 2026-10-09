#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const dir = path.resolve(
    process.env.EVIDENCE_DIR || "evidence/phase4.5g/runtime",
);
const required = [
    "tenant-escape",
    "failure-injection",
    "load-profile",
    "stripe-test-mode",
    "ses-delivery",
    "waf-rate-limit",
    "restore-rpo-rto",
    "security-assessment",
];
const reports = fs.existsSync(dir)
    ? fs
          .readdirSync(dir)
          .filter((name) => name.endsWith(".json"))
          .map((name) =>
              JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")),
          )
    : [];
const matrix = required.map((kind) => {
    const matching = reports
        .filter((report) => report.kind === kind)
        .sort((a, b) =>
            String(b.completedAt).localeCompare(String(a.completedAt)),
        );
    return {
        kind,
        status: matching[0]?.status || "MISSING",
        completedAt: matching[0]?.completedAt || null,
    };
});
process.stdout.write(`${JSON.stringify({ matrix }, null, 2)}\n`);
process.exitCode = matrix.every((item) => item.status === "PASS") ? 0 : 2;
