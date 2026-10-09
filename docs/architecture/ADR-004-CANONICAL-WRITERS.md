# ADR-004 — Canonical writers and read-only platform administration

**Status:** Accepted
**Release:** `0.8.6-legacy.1`
**Date:** 24 August 2026

## Context

AI Pavilion evolved from a single/global stand prototype into a tenant-scoped SaaS domain in which a stand belongs to an organization and an event, is assigned to a member, consumes plan capacity, follows moderation and publication state machines, writes an audit trail and carries a monotone revision.

The platform-admin Lambda still exposed an older global stand writer. That writer could create or replace records without the canonical organization/event relationship, quota reservation, moderation state, fail-closed publication fields, audit transaction or revision contract. Keeping two write semantics would make tenant and publication invariants impossible to prove before the pilot.

Synthetic seed tools and migration/repair utilities are also writers. They require a separate, explicit trust boundary so that development fixtures cannot be written accidentally to production-like resources and repair tools cannot mutate data merely by being inspected.

## Decision

1. Every mutation-capable JavaScript source under the active backend and operational scripts is declared in `config/writer-inventory.json`.
2. `npm run check:legacy` discovers mutation-capable files and fails when a writer is undeclared or when its declared controls are incomplete.
3. The platform-admin stand surface is read-only:
    - `GET /admin/stands`;
    - `GET /admin/stands/{standId}`.
4. Stand creation, editing, assignment, moderation and publication use the tenant-scoped event or exhibitor workflows only.
5. The Admin Lambda receives read-only DynamoDB policies for stands and orders. Direct mutation invocation fails closed with `405 Method Not Allowed`.
6. Canonical stand creation uses `backend/lambda/common/stand-domain.js`, schema version 4, fail-closed publication fields and revision 1.
7. Internal writers that alter a canonical event or stand increment its revision and use conditional writes so that stale browser copies remain invalid.
8. Synthetic writers require `ALLOW_SYNTHETIC_FIXTURES=true` and reject production-like environment names, stack names and output files.
9. Migration and quota-repair writers are plan/status-only by default and require an explicit apply action.
10. Development and sample fixture stands are validated against the canonical stand schema before persistence.

## Consequences

### Positive

- There is one semantic write boundary for canonical stand data.
- Platform administrators can inspect the system without bypassing tenant, quota, moderation, audit or revision rules.
- New writers become visible in CI instead of silently expanding the mutation surface.
- Synthetic evidence tooling cannot be enabled accidentally on a production-like stack through ordinary configuration.
- Historical fields such as `ar_enabled`, `tour_enabled` and the legacy `approved` stand status no longer appear in active fixture data or runtime writers.

### Costs and limitations

- Platform administrators cannot directly repair a stand through the generic admin API. Repair must use a tenant workflow or a separately designed, audited repair command.
- The inventory is a control, not a proof that every writer is correct. Domain tests, deployed authorization tests, failure injection and security assessment remain required.
- Previously persisted legacy data still requires versioned migrations and reconciliation; disabling the writer does not rewrite historical records by itself.

## Rejected alternatives

### Retain the legacy admin writer behind the admin role

Rejected because platform-admin authentication does not restore the missing tenant, event, quota, moderation, publication, audit and revision invariants.

### Add the missing fields inside the admin handler

Rejected because it would duplicate domain logic and create a second implementation that could drift again.

### Remove all administrative stand access

Rejected because read-only inspection remains useful for incident response and support, provided it does not create a parallel mutation path.
