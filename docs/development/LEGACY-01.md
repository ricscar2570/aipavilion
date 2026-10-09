# LEGACY-01 — Canonical writer consolidation

**Release:** `0.8.6-legacy.1`
**State:** source complete; local static/contract proof complete; dependency-driven and AWS proof subject to the recorded environment boundary.

## Objective

Before the internal pilot, every surface capable of writing canonical data must use the current domain invariants or be disabled. Cosmetic refactoring may wait; semantic unification may not.

## Completed work

### Writer inventory

`config/writer-inventory.json` declares runtime, shared-library, reconciler, synthetic, migration and repair writers. The inventory records the domain, affected tables, operating mode and required controls.

`node scripts/check-legacy-writers.js` independently discovers mutation-capable sources and fails on:

- undeclared writers;
- missing inventory paths or metadata;
- mutation commands inside the read-only admin handler;
- mutable admin routes or CRUD IAM policies;
- undocumented admin mutations in OpenAPI;
- synthetic writers without the production guard;
- migration/repair commands that are not plan-only by default;
- active runtime writes of retired AR/tour fields.

### Dependency-free proof

`npm run test:legacy:static` runs without installed npm dependencies. It verifies the writer inventory, canonical stand fixtures, the production guard for synthetic writers and an actual `POST /admin/stands` invocation that must return `405` without touching DynamoDB.

### Platform-admin stand boundary

The old global create/update/delete handlers were removed. The active surface contains only:

```text
GET /admin/stands
GET /admin/stands/{standId}
```

Direct `POST`, `PUT`, `PATCH` or `DELETE` invocation fails closed with `405`. SAM grants read-only table access and OpenAPI publishes no mutation operation.

### Canonical stand domain

`backend/lambda/common/stand-domain.js` centralizes:

- schema version 4;
- canonical draft creation;
- private contact defaults;
- fail-closed public-state derivation;
- structural validation for fixtures and generated stands.

Invitation acceptance now creates draft stands through this domain function.

### Synthetic and migration writers

Development seed, test-user and smoke writers require explicit synthetic-fixture permission and reject production-like destinations. The development fixtures are canonical and revisioned. Migration and quota reconciliation remain plan-only unless apply mode is explicitly selected.

### Quality repairs included in the baseline

The review found regressions inherited from the preceding prerelease in event and exhibitor-stand mutation paths. They were repaired before packaging LEGACY-01:

- event publication, archive, stand assignment and moderation again exist as executable handlers;
- internal mutations increment monotone revisions;
- conditional conflicts are surfaced rather than overwriting newer state;
- event publication and archival propagation update stand publication snapshots through canonical derivation;
- exhibitor stand update and review submission use valid `If-Match`/revision variables.

These repairs are necessary to avoid declaring a writer boundary on top of a broken canonical implementation.

## Exit criteria

LEGACY-01 source exit requires:

- all discovered writers declared;
- no mutable platform-admin stand route;
- read-only admin IAM;
- canonical fixture validation;
- dependency-free runtime rejection test for platform-admin mutations;
- synthetic production guard;
- explicit migration/repair apply mode;
- SAM/OpenAPI/template-pilot parity;
- unit and contract regressions where the dependency toolchain is available;
- independently verified release package.

## Remaining proof

The following are not implied by source completion:

- AWS deployment of the exact commit;
- live IAM denial of admin stand writes;
- distributed tenant-escape testing;
- failure injection against all writer categories;
- migration of historical production data;
- independent security assessment;
- customer pilot authorization.
