# AI Pavilion 0.9.0-internal-pilot.1

## State

```text
PROMOTION_HARNESS_COMPLETE
LOCAL_CONTRACT_TESTS_REQUIRED
STAGING_PREFLIGHT_PENDING
DISTRIBUTED_EVIDENCE_PENDING
INTERNAL_PILOT_NOT_YET_APPROVED
PRODUCTION_NOT_AUTHORIZED
CUSTOMER_DATA_NOT_AUTHORIZED
```

## Purpose

This prerelease adds a deterministic promotion gate above the 4.5G evidence harness. It prevents a collection of unrelated, stale or partial reports from being interpreted as Internal Pilot readiness.

## Promotion properties

- exact commit matching;
- exact environment matching;
- evidence freshness window;
- PENDING/FAIL/MISSING/STALE blocking;
- named and expiring manual approvals;
- SHA-256 evidence binding;
- production-target refusal;
- test-mode Stripe enforcement;
- machine-readable promotion receipt;
- explicit authorization limited to an internal pilot.

## Current result

In an environment without AWS credentials, SAM CLI, staging URLs and controlled service fixtures, preflight must report `PENDING` and promotion must remain blocked. This is the expected and correct result.
