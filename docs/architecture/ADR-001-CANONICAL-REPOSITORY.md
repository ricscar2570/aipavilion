# ADR-001: one canonical application tree

- Status: accepted
- Date: 2026-07-14

## Context

The original repository contained parallel root and `platform/` applications, duplicate Lambda implementations, two incompatible deployment approaches, and frontend modules that were not reachable from the active entry point. It was impossible to determine reliably which files represented the deployable product.

## Decision

The repository root is the only canonical application tree.

- `backend/lambda/` contains every active Lambda.
- `frontend/` contains the only active browser application.
- `template.yaml` is the only infrastructure definition.
- AWS SAM plus esbuild is the only backend packaging and deployment path.
- `package-lock.json` is committed and `npm ci` is mandatory in CI.
- Historical code and product documents are archived outside the active source graph.

Each Lambda uses a shared `CodeUri` and a specific esbuild `EntryPoints` value. Shared modules are bundled into each artifact rather than referenced through invalid runtime-relative layer paths.

## Consequences

Positive consequences:

- deterministic installation and build;
- no ambiguous source authority;
- Lambda dependency failures are detected locally;
- infrastructure routes can be checked against frontend endpoints;
- deployment changes are reviewable in one template.

Trade-offs:

- bundle artifacts repeat small shared modules;
- archived implementations are no longer maintained;
- future architecture changes must update this ADR or supersede it with a new decision record.
