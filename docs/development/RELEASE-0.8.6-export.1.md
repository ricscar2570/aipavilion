# AI Pavilion 0.8.6-export.1

This prerelease completes the source implementation of CONCURRENCY-01 and EXPORT-01 on top of the verified `0.8.6-invite.1` history.

An earlier artifact bearing a CONCURRENCY-01 name contained only a `NOT_READY` receipt and no usable repository. It is not a canonical source release. This release restores the actual implementation in Git and must be used as the authoritative successor to `v0.8.6-invite.1`.

## Included

- strong `If-Match`/`ETag` revision contract;
- `428` for missing preconditions;
- `409` for stale revisions;
- revisioned membership tombstones;
- invalidation of stale copies by internal writers;
- complete paginated lead CSV export;
- spreadsheet-formula neutralization;
- complete personal JSON export;
- explicit synchronous export thresholds;
- `413` rather than silent truncation;
- updated SAM pilot configuration, OpenAPI, tests and release gates.

## Release boundary

This is not the final `0.8.6`. AUTH-01, QUOTA-01, INVITE-01, CONCURRENCY-01 and EXPORT-01 are source-complete, while LEGACY-01 remains open. AWS Cognito, DynamoDB concurrency, scale and browser proofs remain mandatory.
