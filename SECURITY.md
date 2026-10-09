# Security policy

AI Pavilion `0.8.x` is a pre-production controlled-pilot line. It must not process customer production data, live Stripe charges or third-party marketplace payouts until the deployed Phase 5 assurance gates are complete.

## Reporting a vulnerability

Report vulnerabilities privately to the repository owner with the affected route, reproduction steps, impact and proposed mitigation. Never include real credentials, access tokens, payment data or personal data in a public issue.

## Current security invariants

- Secrets remain outside source control and frontend configuration.
- Protected APIs use Cognito access tokens and route-specific coarse scopes. Scopes select an API family; they do not replace active membership, application role, ownership, assignment or entitlement checks.
- Platform administration independently verifies token signature, use and `admin` group.
- Tenant authorization is resolved server-side from an active membership.
- Browser-supplied organization IDs or role names do not grant access.
- Organizations, events, invitations, stands, leads, audit events and billing data are checked against membership or ownership.
- Cross-tenant resources are rejected or concealed as not found.
- Invitation acceptance identifies the actor by `sub`, loads the normalized email from the server-side profile and uses a DynamoDB transaction.
- Organizer moderation accepts only valid stand-state transitions.
- Public routes expose only published public events and stands through field allowlists.
- Product prices, currency and purchasability are determined by the backend.
- Critical mutations use strict payload shapes and idempotency identifiers.
- Checkout reserves a deterministic order before creating a payment intent.
- Stripe payment and billing webhook signatures are verified against the raw body.
- Webhook event IDs are claimed with expiring lease tokens; failed or abandoned claims can be reclaimed and stale Stripe state regressions are blocked.
- SES event publication is restricted to the account-owned invitation SNS topic.
- Anonymous lead submission supports Turnstile verification and infrastructure rate limiting.
- User-facing responses exclude Stripe, ownership, idempotency and internal retention fields.
- Critical tenant mutations and their audit events are committed in the same DynamoDB transaction; resumable sagas are used where one transaction cannot cover the full operation.
- Stripe-driven entitlement changes and SES delivery-state changes commit their matching tenant audit records atomically.
- Personal-data export excludes payment secrets and internal processing identifiers.
- Request lifecycle logs exclude authorization headers and request bodies.
- Cognito confirmation creates an application profile without trusting browser role data.
- Staging CI uses short-lived AWS credentials through GitHub OIDC.
- Pilot templates enable point-in-time recovery, retain stateful resources and retain the full Cognito authentication plane together.
- Dependency installation is pinned to the public npm registry and private registry URLs are rejected before `npm ci`.
- Lambda table/index environment contracts and matching table policies are checked semantically in both development and pilot templates.
- A scheduled payment reconciler expires abandoned webhook leases and compares stale orders and Stripe-backed entitlements with Stripe test or live state according to the configured environment.

## Environment boundaries

- `PaymentMode=simulated`, `BillingMode=simulated`, simulated email and simulated bot challenges are restricted to the disposable `dev` template.
- The generated pilot backend permits only `staging` and `production` and excludes simulated payment/billing modes.
- Staging must use Stripe test-mode credentials until live-mode approval is explicit.
- Production and staging must use separate accounts or strongly isolated roles and secrets.

## Residual blockers before customer production use

- deployed evidence for WAF, throttling, Turnstile, CloudFront headers and alarms;
- SES production-access approval and real delivery/bounce/complaint tests;
- Stripe test-mode subscription, delayed webhook and reconciliation exercises;
- successful backup restoration with measured RPO/RTO;
- independent penetration and tenant-authorization review;
- manual WCAG 2.2 AA keyboard and screen-reader assessment;
- privacy/legal approval, retention sign-off and processor/subprocessor register;
- operational on-call ownership, customer support process and incident exercise;
- deployed-browser verification that the strict CSP blocks inline code without breaking supported journeys;
- possible BFF/HttpOnly-cookie migration if required by the final threat model;
- Stripe Connect and legal/financial design before any third-party marketplace settlement.

## Pilot commerce boundary

Persistent staging and the first customer pilot default to `PRODUCT_PAYMENT_MODE=disabled`. Stripe remains enabled for organizer SaaS subscriptions, but the platform does not claim multi-vendor product settlement, payouts or merchant-of-record operation. Enabling visitor checkout requires a separate threat, legal and operational review.

## Authentication and lifecycle controls

- Cognito enforces a 12-character password with uppercase, lowercase, number and symbol requirements; frontend validation uses the same policy.
- Software-token MFA is enabled as an optional User Pool factor and challenge completion is supported by the SPA.
- Password recovery requires the Cognito delivery code and never passes a password through an application Lambda.
- Organization ownership transfer and stand reassignment use DynamoDB transactions with audit records.
- Account deletion is denied while the user owns an organization or remains assigned to a stand.
- Successful deletion removes saved stands, anonymizes orders, removes ordinary memberships and deletes the Cognito identity.

## Access-token lifetime and revocation

Token revocation does not promise instantaneous invalidation of every already-issued JWT. The current access-token lifetime is 60 minutes. Sensitive operations must therefore continue to check current server-side membership, ownership, account and entitlement state. Any future requirement for materially shorter revocation latency must be implemented and tested explicitly rather than inferred from logout behavior.
