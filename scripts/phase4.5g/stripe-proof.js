#!/usr/bin/env node
"use strict";
const {
    complete,
    context,
    fetchTimed,
    writeEvidence,
} = require("./lib/evidence");

async function main() {
    const report = context("stripe-test-mode");
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || !key.startsWith("sk_test_")) {
        writeEvidence(
            complete(report, "PENDING", {
                reason: "A Stripe sk_test key is required; live keys are rejected.",
            }),
            "stripe-test-mode",
        );
        process.exitCode = 2;
        return;
    }
    const account = await fetchTimed("https://api.stripe.com/v1/account", {
        headers: { Authorization: `Bearer ${key}` },
    });
    const results = {
        accountStatus: account.status,
        livemode: account.body?.livemode,
    };
    let billingProbe = null;
    if (
        process.env.API_URL &&
        process.env.TENANT_ACCESS_TOKEN &&
        process.env.STRIPE_PROOF_ORGANIZATION_ID
    ) {
        billingProbe = await fetchTimed(
            `${process.env.API_URL.replace(/\/$/, "")}/organizations/${process.env.STRIPE_PROOF_ORGANIZATION_ID}/billing`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.TENANT_ACCESS_TOKEN}`,
                },
            },
        );
    }
    const pass =
        account.status === 200 &&
        account.body?.livemode === false &&
        (!billingProbe || billingProbe.status === 200);
    writeEvidence(
        complete(report, pass ? "PASS" : "FAIL", { results, billingProbe }),
        "stripe-test-mode",
    );
    process.exitCode = pass ? 0 : 1;
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
