# Threat model addendum — Sprint 4.5G

The adversarial campaign covers broken object-level authorization, broken function-level authorization, stale membership, identifier substitution, cursor manipulation, export leakage, signed-URL scope, webhook replay, idempotency failure, timeout-after-commit, rate-limit bypass, formula injection, public catalogue fail-open states and restore-time isolation.

## Release blockers

- Any cross-tenant disclosure or mutation.
- Any authentication or scope bypass.
- Any live secret in source or evidence.
- Any non-idempotent billing/webhook transition.
- Any unrecoverable data-loss path.
- Any public stand/event visible while its publication saga is incomplete.
- Any critical or unmitigated high-severity finding.
