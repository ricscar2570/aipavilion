#!/usr/bin/env node
"use strict";

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
const result = evaluatePromotion({
    plan,
    records: parseEvidenceFiles(evidenceDirectories()),
    commit: currentCommit(),
    environment: currentEnvironment(),
});
const output = process.env.INTERNAL_PILOT_STATUS_FILE
    ? path.resolve(process.env.INTERNAL_PILOT_STATUS_FILE)
    : null;
if (output) {
    writeJson(output, result);
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.promotionEligible ? 0 : 2;
