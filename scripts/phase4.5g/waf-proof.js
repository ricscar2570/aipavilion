#!/usr/bin/env node
"use strict";
const {
    complete,
    context,
    fetchTimed,
    writeEvidence,
} = require("./lib/evidence");

async function main() {
    const report = context("waf-rate-limit");
    if (!process.env.WAF_PROOF_URL || process.env.ALLOW_WAF_PROOF !== "true") {
        writeEvidence(
            complete(report, "PENDING", {
                reason: "WAF_PROOF_URL and explicit permission are required.",
            }),
            "waf-rate-limit",
        );
        process.exitCode = 2;
        return;
    }
    const count = Number(process.env.WAF_PROOF_REQUESTS || 250);
    const concurrency = Number(process.env.WAF_PROOF_CONCURRENCY || 20);
    const queue = Array.from({ length: count });
    const results = [];
    async function worker() {
        while (queue.length) {
            queue.pop();
            try {
                results.push(
                    await fetchTimed(process.env.WAF_PROOF_URL, {}, 10000),
                );
            } catch (error) {
                results.push({ status: 0, error: error.name });
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    const blocked = results.filter((item) =>
        [403, 429].includes(item.status),
    ).length;
    const serverErrors = results.filter(
        (item) => item.status >= 500 || item.status === 0,
    ).length;
    const pass = blocked > 0 && serverErrors === 0;
    writeEvidence(
        complete(report, pass ? "PASS" : "FAIL", {
            requests: count,
            concurrency,
            blocked,
            serverErrors,
            statuses: results.reduce((a, x) => {
                a[x.status] = (a[x.status] || 0) + 1;
                return a;
            }, {}),
        }),
        "waf-rate-limit",
    );
    process.exitCode = pass ? 0 : 1;
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
