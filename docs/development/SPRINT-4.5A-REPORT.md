# Sprint 4.5A report: reproducibility and infrastructure contracts

## Objective

Remove the first blockers identified by the 0.8.0 re-evaluation before adding product features or inviting pilot customers.

## Delivered

### Portable dependency graph

- Replaced 599 artifact URLs tied to an internal package proxy with canonical HTTPS tarball URLs under `registry.npmjs.org`.
- Added repository `.npmrc` pinning the public npm registry.
- Added `packageManager: npm@10.9.2` and aligned package/lock version 0.8.1.
- Added a zero-dependency lockfile validator that checks registry host, HTTPS, embedded credentials, root dependency parity and installed package entries.
- Added a deterministic normalizer for future lockfile cleanup.
- Added the portability check before `npm run ci:install` in CI, security, development deployment and synthetic workflows.

### Privacy export repair

- Corrected `USER_SAVED_INDEX` from the nonexistent `user-saved-index` to `user-saved-at-index` in the Lambda fallback, development template and generated pilot template.
- Added an endpoint test assertion for the exact DynamoDB index.

### Semantic infrastructure validation

- Added a zero-dependency CloudFormation contract parser for the canonical and pilot backend templates.
- It verifies:
  - Lambda `CodeUri`, handler files and esbuild entry points;
  - every environment table reference points to a declared DynamoDB table;
  - every referenced table has a matching DynamoDB policy;
  - every index environment value exists and belongs to a table used by the function;
  - table outputs reference real DynamoDB resources;
  - development and pilot resource sets remain aligned.
- Added a built-in regression fixture proving that an undeclared index is rejected.

### First-deployment staging flow

- Removed the requirement to know the generated CloudFront URL before the first backend deployment.
- Added a two-pass deployment path:
  - backend bootstrap;
  - frontend creation and `SiteUrl` discovery;
  - backend finalization with exact CORS and Cognito callback origin.
- Added strict HTTPS-origin validation and custom-domain/certificate consistency checks.
- Added a permission-restricted, non-secret deployment context artifact.

## Verification performed in the preparation environment

Completed:

- JSON parsing and package/lock dependency parity;
- 599 public lockfile URLs verified structurally;
- privacy index consistency across code and both templates;
- semantic validation of 71 CloudFormation resources and 17 DynamoDB indexes;
- JavaScript syntax checks for 67 Node.js files;
- contract validation for 53 API events and 22 Lambda sources;
- OpenAPI validation for 52 paths;
- Bash syntax validation for all development and pilot wrappers;
- parsing of 7 JSON and 9 YAML files with duplicate-key rejection;
- generated pilot template parity;
- Phase 3 and Phase 4 static asset checks;
- a second static verification from the clean 169-file delivery copy.

Not completed in this environment:

- `npm run ci:install` from the public registry, because public DNS/network access was unavailable;
- Jest, ESLint, Prettier, esbuild and Vite gates, because dependencies could not be installed;
- SAM validation/build, because AWS SAM CLI was unavailable;
- AWS deployment, because AWS CLI, credentials and an account were unavailable.

These boundaries are explicit. The repository is prepared so the public CI and an equipped staging account can execute the missing evidence.

## Exit status

Sprint 4.5A code changes are complete. Customer pilot readiness remains blocked by real CI installation, SAM build, AWS staging deployment, complete authentication lifecycle, account ownership deletion rules, webhook lease recovery, transactional audit and external security/accessibility evidence.
