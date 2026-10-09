# Sprint 4.5G evidence runbook

## Preparation

1. Deploy the exact tagged commit to the controlled staging account.
2. Record stack IDs, region, CloudFront distribution, API URL and configuration hashes.
3. Create two synthetic tenants with distinct owner, organizer, exhibitor and visitor accounts.
4. Seed sentinel values that make any cross-tenant response detectable.
5. Store tokens only in ephemeral CI secrets; never in evidence files.
6. Set `EVIDENCE_DIR` to the protected run directory.

## Execution order

1. `npm run phase4.5g:security`
2. `npm run phase4.5g:tenant-escape`
3. `npm run phase4.5g:failure-injection`
4. `npm run phase4.5g:stripe`
5. `npm run phase4.5g:ses`
6. `npm run phase4.5g:waf`
7. `npm run phase4.5g:load`
8. `npm run phase4.5g:restore`
9. `npm run phase4.5g:evidence-check`

## Approval

Evidence is accepted only when it contains the exact commit SHA, environment, timestamps, configuration, status and redacted observations. A human reviewer signs the restore, security and tenant-isolation reports. No customer data is permitted in the synthetic evidence environment.
