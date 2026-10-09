# Changelog

## 0.9.0-internal-pilot.1 — exact-evidence promotion gate

- Added a machine-readable internal-pilot plan with mandatory machine proofs and manual approvals.
- Added a protected preflight that refuses production-like targets and non-test Stripe credentials.
- Added exact commit, environment and evidence-age matching.
- Added command-wrapped proof records, status matrix and fail-closed promotion receipt.
- Added approval expiry, named approver and signed-report hash requirements.
- Added a protected GitHub Actions workflow and internal-pilot runbook.
- Added dependency-free regression tests proving that PENDING, stale and mismatched evidence cannot promote a release.

### Verification boundary

The promotion tooling can be validated locally. Actual promotion remains blocked until all distributed and manual evidence is produced in the controlled target environment.

## 0.8.8-4.5g.2 — 4.5F runtime consolidation and 4.5G evidence baseline

- Connected the uniform API error envelope and safe unhandled-exception response to active Lambda handlers.
- Connected session lifecycle signals to the active SPA API client.
- Enforced Turnstile hostname/action/age checks and disabled IP-derived storage by default, with explicit HMAC-only opt-in.
- Replaced publication propagation with a checkpointed, retryable, fail-closed saga.
- Added consistent owner-event barriers to global stand list, search and detail.
- Added migration 004 for conservative historical publication-state normalization.
- Returned edited published events to hidden draft state and blocked mutations/duplication during transitional states.
- Preserved the 4.5G evidence harness while retaining every external proof as PENDING until executed.
- Updated source gates, OpenAPI and persistent pilot infrastructure.

### Verification boundary

Dependency-free source and contract gates pass. Full dependency-driven CI, SAM/AWS deployment, tenant isolation, Stripe, SES, WAF, load, restore, WCAG, privacy/legal and penetration evidence remain mandatory external gates.

## 0.8.6-legacy.1 — Sprint 4.5E.1 canonical writer consolidation

- Added a machine-readable inventory and CI gate for every mutation-capable runtime, synthetic, migration and repair source.
- Removed the legacy global platform-admin stand writer and made the admin stand surface read-only in code, IAM, SAM and OpenAPI.
- Added canonical stand construction, publication derivation and fixture validation.
- Guarded synthetic writers with explicit opt-in and production-like destination rejection.
- Kept migrations and repair tools plan-only unless apply mode is selected explicitly.
- Canonicalized development and sample stand fixtures and removed retired AR/tour fields and the legacy `approved` state.
- Repaired inherited event and exhibitor-stand revision regressions before declaring the writer boundary complete.
- Regenerated the persistent pilot backend and synchronized release documentation.

### Verification boundary

Static source, writer inventory, SAM/OpenAPI and infrastructure contracts are verifiable in the repository. The preparation environment could not complete the public npm dependency installation, and live AWS/SAM evidence is not claimed. Exact gate results and pending proofs are preserved in the release evidence bundle.

## 0.8.6-auth.1 — Sprint 4.5E.1 AUTH-01 scoped Cognito access tokens

- Added the `aipavilion` Cognito resource server with coarse user, tenant and platform-admin scopes.
- Added a Cognito Pre Token Generation V2.0 Lambda and explicitly selected the Essentials user-pool tier.
- Retained the complete staging authentication plane as one unit: pool, client, resource server, groups and trigger functions/permissions.
- Added the matching authorization scope to all 46 protected SAM events and OpenAPI operations.
- Retained fine-grained membership, role, ownership, assignment and entitlement checks in the backend.
- Changed invitation acceptance to resolve the recipient email from the server-side user profile keyed by `sub`.
- Added dependency-free authentication contract checks, unit regressions and a dedicated deployed AWS proof.
- Added the deployed authentication proof to disposable CI and staging evidence collection.

### Verification boundary

Static authentication, SAM/OpenAPI, infrastructure, syntax and phase gates pass. The preparation environment could not resolve the public npm registry and did not provide AWS/SAM tooling, so Jest, lint, build, audit and live Cognito/API Gateway evidence remain external release gates.

