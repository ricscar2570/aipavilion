#!/usr/bin/env node
"use strict";
const fs = require("fs");
const {
    complete,
    context,
    fetchTimed,
    writeEvidence,
} = require("./lib/evidence");

async function main() {
    const report = context("tenant-escape");
    const matrixFile =
        process.env.TENANT_ESCAPE_MATRIX_FILE ||
        "config/phase4.5g-tenant-escape.example.json";
    if (!process.env.API_URL || !fs.existsSync(matrixFile)) {
        writeEvidence(
            complete(report, "PENDING", {
                reason: "API_URL and a populated tenant-escape matrix are required.",
            }),
            "tenant-escape",
        );
        process.exitCode = 2;
        return;
    }
    const base = process.env.API_URL.replace(/\/$/, "");
    const config = JSON.parse(fs.readFileSync(matrixFile, "utf8"));
    const results = [];
    for (const item of config.cases || []) {
        const token = process.env[item.tokenEnv || ""];
        if (!token || /REPLACE_ME/.test(item.path || "")) {
            results.push({
                name: item.name,
                status: "SKIPPED",
                reason: "Fixture/token not configured",
            });
            continue;
        }
        const response = await fetchTimed(
            `${base}${item.path}`,
            {
                method: item.method || "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    ...(item.headers || {}),
                },
                body:
                    item.body === undefined
                        ? undefined
                        : JSON.stringify(item.body),
            },
            Number(process.env.PROBE_TIMEOUT_MS || 15000),
        );
        const allowed = item.expectedStatuses || [403, 404];
        const serialized = JSON.stringify(response.body || "");
        const leaks = (item.forbiddenSubstrings || []).filter((needle) =>
            serialized.includes(needle),
        );
        results.push({
            name: item.name,
            response,
            pass: allowed.includes(response.status) && leaks.length === 0,
            leaks,
        });
    }
    const executable = results.filter((item) => item.status !== "SKIPPED");
    const failures = executable.filter((item) => !item.pass);
    const status =
        executable.length === 0 ? "PENDING" : failures.length ? "FAIL" : "PASS";
    writeEvidence(
        complete(report, status, {
            executed: executable.length,
            skipped: results.length - executable.length,
            failures,
            results,
        }),
        "tenant-escape",
    );
    process.exitCode = status === "PASS" ? 0 : status === "PENDING" ? 2 : 1;
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
