# Phase 3 report: multi-tenant pilot foundation

## Objective

Convert the hardened single-tenant prototype into a controlled B2B SaaS vertical in which a platform administrator creates customer organizations, organizers create events and invite exhibitors, exhibitors manage assigned stands and leads, and visitors browse only published resources.

## Completed implementation

### Domain and persistence

- 13 DynamoDB tables and 16 GSIs in the disposable stack.
- Organizations, memberships, entitlements, events, invitations and audit records.
- Organization/event ownership added to stands, leads and interactions.
- Schema-version fields on new domain records.
- Canonical fixtures for two complete isolated tenants.

### Authorization

- Cognito access-token identity extraction.
- Active membership lookup for tenant APIs.
- Owner/organizer/exhibitor role enforcement.
- Stand ownership enforcement for exhibitors.
- Cross-tenant denial tests for organizations, events, stands, invitations and leads.
- Platform administration kept separate from tenant membership.

### Organizer vertical

- Organization read, membership list and entitlement APIs.
- Event create/list/read/update/publish APIs.
- Exhibitor invitation creation.
- Event stand review and published/rejected moderation.
- Organizer browser portal.

### Exhibitor vertical

- Invitation acceptance bound to the invited email.
- Transactional membership and draft-stand creation.
- Assigned stand list/read/update/submit APIs.
- Lead list/export/status-update APIs.
- Exhibitor browser portal.

### Public vertical

- Published event list and detail.
- Event-specific published stand list.
- Existing public stand catalogue preserved with tenant/event projections.
- Public visibility only after event publication and stand approval.

### Supporting controls

- Plan entitlement and limit checks.
- Audit-event writes for privileged actions.
- Cognito post-confirmation profile synchronization.
- Updated OpenAPI 3.1 and route/authorizer parity checks.
- Expanded deployed smoke and Playwright multi-role journeys.

## Local verification

- 163 local tests passed.
- 7 AWS integration tests are prepared and skipped without a deployed stack.
- 18 Lambda handlers bundle successfully.
- 42 SAM API events and 41 OpenAPI paths are reconciled.
- 51 Node.js files pass syntax validation.
- Formatting and ESLint pass with zero warnings.
- Coverage: 78.45% statements, 68.37% branches, 75.71% functions and 78.59% lines.
- Vite production build succeeds.

## Verification boundary

The preparation environment did not provide AWS CLI, AWS SAM CLI or deployment credentials. Therefore this report does not claim that CloudFormation, Cognito, API Gateway, DynamoDB integration, Stripe test-mode callbacks or the Playwright journey were executed against live AWS services.

The repository contains the deployment wrapper, seed, six-role identity provisioning, DynamoDB tests, API smoke test, browser journey and destruction guard required to perform that verification in an isolated development account.

## Remaining risks before production

- the stack is intentionally disposable and lacks production retention policies;
- rate limiting, WAF and bot protection are not implemented;
- invitation delivery is a shareable-link pilot flow, not an email service;
- plan entitlements are seeded records, not synchronized billing subscriptions;
- frontend hosting, TLS, CSP and cache invalidation are not infrastructure-managed;
- accessibility, penetration testing and disaster recovery remain unverified;
- tenant migration tooling is not yet sufficient for a live-data rollout;
- support and operational response tooling remain incomplete.
