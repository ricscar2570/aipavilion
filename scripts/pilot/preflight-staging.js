#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { resolveOriginContext } = require("./resolve-deployment-origin");

const root = path.resolve(__dirname, "../..");
const artifactsDir = path.join(root, ".artifacts");
const reportPath = path.join(artifactsDir, "staging-preflight.json");
const offline = process.argv.includes("--offline");
const errors = [];
const checks = [];

function addCheck(name, ok, detail = "") {
    checks.push({ name, ok, detail });
    if (!ok) errors.push(`${name}: ${detail}`);
}

function requireEnv(name, predicate = (value) => Boolean(value), message = "missing") {
    const value = String(process.env[name] || "").trim();
    addCheck(`env:${name}`, predicate(value), predicate(value) ? "configured" : message);
    return value;
}

function commandExists(name) {
    const result = spawnSync("bash", ["-lc", `command -v ${name}`], {
        encoding: "utf8",
    });
    return result.status === 0;
}

function runJson(command, args) {
    const result = spawnSync(command, args, {
        cwd: root,
        encoding: "utf8",
        env: process.env,
    });
    if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || "command failed").trim());
    }
    return JSON.parse(result.stdout);
}

function runText(command, args) {
    const result = spawnSync(command, args, {
        cwd: root,
        encoding: "utf8",
        env: process.env,
    });
    if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || "command failed").trim());
    }
    return result.stdout.trim();
}

function writeReport(extra = {}) {
    fs.mkdirSync(artifactsDir, { recursive: true });
    const report = {
        generatedAt: new Date().toISOString(),
        offline,
        environment: process.env.ENVIRONMENT || "",
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "",
        checks,
        passed: errors.length === 0,
        ...extra,
    };
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
        mode: 0o600,
    });
    return report;
}

function main() {
    const environment = requireEnv(
        "ENVIRONMENT",
        (value) => ["staging", "production"].includes(value),
        "must be staging or production",
    );
    const region = requireEnv(
        "AWS_REGION",
        (value) => /^[a-z]{2}-[a-z]+-\d$/.test(value),
        "must look like an AWS region",
    );
    requireEnv("ALERT_EMAIL", (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "invalid email");
    const sender = requireEnv(
        "INVITATION_EMAIL_FROM",
        (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        "invalid email",
    );
    const stripeSecret = requireEnv(
        "STRIPE_SECRET_KEY",
        (value) => environment !== "staging" || value.startsWith("sk_test_"),
        "staging requires sk_test_",
    );
    requireEnv(
        "STRIPE_BILLING_WEBHOOK_SECRET",
        (value) => value.startsWith("whsec_"),
        "must start with whsec_",
    );
    const productPaymentMode = String(process.env.PRODUCT_PAYMENT_MODE || "disabled").trim();
    addCheck(
        "env:PRODUCT_PAYMENT_MODE",
        ["disabled", "stripe"].includes(productPaymentMode),
        ["disabled", "stripe"].includes(productPaymentMode)
            ? productPaymentMode
            : "must be disabled or stripe",
    );
    if (productPaymentMode === "stripe") {
        requireEnv(
            "STRIPE_WEBHOOK_SECRET",
            (value) => value.startsWith("whsec_"),
            "required when product checkout is enabled",
        );
    }
    requireEnv("STRIPE_PILOT_PRICE_ID", (value) => value.startsWith("price_"), "must start with price_");
    requireEnv("STRIPE_STARTER_PRICE_ID", (value) => value.startsWith("price_"), "must start with price_");
    requireEnv("STRIPE_PROFESSIONAL_PRICE_ID", (value) => value.startsWith("price_"), "must start with price_");
    requireEnv(
        "STRIPE_PUBLISHABLE_KEY",
        (value) => environment !== "staging" || value.startsWith("pk_test_"),
        "staging requires pk_test_",
    );
    requireEnv("BOT_CHALLENGE_SECRET");
    requireEnv("TURNSTILE_SITE_KEY");

    try {
        const origins = resolveOriginContext(process.env);
        addCheck("origin-context", true, origins.configuredOrigin || "CloudFront bootstrap");
    } catch (error) {
        addCheck("origin-context", false, error.message);
    }

    const requiredCommands = offline
        ? ["node", "npm", "python3"]
        : ["node", "npm", "aws", "sam", "python3"];
    for (const command of requiredCommands) {
        addCheck(`command:${command}`, commandExists(command), commandExists(command) ? "available" : "missing");
    }

    let awsIdentity = null;
    if (!offline && commandExists("aws")) {
        try {
            awsIdentity = runJson("aws", [
                "sts",
                "get-caller-identity",
                "--region",
                region,
                "--output",
                "json",
            ]);
            addCheck("aws-identity", Boolean(awsIdentity.Account && awsIdentity.Arn), awsIdentity.Arn || "invalid identity");
        } catch (error) {
            addCheck("aws-identity", false, error.message);
        }

        try {
            let identity = null;
            let identityName = sender;
            try {
                identity = runJson("aws", [
                    "sesv2",
                    "get-email-identity",
                    "--email-identity",
                    sender,
                    "--region",
                    region,
                    "--output",
                    "json",
                ]);
            } catch {
                identityName = sender.split("@")[1] || sender;
                identity = runJson("aws", [
                    "sesv2",
                    "get-email-identity",
                    "--email-identity",
                    identityName,
                    "--region",
                    region,
                    "--output",
                    "json",
                ]);
            }
            addCheck(
                "ses-sender",
                identity.VerifiedForSendingStatus === true,
                identity.VerifiedForSendingStatus
                    ? `verified through ${identityName}`
                    : `${identityName} is not verified for sending`,
            );
        } catch (error) {
            addCheck("ses-sender", false, error.message);
        }

        try {
            runText("npm", ["ping", "--registry=https://registry.npmjs.org"]);
            addCheck("npm-public-registry", true, "reachable");
        } catch (error) {
            addCheck("npm-public-registry", false, error.message);
        }
    } else {
        addCheck("external-preflight", true, "skipped in offline mode");
    }

    const report = writeReport({
        accountId: awsIdentity?.Account || "",
        callerArn: awsIdentity?.Arn || "",
        productPaymentMode,
        stripeMode: stripeSecret.startsWith("sk_test_") ? "test" : stripeSecret ? "live" : "",
    });

    if (!report.passed) {
        console.error("Staging preflight failed:\n");
        for (const error of errors) console.error(`- ${error}`);
        process.exit(2);
    }
    console.log(`Staging preflight passed (${offline ? "offline" : "external"} mode).`);
}

main();
