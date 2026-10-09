# AI Pavilion 0.8.8-4.5G.2

## Release purpose

This cumulative release supersedes `0.8.8-4.5g.1` as the canonical source baseline. It retains the 4.5G adversarial/operational evidence harness and completes the missing 4.5F runtime integration detected by the previous package audit.

## Included improvement blocks

- AUTH-01 — scoped Cognito access-token contract;
- QUOTA-01 — atomic quota/reservation model and reconciliation;
- INVITE-01 — identity-bound invitation protocol;
- CONCURRENCY-01 — monotone revisions and conflict handling;
- EXPORT-01 — complete, formula-safe exports;
- LEGACY-01 — canonical writer boundary;
- 4.5F — error/session/privacy/publication runtime consolidation;
- 4.5G — executable evidence harness.

## Corrected defects

- fixed the API-error module syntax and connected normalization to live handlers;
- connected Turnstile context validation and opt-in IP HMAC to the lead handler;
- implemented checkpointed fail-closed publication with `publish_failed` recovery;
- added a consistent owner-event barrier to all global stand reads;
- added migration 004 for historical publication state;
- made edits to published events fail closed by returning them to draft;
- blocked mutation or duplication of events in transitional states;
- aligned the persistent pilot template and OpenAPI contracts;
- updated inherited source gates for the structured error contract.

## Validation state

```text
SOURCE_CONSOLIDATED
DEPENDENCY_FREE_GATES_PASS
PACKAGE_VERIFICATION_REQUIRED
DISTRIBUTED_EVIDENCE_PENDING
PRODUCTION_NOT_AUTHORIZED
CUSTOMER_DATA_NOT_AUTHORIZED
```

The release is a trustworthy source baseline for staging execution. It is not 0.9.0 Internal Pilot Ready until every mandatory evidence suite reports `PASS` for the exact deployed commit.
