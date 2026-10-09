# Internal Pilot promotion runbook

## Purpose

This runbook governs promotion from the cumulative pre-production source baseline to `0.9.0 — Internal Pilot Ready`. It does not authorize production or external customer data.

## Safety boundary

The tooling accepts only the environments:

```text
staging
disposable
internal-pilot
```

It refuses production-like target names or URLs and refuses non-test Stripe keys. `ALLOW_INTERNAL_PILOT=true` is mandatory.

## Evidence identity

Every evidence record used for promotion must have:

- the exact source commit;
- the same target environment;
- status `PASS`;
- a completion timestamp inside the configured age window;
- an immutable SHA-256 captured by the promotion receipt.

A record from another commit, another environment, an expired run, or a PENDING run is treated as missing or blocking.

## Preflight

```bash
export ALLOW_INTERNAL_PILOT=true
export EVIDENCE_ENVIRONMENT=internal-pilot
export ENVIRONMENT=internal-pilot
export AWS_REGION=eu-west-1
export API_URL=https://staging-api.example.invalid
npm run internal-pilot:preflight
```

Preflight checks local tools, the AWS identity, target guards and the Stripe key mode. Exit code `2` means PENDING; exit code `1` means unsafe/failed.

## Machine evidence order

1. dependency CI;
2. SAM validate/build;
3. AWS deployment;
4. Cognito/API Gateway authentication;
5. core AWS contracts and smoke tests;
6. browser/strict-CSP test;
7. static security assessment;
8. tenant isolation;
9. failure injection;
10. Stripe test mode;
11. SES delivery/telemetry;
12. WAF/rate limiting;
13. load profile;
14. restore with measured RPO/RTO.

Use the protected GitHub workflow or wrap a controlled command:

```bash
node scripts/internal-pilot/command-proof.js --kind sam-build -- \
  bash -lc 'sam validate && sam build'
```

A wrapped command produces PASS only when its exit code is zero.

## Manual approvals

The following reviews remain mandatory:

- WCAG 2.2 AA;
- privacy/legal;
- targeted penetration assessment;
- incident rehearsal;
- rollback rehearsal;
- support rehearsal.

Start from `config/internal-pilot-approval.example.json`. A valid PASS approval must identify the named approver, role, review scope, approval date, expiry date and SHA-256 of the signed report. Editing a template without completing the actual review is not evidence.

## Status

Place machine evidence in:

```text
evidence/phase4.5g/runtime
evidence/internal-pilot/runtime
```

Place approval records in:

```text
evidence/internal-pilot/approvals
```

Then run:

```bash
npm run internal-pilot:status
```

The command exits `2` until every mandatory record is a fresh exact-match PASS.

## Promotion

```bash
npm run internal-pilot:promote
```

The command writes a promotion receipt only when the full matrix is eligible. The receipt authorizes **internal pilot readiness only**:

```json
{
    "internalPilotReady": true,
    "production": false,
    "customerData": false
}
```

## Non-derogable blockers

No exception may promote a release with:

- authentication bypass;
- tenant escape;
- live-secret exposure;
- unrecoverable data loss;
- non-idempotent billing mutation;
- public stored XSS;
- unauthorized personal-data access;
- failed restore;
- missing rollback proof.
