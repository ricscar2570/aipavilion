# Phase 1 consolidation report

Date: 2026-07-14  
Repository version: `0.4.0`

## Objective

Create a single reproducible codebase and remove the blockers that prevented the original prototype from operating as an integrated AWS application.

## Completed structural work

- Selected the root tree as the canonical application.
- Removed the duplicate `platform/` application and duplicate Lambda directories.
- Removed the competing shell-script deployment system.
- Removed unreachable frontend branches and global inline event handlers.
- Archived obsolete product and deployment documents.
- Added a committed lockfile, Node engine constraints, ESLint, an enforced Prettier gate, and editor settings.
- Removed stale per-Lambda dependency manifests and an exported DynamoDB metadata snapshot; the root manifest and `template.yaml` are now authoritative.
- Upgraded Vite and esbuild to a dependency set with a clean npm audit.

## Completed backend corrections

- Replaced invalid shared-layer relative imports with esbuild-bundled Lambda artifacts.
- Corrected the stand detail path parameter from `id` to `standId`.
- Unified order keys and timestamps as `orderId`, `userId`, and `createdAt`.
- Unified saved-stand and interaction table fields in camelCase.
- Added Cognito authorizers to protected user and checkout routes.
- Added `/user/orders`, `/user/account`, and `/stands/contact` implementations.
- Added missing `/admin/orders` and `/admin/analytics` infrastructure routes.
- Replaced the placeholder Cognito user list with a real paginated `ListUsers` implementation.
- Removed full API Gateway event logging from the admin function.
- Added a 90-day TTL to stored interaction events.

## Checkout security corrections

- The browser no longer supplies authoritative product names, prices, or currency.
- The backend resolves products and prices from the stands catalogue.
- Orders are associated with the authenticated Cognito user.
- Order retrieval and confirmation enforce ownership.
- Stripe webhooks verify their signature and tolerate replayed state updates.
- Internal payment intent and customer-email fields are excluded from order responses.
- Stripe create requests include an idempotency key.

## Frontend corrections

- Added a real order-success route and order retrieval state.
- Corrected user-order pagination and schema usage.
- Corrected hash-based sharing links.
- Removed inline `onclick` handlers from stand detail interactions.
- Added validated lead submission with explicit privacy acknowledgement.
- Changed checkout payloads to identifiers and quantities only.

## Quality gates added

- `npm run lint`
- `npm run check:syntax`
- `npm run check:contracts`
- `npm run check:bundles`
- `npm test`
- `npm run build`
- `npm run verify` as the aggregate gate

## Verified result

- 146/146 Jest tests pass.
- Measured coverage is 78.13% statements, 69.93% branches, 73.41% functions, and 78.24% lines. The enforced lower gate remains 75% statements/lines, 65% branches, and 70% functions; it is a regression floor, not the final commercial target.
- 23 API events are contract-checked.
- 12/12 Lambda sources are referenced and bundle successfully.
- The Vite production build succeeds.
- `npm audit --audit-level=high` reports zero vulnerabilities.
- The active JavaScript source passes ESLint with zero warnings.

## Not yet verified

- A local SAM CLI was unavailable in the audit environment, so `sam validate --lint` and `sam build` remain CI/workstation checks.
- No AWS development stack was deployed during this phase. The protected GitHub workflow currently deploys the SAM backend only; frontend S3/CloudFront provisioning and publication remain part of the deployed-integration phase.
- No real Cognito, DynamoDB, Secrets Manager, Stripe, API Gateway, S3, or CloudFront integration test was executed.
- No browser end-to-end, load, penetration, accessibility, backup-recovery, or disaster-recovery test has been performed.

The phase converts the repository from an internally contradictory prototype into a coherent development baseline. It does not by itself make the product commercially ready.
