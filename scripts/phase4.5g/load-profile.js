#!/usr/bin/env node
"use strict";
const fs = require("fs");
const {
    complete,
    context,
    fetchTimed,
    percentile,
    writeEvidence,
} = require("./lib/evidence");

async function main() {
    const report = context("load-profile");
    const file =
        process.env.LOAD_PROFILE_FILE || "config/phase4.5g-load-profile.json";
    if (!process.env.API_URL || !fs.existsSync(file)) {
        writeEvidence(
            complete(report, "PENDING", {
                reason: "API_URL and load profile are required.",
            }),
            "load-profile",
        );
        process.exitCode = 2;
        return;
    }
    if (process.env.ALLOW_LOAD_TEST !== "true") {
        throw new Error(
            "Set ALLOW_LOAD_TEST=true after confirming the target environment.",
        );
    }
    const profile = JSON.parse(fs.readFileSync(file, "utf8"));
    const base = process.env.API_URL.replace(/\/$/, "");
    const concurrency = Number(
        process.env.LOAD_CONCURRENCY || profile.concurrency || 5,
    );
    const requests = Number(
        process.env.LOAD_REQUESTS || profile.requests || 100,
    );
    const queue = Array.from({ length: requests }, (_, index) => index);
    const results = [];
    async function worker() {
        while (queue.length) {
            const index = queue.shift();
            const endpoint =
                profile.endpoints[index % profile.endpoints.length];
            try {
                results.push(
                    await fetchTimed(
                        `${base}${endpoint.path}`,
                        {
                            method: endpoint.method || "GET",
                            headers: endpoint.headers || {},
                        },
                        endpoint.timeoutMs || 15000,
                    ),
                );
            } catch (error) {
                results.push({
                    status: 0,
                    durationMs: null,
                    error: error.name,
                });
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    const latencies = results
        .map((item) => item.durationMs)
        .filter(Number.isFinite);
    const errors = results.filter(
        (item) => item.status === 0 || item.status >= 500,
    );
    const rateLimited = results.filter((item) => item.status === 429);
    const metrics = {
        requests: results.length,
        concurrency,
        p50Ms: percentile(latencies, 50),
        p95Ms: percentile(latencies, 95),
        p99Ms: percentile(latencies, 99),
        errorRate: results.length ? errors.length / results.length : 1,
        rateLimited: rateLimited.length,
        statuses: results.reduce((acc, item) => {
            acc[item.status] = (acc[item.status] || 0) + 1;
            return acc;
        }, {}),
    };
    const pass =
        metrics.errorRate <= Number(profile.thresholds?.maxErrorRate ?? 0.01) &&
        (metrics.p95Ms || Infinity) <=
            Number(profile.thresholds?.maxP95Ms ?? 1500);
    writeEvidence(
        complete(report, pass ? "PASS" : "FAIL", { profile, metrics }),
        "load-profile",
    );
    process.exitCode = pass ? 0 : 1;
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
