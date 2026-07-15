# Security policy

AI Pavilion `0.8.x` is a pre-production controlled-pilot line. It must not process customer production data, live Stripe charges or third-party marketplace payouts until the deployed Phase 5 assurance gates are complete.

## Reporting a vulnerability

Report vulnerabilities privately to the repository owner with the affected route, reproduction steps, impact and proposed mitigation. Never include real credentials, access tokens, payment data or personal data in a public issue.

## Current security invariants

- Secrets remain outside source control and frontend configuration.
- Protected APIs use Cognito access tokens.
- Platform administration independently verifies token signature, use and `admin` group.
- Tenant authorization is resolved server-side from an active membership.
- Browser-supplied organization IDs or role names do not grant access.
- Organizations, events, invitations, stands, leads, audit events and billing data are checked against membership or ownership.
- Cross-tenant resources are rejected or concealed as not found.
- Invitation acceptance is bound to the invited email and uses a DynamoDB transaction.
- Organizer moderation accepts only valid stand-state transitions.
- Public routes expose only published public events and stands through field allowlists.
- Product prices, currency and purchasability are determined by the backend.
- Critical mutations use strict payload shapes and idempotency identifiers.
- Checkout reserves a deterministic order before creating a payment intent.
- Stripe payment and billing webhook signatures are verified against the raw body.
- Webhook event IDs are conditionally claimed; failed billing events can be safely retried and stale state regressions are blocked.
- SES event publication is restricted to the account-owned invitation SNS topic.
- Anonymous lead submission supports Turnstile verification and infrastructure rate limiting.
- User-facing responses exclude Stripe, ownership, idempotency and internal retention fields.
- Privileged tenant actions create retained audit events.
- Personal-data export excludes payment secrets and internal processing identifiers.
- Request lifecycle logs exclude authorization headers and request bodies.
- Cognito confirmation creates an application profile without trusting browser role data.
- Staging CI uses short-lived AWS credentials through GitHub OIDC.
- Pilot templates enable point-in-time recovery and retain stateful resources.

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
- removal of CSP `style-src 'unsafe-inline'` after legacy inline styles are eliminated;
- possible BFF/HttpOnly-cookie migration if required by the final threat model;
- Stripe Connect and legal/financial design before any third-party marketplace settlement.
