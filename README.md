# AI Pavilion

AI Pavilion is a serverless B2B SaaS foundation for virtual and hybrid events. Organizers operate isolated organizations, create events, invite exhibitors, moderate stands, collect leads and manage a subscription. Exhibitors edit only assigned stands and manage only their own leads. Visitors browse published events and stands without entering a tenant administration boundary.

Version `0.9.0-internal-pilot.1` is the **internal-pilot promotion prerelease** built on the cumulative `0.8.8-4.5g.2` source baseline. It includes AUTH-01, QUOTA-01, INVITE-01, CONCURRENCY-01, EXPORT-01 and LEGACY-01, connects the Sprint 4.5F error/session/privacy/publication controls to the active runtime, and retains the Sprint 4.5G adversarial and operational evidence harness. Distributed evidence, manual approvals and production authorization remain pending.

> **Snapshot documentale completo:** la descrizione italiana consolidata dell’intero progetto è disponibile in [`DOCUMENTAZIONE-COMPLETA-IT.md`](DOCUMENTAZIONE-COMPLETA-IT.md) e nell’indice [`docs/it/00-INDICE-GENERALE.md`](docs/it/00-INDICE-GENERALE.md).

The 10 October 2026 consolidation passes local quality gates: 332 Jest tests, coverage above all unchanged thresholds, frontend build and zero reported dependency vulnerabilities. See [the consolidation report](docs/development/CONSOLIDATION-2026-10-10.md) for fixes, evidence limits and remaining AWS work.

The repository is still pre-production. It is suitable for a controlled AWS staging deployment and evidence run, but customer pilot use remains gated by successful CI on the release commit, deployed AWS consistency evidence, independent security review, manual accessibility assessment, legal/privacy approval and operational exercises.

## Implemented product foundation

### Multi-tenant application

- Organizations, active memberships and `owner`, `organizer`, `exhibitor` roles.
- Organization-owned events, invitations, stands, leads, audit events and entitlements.
- Server-side tenant isolation for every protected resource.
- Organizer portal for onboarding, team management, event lifecycle, invitations, moderation, audit and billing.
- Exhibitor portal for assigned-stand editing, review submission and lead management.
- Public event and stand discovery restricted to published public resources.
- Cognito post-confirmation profile synchronization.

### Trust and commercial operations

- Stripe subscription Checkout and Billing Portal integration.
- Signed billing webhook with replay suppression, guarded entitlement updates and retryable failed-event state.
- SESv2 invitation delivery with configuration-set telemetry for delivery, bounce, complaint and reject events.
- Invitation list, resend and revoke operations.
- Cloudflare Turnstile support for anonymous lead submission, with isolated simulated development mode.
- Authenticated personal-data export with payment and internal fields removed.
- Tenant audit viewer and configurable audit retention.

### Persistent pilot infrastructure

- Disposable `dev` SAM template remains available for local development evidence.
- Generated retained backend template restricted to `staging` and `production`.
- DynamoDB point-in-time recovery, retained resources and schema migration tooling.
- Private encrypted S3 frontend origin behind CloudFront Origin Access Control.
- TLS, SPA fallback, access logging and infrastructure-managed security headers.
- AWS WAF managed rules and per-IP rate limiting.
- CloudWatch alarms, operations dashboard, synthetic checks and budget alerts.
- Daily AWS Backup plan and a documented DynamoDB restore drill.
- GitHub OIDC staging workflow without permanent AWS credentials.

### Sprint 4.5E.1 Core Correctness completion

- Atomic event and stand capacity reservations with idempotency, reconciliation and explicit over-limit state.
- Invitation acceptance bound to the authenticated `sub`, server-side profile, membership policy and a valid reserved stand slot.
- Strong numeric `If-Match`/`ETag` revisions for editorial/configuration updates; internal writers increment revisions and conditional writes prevent lost updates.
- Complete paginated lead and personal-data exports, spreadsheet-formula neutralization and explicit synchronous thresholds rather than silent truncation.
- Machine-readable writer inventory plus `npm run check:legacy`, which fails on undeclared mutation-capable sources.
- Platform-admin stand APIs are read-only; canonical stand mutations use tenant event/exhibitor workflows.
- Synthetic writers require explicit permission and reject production-like stacks; migration/repair tools remain plan-only by default.

