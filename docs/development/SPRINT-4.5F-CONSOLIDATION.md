# Sprint 4.5F consolidation — runtime-complete source baseline

**Release:** `0.8.8-4.5g.2`
**Date:** 24 August 2026
**State:** source-integrated and dependency-free gates passed; distributed and manual evidence pending.

## Why this consolidation exists

The earlier 4.5G package contained the operational evidence harness but its own audit still marked parts of the 4.5F prerequisite as incomplete. This consolidation connects those prerequisite controls to the active runtime instead of treating helper modules or documentation as proof.

## Runtime controls now connected

### Uniform API errors

`backend/lambda/common/observability.js` normalizes every handler response through the canonical error envelope and converts unhandled exceptions into a safe request-correlated `500` response. Credential-like detail keys are removed recursively. The frontend consumes structured codes, request IDs and retryability.

### Session lifecycle

The SPA installs the global session lifecycle and distinguishes expired sessions, offline/online changes, rate limiting and temporary service unavailability. These source controls do not replace browser and assistive-technology evidence.

### Turnstile context

The public lead endpoint validates the Turnstile result server-side, including configured hostname, action and challenge age. Future timestamps are rejected.

### IP-data minimization

No source-IP derivative is retained by default. When explicitly enabled, the lead endpoint uses a secret-bound HMAC pseudonym obtained through Secrets Manager. The value remains pseudonymous personal data and requires an approved purpose and retention rule.

### Recoverable publishing saga

Event publication is fail-closed and checkpointed:

```text
draft → publishing → published
                 ↘ publish_failed → publishing
```

Each invocation processes a bounded page of stands. A pending page returns `202` and a checkpoint. A failure preserves the operation ID and checkpoint for retry. Only the final transaction changes the owner event to fully published.

### Owner-event public barrier

Global stand list, search and detail endpoints verify the owner event with a consistent read before returning a stand. A stand prepared during a partial publication cannot become visible while the event is `publishing`, `publish_failed`, private or otherwise incomplete.

### Editorial mutation rule

Editing an already published event returns it immediately to a hidden draft and removes the active publication proof. Events in `publishing`, `publish_failed`, `archiving` or `archived` cannot be edited. Transitional events cannot be duplicated. This prevents stale stand snapshots from remaining publicly authoritative after editorial changes.

### Data migration

Migration `004-publishing-saga-state` recognizes only explicit historical publication evidence. Ambiguous records become draft/hidden. The migration is plan-first and requires a controlled maintenance window and restore capability.

## Proof boundary

Passed locally without external dependencies:

- syntax and source contracts;
- API error normalization;
- safe exception envelope;
- publication state transitions;
- public-event barrier logic;
- Turnstile context validation;
- HMAC opt-in behavior;
- runtime wiring checks;
- migration decision logic;
- pilot-template parity;
- local 4.5G security scan.

Still pending:

- full dependency installation and the Jest/coverage/lint/build/audit gates on this exact commit;
- SAM validation/build;
- AWS deployment and interruption/retry evidence;
- browser, WCAG and privacy/legal approval;
- tenant isolation, load, WAF, Stripe, SES, restore and penetration evidence.