## 0.8.5 — Sprint 4.5E public catalogue and product-scope hardening

- Made public event and stand eligibility fail closed.
- Added explicit stand moderation status and a versioned migration for existing records.
- Made public email, phone and website projection opt-in per exhibitor.
- Excluded hidden products from public responses and search.
- Made pilot search traverse DynamoDB pages instead of filtering only the first page.
- Synchronized stand publication snapshots when an event is published.
- Removed unfinished booking, localization, notification and recommendation controls.
- Removed active inline handlers, inline styles and JavaScript style mutations.
- Removed `unsafe-inline` from the pilot CSP and added keyboard-operable cards.
- Added OpenAPI fields, regression tests and the Sprint 4.5E semantic gate.

### Verification boundary

Static source and contract checks are complete. Dependency-driven and deployed AWS/browser evidence remain external gates where public npm and AWS tooling are available.

## 0.8.4 — Sprint 4.5D transactional consistency and payment recovery

- Added transactional audit helpers and migrated critical organization, membership, event, invitation, stand and lead mutations.
- Made SES invitation-delivery state and its tenant audit entry atomic.
- Made Stripe-driven entitlement state and its billing audit entry atomic.
- Converted event archive into a resumable `archiving` state machine that fails closed.
- Added expiring, token-owned leases and retained failure state for checkout and billing webhooks.
- Added Stripe event timestamp ordering for orders and SaaS entitlements.
- Added bounded retry for DynamoDB `BatchGetItem.UnprocessedKeys`.
- Added a scheduled payment reconciler for expired claims, stale orders and subscription state.
- Added development and persistent-pilot infrastructure, log retention and tests for reconciliation.
- Added Sprint 4.5D semantic asset checks and updated OpenAPI/package versions to 0.8.4.

### Verification boundary

The preparation environment could not complete dependency installation from the public npm registry and did not provide AWS/SAM credentials. Source syntax and static contracts are verified; full Jest, lint, build, SAM and deployed recovery evidence remain external gates.

## 0.8.3 — Sprint 4.5C authentication and account lifecycle

- Added Cognito MFA challenge completion for SMS and software-token codes.
- Added software-token MFA enrollment and disable controls in the account dashboard.
- Added complete temporary-password and forgot-password confirmation flows.
- Aligned frontend password validation and copy with the 12-character Cognito policy.
- Added account-deletion readiness checks and blocking for organization ownership and assigned stands.
- Added membership cleanup before account deletion and global local-session cleanup afterward.
- Added atomic organization ownership transfer to an active organizer.
- Added atomic stand reassignment to an active organization member.
- Added API contracts, SAM routes and regression tests for all new lifecycle operations.
- Added a Sprint-specific infrastructure gate and explicitly wired the memberships table, stands table and owner index into the account-lifecycle Lambda in both development and pilot templates.

## 0.8.2 — Sprint 4.5B staging evidence

- Added external staging preflight and safe evidence-manifest generation.
- Added remote CloudFront Playwright mode and a complete deployed evidence wrapper.
- Added reusable staging fixtures and configurable test-user artifact paths.
- Disabled visitor product checkout by default in persistent staging while retaining SaaS billing.
- Hid cart and purchase controls when visitor payments are disabled.
- Updated the GitHub staging workflow to run and upload redacted deployment evidence.
- Added a product-intent document distinguishing the original immersive vision from the current and target products.

All notable changes to the canonical AI Pavilion application are recorded here.

## [0.8.1] - 2026-08-06

### Reproducibility and supply chain

- Replaced 599 internal package-proxy tarball URLs with canonical public npm registry URLs.
- Added `.npmrc`, npm package-manager metadata, a lockfile normalizer and a pre-install portability gate.
- Added CI checks for private registries, embedded credentials, package/lock dependency drift and missing root package entries.

### Infrastructure correctness

- Corrected the personal-data export index from the nonexistent `user-saved-index` to `user-saved-at-index` in code and both SAM templates.
- Added semantic validation for Lambda handler files, esbuild entry points, DynamoDB table references, IAM table policies, index ownership and table outputs.
- Added built-in regression checks proving that undeclared indexes are rejected.

