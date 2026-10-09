#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");

const required = ["API_URL", "ACCESS_TOKEN", "ORGANIZATION_ID", "EVENT_ID"];
for (const name of required) {
    if (!process.env[name]) {
        console.error(
            `Missing ${name}. This test must run against a disposable AWS stack.`,
        );
        process.exit(2);
    }
}

const base = process.env.API_URL.replace(/\/$/, "");
const headers = {
    Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
    "Content-Type": "application/json",
};

async function request(path, options = {}) {
    const response = await fetch(`${base}${path}`, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) },
    });
    const text = await response.text();
    let body;
    try {
        body = JSON.parse(text);
    } catch {
        body = text;
    }
    return { status: response.status, body, headers: response.headers };
}

async function main() {
    const email =
        process.env.INVITE_TEST_EMAIL || `invite-${Date.now()}@example.invalid`;
    const key = crypto.randomUUID();
    const path = `/organizations/${process.env.ORGANIZATION_ID}/events/${process.env.EVENT_ID}/invitations`;
    const first = await request(path, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ email, role: "exhibitor" }),
    });
    assert.ok([200, 201, 202].includes(first.status), JSON.stringify(first));
    const second = await request(path, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ email, role: "exhibitor" }),
    });
    assert.ok([200, 201, 202].includes(second.status), JSON.stringify(second));
    const firstId =
        first.body.invitationId ||
        first.body.invitation?.invitationId ||
        first.body.id;
    const secondId =
        second.body.invitationId ||
        second.body.invitation?.invitationId ||
        second.body.id;
    assert.ok(firstId, "The first request returned no invitationId");
    assert.strictEqual(
        secondId,
        firstId,
        "The idempotent replay created another invitation",
    );
    console.log(
        JSON.stringify(
            { result: "PASS", invitationId: firstId, idempotencyKey: key },
            null,
            2,
        ),
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