### Sprint 4.5E.1 AUTH-01 scoped access-token contract

- Cognito resource server scopes separate signed-in user, tenant and platform-admin API surfaces.
- A Pre Token Generation V2.0 trigger adds coarse scopes to Cognito access tokens without replacing tenant membership or ownership checks.
- All 46 protected SAM events and their OpenAPI operations declare a matching scope.
- Invitation acceptance binds `sub` to the server-side user profile instead of depending on an access-token email claim.
- `npm run check:auth` verifies source/SAM/OpenAPI invariants; `npm run test:auth:deployed` is the mandatory AWS proof and also verifies scopes after token refresh.
- Cognito Essentials is an explicit infrastructure dependency for access-token customization.
- Persistent staging retains the pool, app client, resource server, groups and authentication trigger functions as one coherent plane.

### Frontend and accessibility foundation

- Tailwind 4 targets Safari 16.4+, Chrome 111+ and Firefox 128+ and is compiled locally; it is no longer loaded from a CDN.
- Stripe and Turnstile scripts load only when required.
- Skip navigation, visible focus, reduced-motion rules and live status regions.
- Manual WCAG 2.2 AA and assistive-technology verification checklist.

### Sprint 4.5E public catalogue and scope hardening

- Public stands and events are visible only when every required publication field is explicitly valid.
- Public email, phone and website fields are opt-in per exhibitor; the protected lead form remains available without exposing contact data.
- Search traverses DynamoDB result pages until it finds the requested matches or reaches the end, and includes visible product text.
- Event publication synchronizes stand publication snapshots and migration `002` upgrades existing safe records.
- Hidden products, incomplete booking/localization/recommendation controls, inline handlers and inline styles were removed from the active visitor experience.
- The pilot CSP no longer permits `unsafe-inline`, and stand cards support keyboard activation.

### Sprint 4.5D consistency and recovery

- Critical organization, membership, event, invitation, stand and lead mutations commit their audit record in the same DynamoDB transaction.
- Event archival is a resumable `archiving` saga that hides the event before stand propagation and finalizes atomically.
- Checkout and billing webhooks use expiring lease tokens, attempt counters and retained failure state.
- Order and entitlement updates reject Stripe events older than the latest applied event.
- Catalogue batch reads retry DynamoDB `UnprocessedKeys` with bounded exponential backoff.
- A scheduled reconciler repairs expired claims, stale orders and Stripe-backed entitlements.

### Sprint 4.5A stabilization

- Portable `package-lock.json` using canonical public npm tarball URLs.
- CI rejection of private registry hosts, embedded registry credentials and package/lock drift before installation.
- Semantic infrastructure checks for Lambda handlers, DynamoDB tables, IAM table policies, indexes and outputs.
- Correct personal-data export access through `user-saved-at-index`.
- Two-pass first staging deployment when the CloudFront site origin is not known in advance.

### Sprint 4.5C authentication and account lifecycle

- Cognito sign-in now completes software-token/SMS MFA and `NEW_PASSWORD_REQUIRED` challenges.
- Forgot-password now includes reset-code confirmation and a production-aligned password policy.
- Authenticator MFA can be enrolled or disabled from the account dashboard.
- Organization ownership transfer is atomic across organization, memberships and audit records.
- Organizers can reassign stands to another active tenant member.
- Account deletion exposes a readiness check, blocks owned organizations/stands and removes non-owner memberships before Cognito deletion.
- The account lifecycle uses the Cognito access token and supports global local-session cleanup after deletion.

### Sprint 4.5B staging evidence

- External preflight for AWS identity, SES sender verification, public npm access and deployment configuration.
- Visitor product checkout disabled by default in persistent staging; Stripe SaaS subscription billing remains enabled.
- Deployed browser tests can target the final CloudFront origin without launching a local frontend.
- Reusable synthetic staging fixtures and role-separated test accounts.
- One command runs DynamoDB integration, API smoke, browser and synthetic checks.
- Evidence logs are hashed into a release manifest and uploaded without test credentials or raw stack outputs.
- Cart and purchase controls disappear when visitor checkout is disabled.

The precise relationship between the original immersive vision, the current product and the recommended commercial target is documented in [`docs/product/PRODUCT-INTENT.md`](docs/product/PRODUCT-INTENT.md).

