# Sprint 4.5G — Adversarial and Operational Proof

**Release:** `0.8.8-4.5g.2`
**State:** evidence harness complete; 4.5F runtime prerequisite consolidated; distributed evidence pending.

## Purpose

Sprint 4.5G is not a declaration that AWS, Stripe, SES, WAF, load, restore or tenant isolation have passed. It makes each proof executable, reproducible and attributable to an exact commit. Promotion is permitted only when every mandatory evidence record reports `PASS` in the controlled target environment.

## Evidence suites

| Suite                 | Command                                                 | Current state                                               |
| --------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| Local source/security | `npm run phase4.5g:local`                               | PASS on the source baseline                                 |
| Tenant isolation      | `npm run phase4.5g:tenant-escape`                       | PENDING — requires two controlled tenants and role tokens   |
| Failure injection     | `npm run phase4.5g:failure-injection`                   | PENDING — requires disposable/staging fixtures              |
| Load profile          | `ALLOW_LOAD_TEST=true npm run phase4.5g:load`           | PENDING — requires approved staging target                  |
| Stripe                | `npm run phase4.5g:stripe`                              | PENDING — requires test-mode credentials and tenant fixture |
| SES                   | `ALLOW_EXTERNAL_EMAIL_PROOF=true npm run phase4.5g:ses` | PENDING — requires controlled addresses and AWS access      |
| WAF                   | `ALLOW_WAF_PROOF=true npm run phase4.5g:waf`            | PENDING — requires staging URL and permission               |
| Restore               | `ALLOW_RESTORE_DRILL=true npm run phase4.5g:restore`    | PENDING — requires controlled restore account               |
| Evidence matrix       | `npm run phase4.5g:evidence-check`                      | PENDING until every required suite passes                   |

## 4.5F prerequisite status

```json
{
    "api_error_runtime": true,
    "session_lifecycle_installed": true,
    "turnstile_context_runtime": true,
    "ip_minimization_hmac_runtime": true,
    "publishing_saga_runtime": true,
    "public_event_barrier_runtime": true,
    "publishing_migration": true
}
```

These are source/runtime integration results, not distributed operational evidence. Manual WCAG 2.2 AA, privacy/legal approval, browser proof and AWS interruption/recovery proof remain separate gates.

## Non-negotiable release rule

`PENDING` is not `PASS`. Missing credentials, missing tools, unavailable services or absent fixtures must block promotion and produce an explicit pending record rather than a fabricated success.
