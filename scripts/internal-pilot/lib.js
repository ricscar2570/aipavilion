"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PLAN_FILE = path.resolve(
    process.env.INTERNAL_PILOT_PLAN || "config/internal-pilot-plan.json",
);
const SENSITIVE =
    /(authorization|cookie|token|secret|password|credential|client.?secret|api.?key|session)/i;

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadPlan(file = PLAN_FILE) {
    const plan = readJson(file);
    if (plan.schemaVersion !== 1 || !Array.isArray(plan.machineEvidence)) {
        throw new Error("Unsupported internal-pilot plan");
    }
    return plan;
}

function git(args) {
    try {
        return execFileSync("git", args, { encoding: "utf8" }).trim();
    } catch {
        return "unavailable";
    }
}

function currentCommit() {
    return (
        process.env.PILOT_COMMIT ||
        process.env.GITHUB_SHA ||
        git(["rev-parse", "HEAD"])
    );
}

function currentEnvironment() {
    return (
        process.env.EVIDENCE_ENVIRONMENT ||
        process.env.ENVIRONMENT ||
        "internal-pilot"
    );
}

function redact(value, depth = 0) {
    if (depth > 8) {
        return "[DEPTH_LIMIT]";
    }
    if (value === null || value === undefined) {
        return value;
    }
    if (["number", "boolean"].includes(typeof value)) {
        return value;
    }
    if (typeof value === "string") {
        return value.length > 8192
            ? `${value.slice(0, 8192)}...[TRUNCATED]`
            : value;
    }
    if (Array.isArray(value)) {
        return value.slice(0, 500).map((item) => redact(item, depth + 1));
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

function sha256File(file) {
    return crypto
        .createHash("sha256")
        .update(fs.readFileSync(file))
        .digest("hex");
}

function collectJsonFiles(directories) {
    const files = [];
    for (const directory of directories) {
        if (!directory || !fs.existsSync(directory)) {
            continue;
        }
        for (const entry of fs.readdirSync(directory)) {
            const file = path.join(directory, entry);
            if (fs.statSync(file).isFile() && entry.endsWith(".json")) {
                files.push(file);
            }
        }
    }
    return files;
}

function parseEvidenceFiles(directories) {
    const records = [];
    for (const file of collectJsonFiles(directories)) {
        try {
            const record = readJson(file);
            if (record && typeof record.kind === "string") {
                records.push({
                    ...record,
                    _file: file,
                    _sha256: sha256File(file),
                });
            }
        } catch {
            records.push({
                kind: "invalid-evidence-file",
                status: "FAIL",
                _file: file,
                _sha256: sha256File(file),
            });
        }
    }
    return records;
}

function isoTime(value) {
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : null;
}

function recordIsFresh(record, maxAgeHours, now = Date.now()) {
    const completed = isoTime(record.completedAt);
    if (completed === null) {
        return false;
    }
    const age = now - completed;
    return age >= 0 && age <= maxAgeHours * 60 * 60 * 1000;
}

function validApproval(record, now = Date.now()) {
    if (record.status !== "PASS") {
        return false;
    }
    const approval = record.approval;
    if (!approval || typeof approval !== "object") {
        return false;
    }
    if (!String(approval.approver || "").trim()) {
        return false;
    }
    if (!String(approval.role || "").trim()) {
        return false;
    }
    if (!String(approval.scope || "").trim()) {
        return false;
    }
    if (!/^[a-f0-9]{64}$/i.test(String(approval.reportSha256 || ""))) {
        return false;
    }
    const approvedAt = isoTime(approval.approvedAt);
    const expiresAt = isoTime(approval.expiresAt);
    return (
        approvedAt !== null &&
        approvedAt <= now &&
        expiresAt !== null &&
        expiresAt > now
    );
}

function latestMatching(records, kind, commit, environment, release) {
    return records
        .filter(
            (record) =>
                record.kind === kind &&
                record.commit === commit &&
                record.environment === environment &&
                (!release || record.release === release),
        )
        .sort((a, b) =>
            String(b.completedAt || "").localeCompare(
                String(a.completedAt || ""),
            ),
        )[0];
}

function evaluatePromotion({
    plan,
    records,
    commit,
    environment,
    now = Date.now(),
}) {
    const allowedEnvironment = plan.allowedEnvironments.includes(environment);
    const evaluate = (definition, manual) => {
        const record = latestMatching(
            records,
            definition.kind,
            commit,
            environment,
            plan.release,
        );
        let status = record?.status || "MISSING";
        let reason = null;
        if (record && !recordIsFresh(record, plan.maxEvidenceAgeHours, now)) {
            status = "STALE";
            reason = "Evidence is outside the permitted age window.";
        }
        if (
            manual &&
            record &&
            status === "PASS" &&
            !validApproval(record, now)
        ) {
            status = "INVALID_APPROVAL";
            reason = "Approval metadata is missing, expired or unverifiable.";
        }
        return {
            kind: definition.kind,
            required: definition.required !== false,
            nonDerogable: definition.nonDerogable === true,
            manual,
            status,
            reason,
            completedAt: record?.completedAt || null,
            file: record?._file || null,
            sha256: record?._sha256 || null,
        };
    };
    const machine = plan.machineEvidence.map((definition) =>
        evaluate(definition, false),
    );
    const manual = plan.manualApprovals.map((definition) =>
        evaluate(definition, true),
    );
    const matrix = [...machine, ...manual];
    const promotionEligible =
        allowedEnvironment &&
        commit !== "unavailable" &&
        matrix
            .filter((item) => item.required)
            .every((item) => item.status === "PASS");
    return {
        schemaVersion: 1,
        release: plan.release,
        commit,
        environment,
        allowedEnvironment,
        evaluatedAt: new Date(now).toISOString(),
        maxEvidenceAgeHours: plan.maxEvidenceAgeHours,
        machine,
        manual,
        promotionEligible,
        blocking: matrix.filter(
            (item) => item.required && item.status !== "PASS",
        ),
    };
}

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(redact(value), null, 2)}\n`);
    return file;
}

function evidenceDirectories() {
    return [
        path.resolve(
            process.env.PHASE45G_EVIDENCE_DIR || "evidence/phase4.5g/runtime",
        ),
        path.resolve(
            process.env.INTERNAL_PILOT_EVIDENCE_DIR ||
                "evidence/internal-pilot/runtime",
        ),
        path.resolve(
            process.env.INTERNAL_PILOT_APPROVAL_DIR ||
                "evidence/internal-pilot/approvals",
        ),
    ];
}

function runtimeDirectory() {
    return path.resolve(
        process.env.INTERNAL_PILOT_EVIDENCE_DIR ||
            "evidence/internal-pilot/runtime",
    );
}

function writeRuntimeEvidence(record, suffix = record.kind) {
    const safe = String(suffix).replace(/[^a-z0-9_.-]/gi, "-");
    const file = path.join(
        runtimeDirectory(),
        `${new Date().toISOString().replace(/[:.]/g, "-")}-${safe}.json`,
    );
    return writeJson(file, record);
}

module.exports = {
    collectJsonFiles,
    currentCommit,
    currentEnvironment,
    evaluatePromotion,
    evidenceDirectories,
    git,
    latestMatching,
    loadPlan,
    parseEvidenceFiles,
    recordIsFresh,
    redact,
    runtimeDirectory,
    sha256File,
    validApproval,
    writeJson,
    writeRuntimeEvidence,
};