### Staging deployment

- Removed the first-deployment dependency on a pre-known CloudFront URL.
- Added backend bootstrap, frontend `SiteUrl` discovery and automatic backend finalization for exact CORS and Cognito callback origins.
- Added HTTPS-origin and custom-domain/certificate consistency validation plus a non-secret deployment context artifact.

### Verification boundary

- Static checks are complete in the preparation environment.
- Public-registry installation, dependency-driven quality gates, SAM build and AWS deployment remain to be executed by public CI and an equipped staging account.

## [0.8.0] - 2026-07-14

### Controlled-pilot infrastructure

- Added generated retained backend infrastructure restricted to staging/production with point-in-time recovery, retained stateful resources, MFA and schema migrations.
- Added private S3/CloudFront frontend delivery with Origin Access Control, TLS, access logs, SPA fallback and security headers.
- Added AWS WAF managed/rate rules, CloudWatch alarms/dashboard, synthetic checks, budget notifications and AWS Backup configuration.
- Added staging deployment, migration, synthetic and restore-drill tooling plus protected GitHub OIDC workflows.

### Billing, invitations and trust operations

- Added organizer subscription checkout, billing portal and signed billing webhook synchronization.
- Added replay-safe billing events, guarded entitlement updates and a retryable failed-event state.
- Added SESv2 invitation delivery, resend/revoke/list operations and SNS delivery/bounce/complaint/reject telemetry.
- Added an account-restricted SNS topic policy for SES publication.
- Added configurable Turnstile verification for anonymous leads.
- Added organization onboarding, member lifecycle management, event duplication/archive, tenant audit viewing and personal-data export.

### Frontend, accessibility and assurance

- Replaced CDN Tailwind with a local build and dynamically loads Stripe/Turnstile only when needed.
- Expanded the organizer portal to cover onboarding, billing, team, events, invitations, moderation, audit and data export.
- Added skip navigation, focus/reduced-motion rules, live status regions and a manual WCAG 2.2 AA evidence checklist.
- Added staging, incident-response, service-objective, privacy-inventory and Phase 4 reports.
- Expanded automated coverage for billing, membership, invitation, event lifecycle, audit, export and email telemetry.

### Verification boundary

Source verification, tests, contracts, bundles and frontend build are local gates. AWS deployment, real SES/Stripe/WAF behavior, restore evidence, independent security review and manual accessibility conformance remain Phase 5 evidence requirements.

## [0.7.0] - 2026-07-14

### Multi-tenancy and domain model

- Added organizations, memberships, entitlements, events, invitations and audit events as first-class resources.
- Added immutable organization/event ownership to stands, leads and interactions.
- Added owner, organizer and exhibitor authorization based on active membership rather than browser claims.
- Added two isolated tenant fixtures and access patterns for organization, event, owner and public catalog queries.
- Added a Cognito post-confirmation trigger that creates the application user profile.

### Organizer and exhibitor workflows

- Added organizer APIs and portal for event creation, publication, invitations and stand moderation.
- Added exhibitor invitation acceptance with transactional membership and draft-stand creation.
- Added exhibitor APIs and portal for stand editing, review submission, lead management and CSV export.
- Added plan entitlements and event/stand limits for the controlled pilot.
- Added audit records for privileged and destructive tenant actions.

### Public experience and validation

- Added public event listing, event detail and event-specific stand discovery.
- Preserved the hardened public-stand policy and server-authoritative checkout from Sprint 2.5.
- Expanded OpenAPI to 41 paths and SAM to 42 API events across 18 bundled Lambda functions.
- Expanded unit and contract coverage to 163 passing local tests plus deployed DynamoDB and browser suites.
- Added cross-tenant denial tests for organizations, events, stands, invitations and leads.

### Verification boundary

The repository, unit tests, bundles, contracts and frontend build were verified locally. CloudFormation deployment and real AWS/Playwright execution require an equipped development account and are not claimed as executed in the preparation environment.

