#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "../..");
const evidenceDir = path.resolve(process.env.EVIDENCE_DIR || path.join(root, ".artifacts/evidence"));
const manifestPath = path.join(evidenceDir, "manifest.json");

function sha256(filePath) {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function gitValue(args) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim() : "";
}

function safeJson(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
        return null;
    }
}

function outputKeys(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map((item) => item.OutputKey).filter(Boolean).sort();
    return Object.keys(raw).sort();
}

function main() {
    fs.mkdirSync(evidenceDir, { recursive: true });
    const files = fs
        .readdirSync(evidenceDir)
        .filter((name) => name !== "manifest.json")
        .sort()
        .map((name) => {
            const filePath = path.join(evidenceDir, name);
            const stat = fs.statSync(filePath);
            return stat.isFile()
                ? { name, bytes: stat.size, sha256: sha256(filePath) }
                : null;
        })
        .filter(Boolean);

    const backendOutputs = safeJson(path.join(root, ".artifacts/staging-backend-outputs.json"));
    const frontendOutputs = safeJson(path.join(root, ".artifacts/staging-frontend-outputs.json"));
    const preflight = safeJson(path.join(root, ".artifacts/staging-preflight.json"));
    const deployment = safeJson(
        path.join(root, ".artifacts/staging-deployment-context.json"),
    );
    const manifest = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        release: require(path.join(root, "package.json")).version,
        gitCommit: process.env.GITHUB_SHA || gitValue(["rev-parse", "HEAD"]),
        gitRef: process.env.GITHUB_REF || gitValue(["branch", "--show-current"]),
        environment: process.env.ENVIRONMENT || "",
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "",
        appOrigin: process.env.APP_URL || process.env.E2E_BASE_URL || "",
        productPaymentMode:
            process.env.PRODUCT_PAYMENT_MODE ||
            deployment?.productPaymentMode ||
            "disabled",
        stacks: deployment
            ? {
                  backend: deployment.backendStack || "",
                  frontend: deployment.frontendStack || "",
                  operations: deployment.operationsStack || "",
              }
            : {},
        workflowRunId: process.env.GITHUB_RUN_ID || "",
        workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || "",
        preflightPassed: preflight?.passed === true,
        backendOutputKeys: outputKeys(backendOutputs),
        frontendOutputKeys: outputKeys(frontendOutputs),
        files,
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
        mode: 0o600,
    });
    console.log(`Wrote ${path.relative(root, manifestPath)} with ${files.length} evidence files.`);
}

main();
