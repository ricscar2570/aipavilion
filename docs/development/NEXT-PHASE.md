# Next phase: execute the protected Internal Pilot promotion plan

Release `0.9.0-internal-pilot.1` adds the promotion harness above the cumulative source baseline `v0.8.8-4.5g.2`. No additional product feature is required for the next gate.

## What must happen now

1. Run preflight in the protected non-production AWS account.
2. Produce exact-commit dependency CI evidence.
3. Produce SAM validate/build evidence.
4. Deploy the exact commit without console edits.
5. Prove Cognito/API Gateway and the core AWS contracts.
6. Prove browser behavior under the strict CSP.
7. Execute security, tenant escape, failure injection, Stripe, SES, WAF, load and restore suites.
8. Complete WCAG, privacy/legal, penetration, incident, rollback and support approvals.
9. Collect all records for the same commit and environment.
10. Run `npm run internal-pilot:status` and then `npm run internal-pilot:promote`.

## Expected local result

In a local environment without AWS CLI, SAM CLI, credentials, staging URLs and controlled fixtures, preflight is expected to report `PENDING`. This is not a failed implementation; it is the fail-closed safety boundary working correctly.

## Promotion result

Only a complete matrix produces a receipt authorizing:

```text
0.9.0 — Internal Pilot Ready
```

The receipt never authorizes production or customer data.
