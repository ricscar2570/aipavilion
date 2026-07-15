# Sprint 2.5 report: security, idempotency and contracts

Version 0.6.0 hardens the Phase 2 integration baseline before multi-tenant development.

## Delivered

1. Public catalogue policy is centralized and applied to list, detail, search, leads, saved stands and checkout.
2. Browser retries are limited to safe methods and transient errors; mutating retries require an explicit idempotency key.
3. Checkout request IDs deterministically identify orders and Stripe requests.
4. Orders are reserved before payment creation and state changes use conditional transitions.
5. Stripe webhook IDs are persisted, deduplicated, marked processed and released only after processing failures.
6. User and administrator revenue includes only `paid` orders.
7. Administrator analytics is derived from timestamped interaction records.
8. Lead and interaction APIs reject undocumented payload fields, require matching request identifiers and prevent client-created purchase events.
9. Saved stands accept only `standId` and resolve display metadata server-side.
10. Duplicate custom authentication Lambdas were removed; protected API calls use Cognito access tokens.
11. OpenAPI 3.1 documents all active operations and is reconciled with SAM in the quality gate.
12. Unit and deployed smoke suites include negative validation, authorization, idempotency and ownership journeys.

## Data changes

- Orders and saved stands use `schemaVersion: 2`.
- A dedicated payment-event table stores webhook processing claims with TTL.
- Interaction and saved-stand GSIs support chronological access patterns.
- Development fixtures include a deliberately unpublished stand used by leakage tests.

## Verification boundary

The local gate can prove source, contracts, bundles and browser build integrity. Tests under `tests/integration` and `tests/e2e` require a deployed disposable stack and are skipped locally when its outputs are absent.

## Residual risks intentionally deferred

- Public route abuse controls are application-level only; WAF and route-specific quotas remain Phase 3 work.
- Catalogue and administrator operations still contain full-table scans and require new multi-tenant access patterns.
- The administrator Lambda remains too broad and should be split by domain.
- Cognito's browser SDK still manages its own browser session storage; a BFF/HttpOnly-cookie architecture remains an optional production hardening decision.
- There is no general data-migration framework yet.
- Production accessibility, load, disaster-recovery and penetration testing remain outstanding.

## Final local verification

The final source was copied without `node_modules`, generated bundles or coverage output, then rebuilt with `npm ci --offline --ignore-scripts` and `npm run verify`.

- 508 packages reconstructed from `package-lock.json`;
- zero vulnerabilities reported by `npm audit`, including development dependencies;
- 134 local tests passed;
- 8 deployed-stack tests were correctly skipped because no stack outputs were supplied;
- 38 Node.js files passed syntax checks;
- 21 SAM API events and 11 Lambda sources passed contract checks;
- all 11 Lambda functions bundled independently;
- all 20 OpenAPI paths passed the contract gate;
- global coverage: 76.57% statements, 68.79% branches, 70.48% functions and 76.77% lines;
- the Vite production build completed successfully.

AWS CLI and SAM CLI were not available in the preparation environment. No claim is made that CloudFormation, Cognito, API Gateway or Stripe were exercised there; the repository contains the scripts and opt-in deployed suites for an equipped isolated AWS account.
