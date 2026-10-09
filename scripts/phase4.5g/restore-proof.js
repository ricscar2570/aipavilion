#!/usr/bin/env node
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const { complete, context, writeEvidence } = require("./lib/evidence");

async function main() {
    const report = context("restore-rpo-rto");
    if (process.env.ALLOW_RESTORE_DRILL !== "true") {
        writeEvidence(
            complete(report, "PENDING", {
                reason: "Set ALLOW_RESTORE_DRILL=true only in the controlled restore account.",
            }),
            "restore-rpo-rto",
        );
        process.exitCode = 2;
        return;
    }
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    if (!pkg.scripts?.["pilot:restore-drill"]) {
        throw new Error("pilot:restore-drill script is not configured.");
    }
    const startedAt = Date.now();
    const result = spawnSync("npm", ["run", "pilot:restore-drill"], {
        encoding: "utf8",
        env: process.env,
        timeout: Number(process.env.RESTORE_PROOF_TIMEOUT_MS || 3600000),
    });
    const completedAt = Date.now();
    const rtoSeconds = Math.round((completedAt - startedAt) / 1000);
    const backupTimestamp = process.env.RESTORE_BACKUP_TIMESTAMP
        ? Date.parse(process.env.RESTORE_BACKUP_TIMESTAMP)
        : NaN;
    const rpoSeconds = Number.isFinite(backupTimestamp)
        ? Math.max(0, Math.round((startedAt - backupTimestamp) / 1000))
        : null;
    const pass = result.status === 0 && rpoSeconds !== null;
    writeEvidence(
        complete(report, pass ? "PASS" : "FAIL", {
            exitCode: result.status,
            rtoSeconds,
            rpoSeconds,
            stdout: result.stdout,
            stderr: result.stderr,
        }),
        "restore-rpo-rto",
    );
    process.exitCode = pass ? 0 : 1;
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
