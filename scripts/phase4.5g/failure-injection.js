#!/usr/bin/env node
"use strict";
const fs = require("fs");
const crypto = require("crypto");
const {
    complete,
    context,
    fetchTimed,
    writeEvidence,
} = require("./lib/evidence");

async function main() {
    const report = context("failure-injection");
    const file =
        process.env.FAILURE_INJECTION_CASES_FILE ||
        "config/phase4.5g-failure-injection.example.json";
    if (!process.env.API_URL || !fs.existsSync(file)) {
        writeEvidence(
            complete(report, "PENDING", {
                reason: "API_URL and configured failure cases are required.",
            }),
            "failure-injection",
        );
        process.exitCode = 2;
        return;
    }
    const base = process.env.API_URL.replace(/\/$/, "");
    const cases = JSON.parse(fs.readFileSync(file, "utf8")).cases || [];
    const results = [];
    for (const test of cases) {
        if (/REPLACE_ME/.test(test.path || "")) {
            results.push({ name: test.name, status: "SKIPPED" });
            continue;
        }
        const token = process.env[test.tokenEnv || ""];
        const idempotencyKey = test.idempotencyKey || crypto.randomUUID();
        const headers = {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
            ...(test.headers || {}),
        };
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        let first;
        if (test.abortFirstAfterMs) {
            try {
                first = await fetchTimed(
                    `${base}${test.path}`,
                    {
                        method: test.method || "POST",
                        headers,
                        body: JSON.stringify(test.body || {}),
                    },
                    test.abortFirstAfterMs,
                );
            } catch (error) {
                first = {
                    aborted: error.name === "AbortError",
                    name: error.name,
                };
            }
        } else {
            first = await fetchTimed(`${base}${test.path}`, {
                method: test.method || "POST",
                headers,
                body: JSON.stringify(test.body || {}),
            });
        }
        const replay = await fetchTimed(`${base}${test.path}`, {
            method: test.method || "POST",
            headers,
            body: JSON.stringify(test.body || {}),
        });
        const expected = test.expectedReplayStatuses || [200, 201, 202, 409];
        const pass = expected.includes(replay.status) && replay.status < 500;
        results.push({ name: test.name, first, replay, pass });
    }
    const executable = results.filter((item) => item.status !== "SKIPPED");
    const failures = executable.filter((item) => !item.pass);
    const status =
        executable.length === 0 ? "PENDING" : failures.length ? "FAIL" : "PASS";
    writeEvidence(
        complete(report, status, {
            executed: executable.length,
            failures,
            results,
        }),
        "failure-injection",
    );
    process.exitCode = status === "PASS" ? 0 : status === "PENDING" ? 2 : 1;
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
