# EXPORT-01 — complete, bounded and spreadsheet-safe exports

## Status

Source complete in `0.8.6-export.1`; distributed scale proof remains required.

## Lead CSV export

The lead export now:

- traverses every DynamoDB query page;
- applies an optional status filter across all pages rather than only the first page;
- emits UTF-8 CSV with BOM and CRLF line endings;
- quotes every cell;
- flattens embedded line endings;
- strips NUL bytes;
- neutralizes spreadsheet formulas beginning, after leading controls or whitespace, with `=`, `+`, `-` or `@`;
- reports the complete row count in `X-Export-Row-Count`;
- sets `Cache-Control: private, no-store`;
- returns `413` with `asyncRequired: true` instead of silently truncating an oversized export.

The synchronous pilot threshold defaults to 10,000 lead rows and is configurable through `SYNC_EXPORT_MAX_ROWS`.

## Personal JSON export

The personal export traverses all pages for memberships, orders and saved stands. A successful document includes:

- `exportVersion`;
- `complete: true`;
- `datasetCounts`;
- `sourcePages`;
- sanitized orders with payment secrets removed.

It is bounded by explicit item and byte thresholds. If the complete result exceeds either threshold, the endpoint returns `413` and no partial document.

## Scale strategy

The synchronous path is appropriate for the controlled pilot. A future asynchronous export must use a private object, short-lived signed URL, explicit job state and automatic deletion. It must not be introduced by silently increasing Lambda response limits.

## Remaining proof

Before pilot approval:

1. seed more than one DynamoDB page for every exported dataset;
2. verify exact row/item counts;
3. open malicious CSV fixtures in supported spreadsheet applications;
4. verify the threshold returns `413` without partial output;
5. measure duration, memory and response size near the configured threshold;
6. complete privacy/legal review of every included field.
