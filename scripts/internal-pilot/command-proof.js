#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const { spawnSync } = require("child_process");
const {
    currentCommit,
    currentEnvironment,
    loadPlan,
    redact,
    writeRuntimeEvidence,
} = require("./lib");

function parseArgs(argv) {
    const separator = argv.indexOf("--");
    if (separator === -1) {
        throw new Error("Use -- before the command to execute");
    }
    const metadata = argv.slice(0, separator);
    const command = argv.slice(separator + 1);
    const kindIndex = metadata.indexOf("--kind");
    if (kindIndex === -1 || !metadata[kindIndex + 1]) {
        throw new Error("--kind is required");
    }
    if (!command.length) {
        throw new Error("A proof command is required");
    }
    return { kind: metadata[kindIndex + 1], command };
}

const { kind, command } = parseArgs(process.argv.slice(2));
const plan = loadPlan();
const allowed = new Set(plan.machineEvidence.map((item) => item.kind));
if (!allowed.has(kind)) {
    throw new Error(`Unknown proof kind: ${kind}`);
}
if (process.env.ALLOW_INTERNAL_PILOT !== "true") {
    throw new Error("ALLOW_INTERNAL_PILOT=true is required");
}
function safeCommand(values) {
    const sensitiveValues = new Set(
        Object.entries(process.env)
            .filter(
                ([key, value]) =>
                    /token|secret|password|credential|api.?key/i.test(key) &&
                    value,
            )
            .map(([, value]) => String(value)),
    );
    let redactNext = false;
    return values.map((value) => {
        const text = String(value);
        if (redactNext || sensitiveValues.has(text)) {
            redactNext = false;
            return "[REDACTED]";
        }
        if (/^--?(token|secret|password|credential|api-key|key)$/i.test(text)) {
            redactNext = true;
        }
        return text;
    });
}

const startedAt = new Date().toISOString();
const result = spawnSync(command[0], command.slice(1), {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
});
const status = result.status === 0 ? "PASS" : "FAIL";
const record = {
    schemaVersion: 1,
    kind,
    release: plan.release,
    commit: currentCommit(),
    environment: currentEnvironment(),
    runId: process.env.GITHUB_RUN_ID || crypto.randomUUID(),
    startedAt,
    completedAt: new Date().toISOString(),
    status,
    summary: redact({
        command: safeCommand(command),
        exitCode: result.status,
        signal: result.signal || null,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
    }),
};
const file = writeRuntimeEvidence(record, kind);
process.stdout.write(`${file}\n`);
if (result.stdout) {
    process.stdout.write(result.stdout);
}
if (result.stderr) {
    process.stderr.write(result.stderr);
}
process.exitCode = status === "PASS" ? 0 : 1;