## Security boundary

The browser never grants itself a tenant role. API Gateway requires a coarse Cognito access-token scope for every protected route. Protected handlers then derive the actor from `sub`, load current application state and verify membership, role, organization, event, stand, invitation or lead ownership and entitlement server-side. Scopes select an API surface; they do not confer tenant membership.

Public catalogue responses are projections and do not expose ownership, moderation, subscription or payment internals. Billing, invitation and payment webhook signatures are verified before state changes. Critical mutations use strict request schemas and idempotency controls.

## What is not yet claimed

Version 0.8.8-4.5g.2 does **not** claim that the following have been completed:

- a successful public CI and AWS staging evidence run in the preparation environment;
- live Pre Token Generation V2.0 invocation and API Gateway scope enforcement;
- real SES recipient delivery and production-access approval;
- real Stripe test-mode subscription reconciliation;
- WAF and alarm behavior under measured traffic;
- successful backup restoration with recorded RPO/RTO;
- independent penetration and tenant-authorization testing;
- manual WCAG 2.2 AA conformance testing;
- legal/privacy approval and retention sign-off;
- two customer pilot tenants completing onboarding;
- production account separation, on-call staffing or a customer SLA;
- Stripe Connect or third-party marketplace settlement.

The active frontend no longer requires inline script or style allowances. Manual browser and accessibility evidence under the stricter CSP remains an external gate.

## Repository layout

```text
backend/lambda/                 Lambda sources bundled with esbuild
frontend/                       Vite application and role portals
infrastructure/backend-pilot.yaml   generated retained backend template
infrastructure/frontend-pilot.yaml  CloudFront/S3 frontend stack
infrastructure/operations-pilot.yaml WAF, alarms, backup and budgets
scripts/dev/                    disposable development deployment tools
scripts/pilot/                  staging deployment, migration and drills
scripts/pilot/data/migrations/  versioned data migrations
tests/integration/              deployed DynamoDB access-pattern tests
tests/e2e/                      deployed browser journey
data/                           canonical isolated development fixtures
docs/api/openapi.json           OpenAPI 3.1 contract
docs/operations/                staging, incident and service runbooks
docs/compliance/                privacy and accessibility engineering records
template.yaml                   authoritative disposable development SAM stack
```

## Requirements

For source verification:

- Node.js `20.19+` or `22.12+`;
- npm 10+.

For AWS verification:

- AWS CLI v2;
- AWS SAM CLI;
- Python 3.11+ and Playwright Chromium for browser testing;
- an isolated AWS development or staging account and GitHub OIDC roles.

## Verify the repository

```bash
npm run ci:install
npm run verify
npm audit --audit-level=high
```

The gate first rejects private registry references, then performs formatting, linting, syntax validation, the scoped-access-token and canonical-writer contracts, SAM/OpenAPI parity, semantic Lambda/table/index/policy checks, Lambda bundling, Phase 3/4/4.5C/4.5D/4.5E asset checks, coverage tests and a production frontend build.

## Disposable development stack

```bash
export AWS_REGION=eu-west-1
export STACK_NAME=ai-pavilion-dev
export ALLOWED_ORIGIN=http://127.0.0.1:3000
npm run dev:deploy
```

See [`QUICKSTART.md`](QUICKSTART.md) and [`docs/operations/DEV-STACK-RUNBOOK.md`](docs/operations/DEV-STACK-RUNBOOK.md).

## Persistent staging deployment

The staging path requires a verified SES sender, Stripe test credentials for SaaS billing, Turnstile test credentials, an alert email and a protected GitHub environment. Visitor product checkout is disabled by default; set `PRODUCT_PAYMENT_MODE=stripe` only after merchant-of-record scope is approved. An exact `APP_URL` is optional for the first default-CloudFront deployment. Follow [`docs/operations/STAGING-RUNBOOK.md`](docs/operations/STAGING-RUNBOOK.md), then run:

```bash
npm run pilot:generate
npm run pilot:check
npm run pilot:preflight
npm run pilot:deploy
ALLOW_SYNTHETIC_FIXTURES=true npm run pilot:evidence
```

Do not run the pilot deployment using production customer data until all exit gates in [`docs/development/NEXT-PHASE.md`](docs/development/NEXT-PHASE.md) are complete.
