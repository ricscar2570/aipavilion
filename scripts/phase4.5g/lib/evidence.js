"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SENSITIVE =
    /(authorization|cookie|token|secret|password|credential|client.?secret|api.?key)/i;

function redact(value, depth = 0) {
    if (depth > 8) {
        return "[DEPTH_LIMIT]";
    }
    if (
        value === null ||
        value === undefined ||
        ["number", "boolean"].includes(typeof value)
    ) {
        return value;
    }
    if (typeof value === "string") {
        return value.length > 4096
            ? `${value.slice(0, 4096)}...[TRUNCATED]`
            : value;
    }
    if (Array.isArray(value)) {
        return value.slice(0, 200).map((item) => redact(item, depth + 1));
    }
    if (typeof value !== "object") {
        return String(value);
    }
    const output = {};
    for (const [key, child] of Object.entries(value)) {
        output[key] = SENSITIVE.test(key)
            ? "[REDACTED]"
            : redact(child, depth + 1);
    }
    return output;
}

function git(command) {
    try {
        return execFileSync("git", command, { encoding: "utf8" }).trim();
    } catch {
        return "unavailable";
    }
}

function context(kind) {
    return {
        schemaVersion: 1,
        kind,
        release:
            process.env.RELEASE_VERSION ||
            require("../../../package.json").version,
        commit: process.env.GITHUB_SHA || git(["rev-parse", "HEAD"]),
        environment:
            process.env.EVIDENCE_ENVIRONMENT ||
            process.env.ENVIRONMENT ||
            "local",
        runId: process.env.GITHUB_RUN_ID || crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        status: "RUNNING",
        observations: [],
    };
}

function percentile(values, p) {
    if (!values.length) {
        return null;
    }
    const ordered = [...values].sort((a, b) => a - b);
    const index = Math.min(
        ordered.length - 1,
        Math.max(0, Math.ceil((p / 100) * ordered.length) - 1),
    );
    return ordered[index];
}

function complete(report, status, summary = {}) {
    report.status = status;
    report.completedAt = new Date().toISOString();
    report.summary = redact(summary);
    return report;
}

function writeEvidence(report, name) {
    const dir = path.resolve(
        process.env.EVIDENCE_DIR || "evidence/phase4.5g/runtime",
    );
    fs.mkdirSync(dir, { recursive: true });
    const safeName = String(name || report.kind).replace(/[^a-z0-9_.-]/gi, "-");
    const file = path.join(
        dir,
        `${new Date().toISOString().replace(/[:.]/g, "-")}-${safeName}.json`,
    );
    fs.writeFileSync(file, `${JSON.stringify(redact(report), null, 2)}\n`);
    process.stdout.write(`${file}\n`);
    return file;
}

async function fetchTimed(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = performance.now();
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        const text = await response.text();
        let body = text;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            /* text remains text */
        }
        return {
            status: response.status,
            durationMs: Math.round((performance.now() - started) * 1000) / 1000,
            headers: Object.fromEntries(response.headers.entries()),
            body: redact(body),
        };
    } finally {
        clearTimeout(timer);
    }
}

function requireEnv(names) {
    const missing = names.filter((name) => !process.env[name]);
    if (missing.length) {
        throw new Error(
            `Missing required environment variables: ${missing.join(", ")}`,
        );
    }
}

module.exports = {
    complete,
    context,
    fetchTimed,
    percentile,
    redact,
    requireEnv,
    writeEvidence,
};
