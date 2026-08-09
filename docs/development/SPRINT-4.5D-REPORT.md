# Sprint 4.5D report — transactional consistency and payment recovery

Version: 0.8.4

## Objective

Sprint 4.5D reduces the risk that a partial AWS or Stripe failure leaves AI Pavilion in a state that appears failed to the caller while the underlying mutation already succeeded. It also makes payment and billing webhook processing recoverable after timeouts, rejects stale Stripe events, retries DynamoDB partial batch reads and adds scheduled reconciliation against Stripe.

## Transactional audit boundary

The shared audit module now exposes `transactWithAudit` and `buildAuditTransactPut`. Critical state changes and their audit records are committed in the same `TransactWriteItems` call for:

- organization creation and update;
- membership creation, update and removal;
- event creation, update, publication and duplication;
- stand moderation;
- exhibitor stand editing and review submission;
- exhibitor lead updates;
- invitation creation, revocation, resend scheduling and acceptance;
- SES invitation-delivery state and its tenant audit record;
- simulated and Stripe-driven entitlement state with its billing audit record.

Organization ownership transfer and stand reassignment were already transactional and remain so.

External side effects such as sending email or creating a Stripe Checkout Session cannot participate in a DynamoDB transaction. Those operations remain idempotent and their durable follow-up state is committed separately. Invitation delivery telemetry and Stripe-driven entitlement application are transactional with their audit records.

## Recoverable event archiving

Event archival is now a resumable state machine:

1. the event moves atomically to `archiving`, becomes non-public and records `event.archive_started`;
2. every stand belonging to the event is made non-public;
3. the event moves atomically to `archived` and records `event.archived`.

A failure during stand propagation leaves the event hidden in `archiving`. Repeating the archive request resumes propagation instead of moving the event back to a public state.

## Webhook leases

Checkout and SaaS billing webhook claims now contain:

- `status`;
- `attempts`;
- `claimedAt`;
- `leaseToken`;
- `leaseExpiresAt`;
- `stripeCreatedAt`;
- failure or completion timestamps.

Only the worker holding the current lease token can complete or fail the event. A failed event or an expired `processing` lease can be reclaimed conditionally. Processed or currently leased events are treated as duplicates.

Webhook failures are retained as `failed`; checkout no longer deletes the claim record after an exception.

## Stripe event ordering

Order transitions store `lastPaymentEventCreatedAt` and reject events older than the last applied event.

Entitlement updates store `lastStripeEventCreatedAt` and use a conditional update so delayed subscription events cannot overwrite a more recent state. Out-of-order events are treated as ignored rather than as processing failures.

## DynamoDB partial-result retry

The checkout catalogue resolver now uses a bounded exponential-backoff helper for `BatchGetItem.UnprocessedKeys`. The helper retries only the remaining keys, combines all responses and raises a deterministic `DYNAMODB_UNPROCESSED_KEYS` error if the retry budget is exhausted.

## Scheduled reconciliation

A new `PaymentReconciliationFunction` runs every 15 minutes and:

- marks abandoned webhook leases as failed so they can be reclaimed;
- checks stale `creating` and `pending` orders against Stripe PaymentIntent state;
- marks stale orders without an attached PaymentIntent as failed;
- synchronizes Stripe-backed entitlement status and period end with the live subscription;
- uses conditional writes to avoid overwriting concurrent changes.

The reconciler is bounded by `RECONCILIATION_MAX_ITEMS` and `RECONCILIATION_MAX_SCAN_PAGES` and does no Stripe work when product payments or SaaS billing are disabled. Subscription reconciliation also writes a Stripe ordering watermark so a delayed webhook cannot undo the live state just recovered from Stripe.

## Infrastructure changes

The development and generated pilot templates now include:

- `PaymentReconciliationFunction`;
- a 15-minute EventBridge schedule;
- DynamoDB permissions for payment events, orders and entitlements;
- permission to read the Stripe secret;
- a managed reconciliation log group.

The semantic infrastructure checker validates the new function in both templates.

## Automated coverage added

New or expanded tests cover:

- unprocessed catalogue-key retries;
- expired checkout webhook lease reclamation;
- stale order-event rejection;
- expired billing lease reclamation;
- entitlement event ordering;
- abandoned event lease expiration;
- PaymentIntent reconciliation;
- orders without attached PaymentIntents;
- subscription reconciliation;
- transactional audit command shapes.

## Verification boundary

The source and static contracts can be checked without external services. Full Jest, lint, bundle, Vite, SAM and deployed AWS verification still require successful dependency installation and an equipped CI or workstation.

The preparation environment could not complete a public-registry npm installation and did not contain AWS CLI, SAM CLI or deployment credentials. This report therefore does not claim a deployed reconciliation run or real Stripe recovery evidence.

## Remaining risks

- Stripe Checkout Session creation is an external side effect and cannot be atomically committed with its audit row; idempotency limits duplicate creation.
- SES delivery is external; invitation state and audit are atomic before delivery, while delivery telemetry remains asynchronous.
- Search, fail-closed publication rules, contact opt-in and incomplete user-facing controls remain Sprint 4.5E.
- Independent load, restore, security and accessibility evidence remains Sprint 4.5G.
