# CONCURRENCY-01 — optimistic concurrency and lost-update protection

## Status

Source complete in `0.8.6-export.1`; distributed AWS proof remains required.

## Contract

Canonical editorial mutations use a strong numeric revision token:

```http
If-Match: "7"
```

A successful mutation increments the revision and returns the new strong `ETag`.

- missing precondition: `428 PRECONDITION_REQUIRED`;
- malformed precondition: `400 INVALID_IF_MATCH`;
- stale revision: `409 CONCURRENT_UPDATE`;
- successful mutation: `200` plus a new `ETag`.

Legacy records without a revision are treated as revision 1 exactly once. New records receive revision 1.

## Protected writers

The implementation covers the primary organization, membership, event, exhibitor-stand, exhibitor-lead and platform-admin editorial writers. Multi-item invariants continue to use DynamoDB transactions; optimistic locking does not replace them.

Membership removal is represented by a revisioned tombstone so that deleting and recreating the same logical key cannot make an old revision valid again.

Internal billing, publication, moderation, assignment and invitation transitions increment revisions so that stale browser copies are invalidated even when the internal command does not use an HTTP `If-Match` header.

## Browser behavior

The API client caches revisions learned from strong `ETag` headers and resource representations. It sends the last observed revision on protected mutations. A conflict requires a reload and deliberate retry; the client must never silently overwrite the newer representation.

## Remaining proof

Before pilot approval:

1. deploy the stack;
2. issue two genuinely simultaneous writes with the same revision;
3. prove exactly one succeeds;
4. prove the loser receives `409`;
5. test organization updates concurrent with ownership transfer and billing updates;
6. test membership remove/recreate ABA scenarios;
7. retain the reports against the exact commit and stack identifiers.
