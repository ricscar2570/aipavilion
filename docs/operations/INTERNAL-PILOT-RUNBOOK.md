# Internal Pilot promotion runbook

## Purpose

This runbook governs promotion from the cumulative pre-production source baseline to `0.9.0 — Internal Pilot Ready`. It does not authorize production or external customer data.

## Safety boundary

The protected workflow intentionally separates the **evidence label** from the **AWS deployment stage**:

```text
EVIDENCE_ENVIRONMENT=internal-pilot
ENVIRONMENT=staging
```

Evidence may be labeled `staging`, `disposable` or `internal-pilot`, but the automated deployment and synthetic fixture tooling writes only to the staging stack. Production-like targets and URLs are refused, and staging refuses non-test Stripe keys. `ALLOW_INTERNAL_PILOT=true` is mandatory.

## Evidence identity

Every evidence record used for promotion must have:

- the exact source commit;
- the same target evidence environment;
- status `PASS`;
- a completion timestamp inside the configured age window;
- an immutable SHA-256 captured by the promotion receipt.

A record from another commit, another environment, an expired run, or a PENDING run is treated as missing or blocking.

## Protected GitHub environment

The `internal-pilot` GitHub environment must provide the AWS OIDC role and the staging-only product secrets/variables consumed by `.github/workflows/internal-pilot.yml`. At minimum, a complete `all` run needs the same staging deployment settings as the persistent staging workflow: AWS region/role, alert and SES sender settings, Turnstile secret/site key, Stripe **test** credentials and price IDs, plus any suite-specific SES/WAF/restore settings.

Tenant-isolation and failure-injection matrices must contain real non-production fixtures. Store their JSON as protected GitHub environment secrets named:

```text
TENANT_ESCAPE_MATRIX_JSON
FAILURE_INJECTION_CASES_JSON
```

The workflow materializes these values only into permission-restricted runner files and points the evidence harness at those files. If they are absent, the checked-in `REPLACE_ME` examples remain non-evidence and the corresponding suite cannot become a valid PASS.

## Preflight

For a manual staging-backed preflight:

```bash
export ALLOW_INTERNAL_PILOT=true
export EVIDENCE_ENVIRONMENT=internal-pilot
export ENVIRONMENT=staging
export AWS_REGION=eu-west-1
# API_URL may be supplied when staging already exists; first deployment does not require it.
npm run internal-pilot:preflight
```

Preflight checks Node/npm/git/AWS/SAM/Python availability, the AWS identity, target guards and the Stripe key mode. Exit code `2` means PENDING; exit code `1` means unsafe/failed.

## What the `all` workflow now does

A protected `all` run performs the following sequence on the exact Git commit:

1. installs Node, Python and AWS SAM CLI;
2. assumes the protected AWS OIDC role;
3. installs the exact npm dependency graph and browser evidence dependencies;
4. runs the internal-pilot preflight;
5. proves source CI, source-only gates, manifest integrity and `npm audit`;
6. validates and builds both SAM templates;
7. deploys/migrates the staging stacks;
8. captures or reuses the deployed stack outputs;
9. seeds isolated staging fixtures and creates ephemeral test identities;
10. creates fresh Cognito access tokens in-memory and masks them in GitHub Actions;
11. proves Cognito/API Gateway authentication;
12. runs invitation, **enabled** DynamoDB integration and deployed smoke tests;
13. runs Playwright against the deployed staging `APP_URL`, never the localhost fallback;
14. runs the 4.5G operational/adversarial suites;
15. evaluates the promotion matrix and uploads the immutable evidence bundle.

The synthetic fixture helper is `scripts/internal-pilot/prepare-staging-fixtures.sh`. It is restricted to `ENVIRONMENT=staging` and can also capture outputs from an already deployed staging stack for focused reruns.

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

Use the protected GitHub workflow or wrap a controlled command. For example:

```bash
node scripts/internal-pilot/command-proof.js --kind sam-build -- \
  bash -lc 'sam validate --lint --template-file template.yaml && sam build --template-file template.yaml'
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
