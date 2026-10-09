# AI Pavilion 0.8.6-auth.1 — Complete AUTH-01 Snapshot

This archive is a complete source and documentation prerelease built on the verified 0.8.5 baseline. It implements Sprint 4.5E.1 / AUTH-01 without claiming completion of the remaining Core Correctness blocks.

It includes:

- all application source code;
- scoped Cognito access-token infrastructure and the Pre Token Generation V2.0 Lambda;
- all 46 protected SAM routes and matching OpenAPI scope contracts;
- server-side invitation identity binding;
- dependency-free authentication contract verification;
- unit regression sources and a dedicated deployed AWS proof;
- regenerated development and retained pilot templates;
- all test, migration and deployment scripts;
- updated English and Italian technical documentation;
- a machine-readable project status;
- a file-level SHA-256 release manifest.

## Verification boundary

Static authentication, syntax, SAM/OpenAPI, infrastructure and phase checks pass. The preparation environment could not resolve the public npm registry and did not provide AWS/SAM tooling. Jest, coverage, lint, format, esbuild, Vite, npm audit, SAM validation/build and live Cognito/API Gateway proof are therefore external gates, not claimed results.

The software remains pre-production. `npm run test:auth:deployed` must pass against the exact commit/build before AUTH-01 is considered demonstrated on AWS.