## [0.6.0] - 2026-07-14

### Security and correctness

- Restricted catalogue listing, search, detail, lead, save and checkout flows to public approved/published stands.
- Added conservative HTTP retry rules and explicit idempotency for mutating requests.
- Reserved deterministic orders before Stripe calls and added guarded order-state transitions.
- Added persistent Stripe event deduplication with processed-event status.
- Rejected undocumented fields and mismatched request identifiers on critical mutations.
- Removed duplicate custom authentication Lambda routes; protected calls now use Cognito access tokens from the active session.
- Removed browser-controlled metadata from saved stands and private fields from user order responses.
- Counted revenue only from paid orders and rebuilt administrator analytics from interaction records.

### Contracts and tests

- Added an OpenAPI 3.1 specification for all active routes with unique operation IDs and request/response schemas.
- Added CI checks that reconcile OpenAPI, SAM routes, authorization and required idempotency headers.
- Expanded unit tests for hidden resources, strict payloads, retry policy, idempotent replay, webhook duplicates, stale transitions and analytics.
- Expanded the deployed smoke journey with negative authorization, validation, conflict and ownership assertions.

## [0.5.0] - 2026-07-14

### Added

- Self-contained disposable AWS development stack with Cognito, role groups and a stack-managed Stripe test secret.
- Canonical stand/product fixtures, deterministic seeding and temporary visitor/admin identity provisioning.
- Real DynamoDB integration tests covering six tables and three GSIs.
- Deployed API smoke test for login, stand discovery, saved stands, leads, checkout, administrator access and account deletion.
- Playwright browser journey for the principal visitor flow.
- Structured request lifecycle logging and correlation identifiers.
- OIDC-based GitHub development deployment workflow with cleanup by default.
- Deployment, rollback, diagnostics and destruction runbook.

### Changed

- Added explicit `disabled`, `simulated` and `stripe` payment modes.
- Made the SAM development data resources disposable and exported all operational table/API/Cognito outputs.
- Replaced the old external-Cognito configuration contract with stack-generated frontend configuration.
- Extended the local quality gate with Phase 2 asset and script checks.

### Security

- Simulated payment is confined to disposable development verification.
- Frontend config validation rejects backend secrets.
- Correlation logging excludes request bodies and authorization tokens.
- Test credentials and stack outputs are generated into ignored, permission-restricted artifacts.

### Verification boundary

The source, tests, bundles and frontend build were verified locally. The preparation environment did not contain AWS SAM CLI or deployment credentials; actual CloudFormation creation and deployed end-to-end execution must be performed by the included development workflow or an equipped workstation.

## [0.4.0] - 2026-07-14

### Consolidated

- Established one canonical root application and archived duplicate implementations.
- Replaced legacy deployment scripts with AWS SAM and esbuild packaging.
- Added deterministic npm installation, linting, contract checks, Lambda bundle checks, tests and frontend build gates.

### Fixed

- Corrected Lambda shared-module packaging.
- Corrected stand path parameters and order/saved-stand schemas.
- Added missing user, contact and admin routes.
- Added Cognito protection to private endpoints.
- Changed checkout to server-authoritative catalogue prices and authenticated order ownership.
- Added order-success routing and removed inline stand-detail event handlers.

### Security

- Removed full admin event logging.
- Added signed Stripe webhook handling, idempotent PaymentIntent creation and internal order-field filtering.
- Replaced long-lived AWS deployment keys in GitHub Actions with OIDC role assumption.
- Updated Vite and esbuild.

## Historical claims

Earlier release notes and promotional plans were not supported by the active source tree. They are retained under `docs/archive/` and are not treated as shipped versions.

## 0.8.8-4.5g.1 — Sprint 4.5G evidence harness

- Added reproducible tenant-escape, failure-injection, load, Stripe, SES, WAF, restore and security evidence tools.
- Added redacted evidence records bound to release, commit and environment.
- Reconstructed and inspected the 4.5F prerequisite contracts rather than inheriting an unverified artifact.
- Production and customer-data authorization remain false until distributed evidence passes.
