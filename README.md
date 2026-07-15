# AI Pavilion

AI Pavilion is a serverless B2B SaaS foundation for virtual and hybrid events. Organizers operate isolated organizations, create events, invite exhibitors, moderate stands, collect leads and manage a subscription. Exhibitors edit only assigned stands and manage only their own leads. Visitors browse published events and stands without entering a tenant administration boundary.

Version `0.8.0` is the **Phase 4 controlled-pilot operations foundation**. It extends the Phase 3 multi-tenant domain with retained staging infrastructure, frontend delivery, abuse controls, invitation email telemetry, organizer billing, migrations, backup, observability, privacy operations and accessibility foundations.

The repository is still pre-production. It is suitable for a controlled AWS staging deployment and invited pilot validation, but production use remains gated by deployed evidence, independent security review, manual accessibility assessment, legal/privacy approval and operational exercises.

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

### Frontend and accessibility foundation

- Tailwind is compiled locally; it is no longer loaded from a CDN.
- Stripe and Turnstile scripts load only when required.
- Skip navigation, visible focus, reduced-motion rules and live status regions.
- Manual WCAG 2.2 AA and assistive-technology verification checklist.

## Security boundary

The browser never grants itself a tenant role. Protected handlers derive the actor from a verified Cognito access token, load an active membership and verify organization, event, stand, invitation or lead ownership server-side.

Public catalogue responses are projections and do not expose ownership, moderation, subscription or payment internals. Billing, invitation and payment webhook signatures are verified before state changes. Critical mutations use strict request schemas and idempotency controls.

## What is not yet claimed

Version 0.8.0 does **not** claim that the following have been completed:

- a successful staging deployment in the preparation environment;
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

The current Content Security Policy still permits inline styles because legacy views use style attributes. Removing that allowance is a documented hardening item before general availability.

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
npm ci
npm run verify
npm audit --audit-level=high
```

The gate performs formatting, linting, syntax validation, SAM/OpenAPI parity, Lambda bundling, Phase 3/4 asset checks, coverage tests and a production frontend build.

## Disposable development stack

```bash
export AWS_REGION=eu-west-1
export STACK_NAME=ai-pavilion-dev
export ALLOWED_ORIGIN=http://127.0.0.1:3000
npm run dev:deploy
```

See [`QUICKSTART.md`](QUICKSTART.md) and [`docs/operations/DEV-STACK-RUNBOOK.md`](docs/operations/DEV-STACK-RUNBOOK.md).

## Persistent staging deployment

The staging path requires an exact public `APP_URL`, verified SES sender, Stripe test credentials, Turnstile credentials, alert email and protected GitHub environment. Follow [`docs/operations/STAGING-RUNBOOK.md`](docs/operations/STAGING-RUNBOOK.md), then run:

```bash
npm run pilot:generate
npm run pilot:check
npm run pilot:deploy
```

Do not run the pilot deployment using production customer data until all exit gates in [`docs/development/NEXT-PHASE.md`](docs/development/NEXT-PHASE.md) are complete.
