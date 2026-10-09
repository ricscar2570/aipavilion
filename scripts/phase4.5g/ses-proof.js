#!/usr/bin/env node
"use strict";
const { spawnSync } = require("child_process");
const { complete, context, writeEvidence } = require("./lib/evidence");

function command(args) {
    return spawnSync("aws", args, { encoding: "utf8" });
}
async function main() {
    const report = context("ses-delivery");
    if (
        process.env.ALLOW_EXTERNAL_EMAIL_PROOF !== "true" ||
        !process.env.SES_PROOF_FROM ||
        !process.env.SES_PROOF_TO
    ) {
        writeEvidence(
            complete(report, "PENDING", {
                reason: "Explicit email proof permission and sender/recipient are required.",
            }),
            "ses-delivery",
        );
        process.exitCode = 2;
        return;
    }
    const region = process.env.AWS_REGION || "eu-west-1";
    const result = command([
        "sesv2",
        "send-email",
        "--region",
        region,
        "--from-email-address",
        process.env.SES_PROOF_FROM,
        "--destination",
        `ToAddresses=${process.env.SES_PROOF_TO}`,
        "--content",
        "Simple={Subject={Data=AI Pavilion 4.5G proof},Body={Text={Data=Controlled SES delivery proof}}}",
        "--output",
        "json",
    ]);
    let body = null;
    try {
        body = JSON.parse(result.stdout || "{}");
    } catch {
        body = {};
    }
    const pass = result.status === 0 && Boolean(body.MessageId);
    writeEvidence(
        complete(report, pass ? "PASS" : "FAIL", {
            region,
            exitCode: result.status,
            messageId: body.MessageId || null,
            stderr: result.stderr,
        }),
        "ses-delivery",
    );
    process.exitCode = pass ? 0 : 1;
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
