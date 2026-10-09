"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    evaluatePromotion,
    validApproval,
} = require("../../scripts/internal-pilot/lib");

const now = Date.parse("2026-08-24T18:00:00.000Z");
const commit = "a".repeat(40);
const environment = "staging";
const plan = {
    schemaVersion: 1,
    release: "0.9.0-internal-pilot.1",
    allowedEnvironments: ["staging"],
    maxEvidenceAgeHours: 24,
    machineEvidence: [
        { kind: "machine-a", required: true, nonDerogable: true },
    ],
    manualApprovals: [
        { kind: "approval-a", required: true, nonDerogable: true },
    ],
};

function record(kind, status = "PASS", overrides = {}) {
    return {
        kind,
        status,
        release: plan.release,
        commit,
        environment,
        completedAt: "2026-08-24T17:00:00.000Z",
        _file: `${kind}.json`,
        _sha256: "b".repeat(64),
        ...overrides,
    };
}

function approval(overrides = {}) {
    return record("approval-a", "PASS", {
        approval: {
            approver: "Qualified reviewer",
            role: "Security lead",
            scope: "Internal pilot gate",
            approvedAt: "2026-08-24T17:00:00.000Z",
            expiresAt: "2026-08-25T17:00:00.000Z",
            reportSha256: "c".repeat(64),
        },
        ...overrides,
    });
}

test("PENDING is never promotion eligible", () => {
    const result = evaluatePromotion({
        plan,
        records: [record("machine-a", "PENDING"), approval()],
        commit,
        environment,
        now,
    });
    assert.equal(result.promotionEligible, false);
    assert.equal(result.blocking[0].status, "PENDING");
});

test("evidence from another commit or environment is ignored", () => {
    const result = evaluatePromotion({
        plan,
        records: [
            record("machine-a", "PASS", { commit: "d".repeat(40) }),
            approval({ environment: "disposable" }),
        ],
        commit,
        environment,
        now,
    });
    assert.equal(result.promotionEligible, false);
    assert.deepEqual(
        result.blocking.map((item) => item.status),
        ["MISSING", "MISSING"],
    );
});

test("evidence carrying another release label is ignored", () => {
    const result = evaluatePromotion({
        plan,
        records: [
            record("machine-a", "PASS", { release: "0.8.8-4.5g.2" }),
            approval({ release: "0.8.8-4.5g.2" }),
        ],
        commit,
        environment,
        now,
    });
    assert.equal(result.promotionEligible, false);
    assert.deepEqual(
        result.blocking.map((item) => item.status),
        ["MISSING", "MISSING"],
    );
});

test("stale evidence blocks promotion", () => {
    const result = evaluatePromotion({
        plan,
        records: [
            record("machine-a", "PASS", {
                completedAt: "2026-08-22T17:00:00.000Z",
            }),
            approval(),
        ],
        commit,
        environment,
        now,
    });
    assert.equal(result.machine[0].status, "STALE");
    assert.equal(result.promotionEligible, false);
});

test("manual approval must be named, hashed and unexpired", () => {
    assert.equal(validApproval(approval(), now), true);
    assert.equal(
        validApproval(
            approval({ approval: { approver: "", expiresAt: null } }),
            now,
        ),
        false,
    );
});

test("all exact, fresh PASS evidence permits internal-pilot promotion", () => {
    const result = evaluatePromotion({
        plan,
        records: [record("machine-a"), approval()],
        commit,
        environment,
        now,
    });
    assert.equal(result.promotionEligible, true);
    assert.equal(result.blocking.length, 0);
});

test("production-like or unapproved environment cannot be promoted", () => {
    const result = evaluatePromotion({
        plan,
        records: [record("machine-a"), approval()],
        commit,
        environment: "production",
        now,
    });
    assert.equal(result.allowedEnvironment, false);
    assert.equal(result.promotionEligible, false);
});
