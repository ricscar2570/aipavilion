# Changelog

All notable changes to the canonical AI Pavilion application are recorded here.

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
