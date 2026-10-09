#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const path = require("path");
const {
    currentCommit,
    currentEnvironment,
    evaluatePromotion,
    evidenceDirectories,
    loadPlan,
    parseEvidenceFiles,
    writeJson,
} = require("./lib");

const plan = loadPlan();
const commit = currentCommit();
const environment = currentEnvironment();
const result = evaluatePromotion({
    plan,
    records: parseEvidenceFiles(evidenceDirectories()),
    commit,
    environment,
});
if (!result.promotionEligible) {
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 2;
} else {
    const receipt = {
        schemaVersion: 1,
        kind: "internal-pilot-promotion",
        release: "0.9.0",
        sourceRelease: plan.release,
        sourceBaseline: plan.sourceBaseline,
        commit,
        environment,
        status: "PASS",
        promotedAt: new Date().toISOString(),
        promotionId: crypto.randomUUID(),
        evidence: [...result.machine, ...result.manual].map((item) => ({
            kind: item.kind,
            completedAt: item.completedAt,
            sha256: item.sha256,
            file: item.file,
        })),
        authorizations: {
            internalPilotReady: true,
            production: false,
            customerData: false,
        },
    };
    const file = path.resolve(
        process.env.INTERNAL_PILOT_PROMOTION_RECEIPT ||
            `evidence/internal-pilot/promotion/${commit}-promotion.json`,
    );
    writeJson(file, receipt);
    process.stdout.write(`${file}\n${JSON.stringify(receipt, null, 2)}\n`);
}
