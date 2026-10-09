# Sprint 4.5E.1 / AUTH-01 — Scoped Cognito access-token contract

**Release:** `0.8.6-auth.1`
**Date:** 23 August 2026
**Status:** source implementation complete; live AWS evidence pending
**Baseline:** `0.8.5` / Sprint 4.5E

## Objective

Remove the authentication P0 found in the 0.8.5 audit without replacing the existing server-side tenant authorization model or migrating the frontend to a different sign-in experience.

The target contract is:

```text
Access token Cognito valido
+ scope API appropriato
+ membership server-side attiva
+ policy sul ruolo
+ ownership/assegnazione della risorsa
+ entitlement
= operazione autorizzata
```

## Implemented changes

### Cognito and infrastructure

- Added the `aipavilion` Cognito resource server.
- Added coarse scopes `user`, `tenant` and `platform-admin`.
- Explicitly selected the Cognito `ESSENTIALS` user-pool tier.
- Added a Pre Token Generation `V2_0` Lambda trigger.
- Added invocation permission and a generated pilot equivalent.
- Made the complete persistent Cognito plane retain together in staging: pool, resource server, app client, groups, both trigger functions and both invocation permissions.
- Added stack outputs for the three canonical scope names.
- Increased the authoritative Lambda count from 23 to 24.

### Token generation

`backend/lambda/pre-token-generation/index.js`:

- adds `aipavilion/user` and `aipavilion/tenant` to every authenticated user;
- adds `aipavilion/platform-admin` only to the Cognito `admin` group;
- handles authentication, new-password, device, hosted-auth and refresh trigger sources;
- preserves existing claim/scope overrides;
- fails closed if invoked with an event version that cannot customize access tokens.

### API boundary

All 46 protected SAM events now declare:

- `Authorizer: CognitoAuthorizer`;
- one expected `AuthorizationScopes` value.

The OpenAPI 3.1 contract documents the same scope on every protected operation and explicitly identifies the bearer token as a Cognito access token.

### Fine-grained authorization retained

Custom scopes are not tenant roles. Existing Lambda checks still load and verify:

- membership;
- membership status;
- owner/organizer/exhibitor role;
- stand assignment;
- resource ownership;
- entitlement;
- Cognito `admin` group for platform administration.

### Invitation identity binding

Invitation acceptance no longer requires an `email` claim in the access token. It now:

1. identifies the actor by `sub`;
2. consistently reads the corresponding application profile from `UsersTable`;
3. rejects deleted, missing or invalid profiles;
4. compares the normalized server-side profile email with the invitation recipient;
5. uses that value in the transactional invitation condition.

### Verification assets

Added:

- `scripts/check-auth-contract.js` — source, SAM, OpenAPI and executable scope invariants;
- `tests/unit/pre-token-generation.test.js`;
- `tests/unit/auth-contract.test.js`;
- invitation regression tests without an access-token email claim;
- `scripts/dev/auth-contract-deployed.js` — dedicated AWS proof including refresh-token scope preservation;
- the deployed proof in the disposable deploy workflow;
- the deployed proof in the staging evidence bundle;
- expanded normal API smoke assertions.

## Traceability

| Requirement | Invariant                                                                                                                  | Components                                                    | Automated proof                                                 | Remaining release evidence                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| AUTH-01-01  | A protected method accepts only a Cognito access token with the expected coarse scope.                                     | `template.yaml`, `docs/api/openapi.json`, `auth-scopes.js`    | `check-auth-contract.js`, `auth-contract.test.js`               | `test:auth:deployed` on the exact build.       |
| AUTH-01-02  | Coarse scopes never replace membership, role, ownership or entitlement authorization.                                      | API Gateway scopes plus tenant authorization helpers/handlers | visitor-with-tenant-scope denial in `auth-contract-deployed.js` | AWS evidence showing `403` without membership. |
| AUTH-01-03  | Invitation acceptance binds `sub` to the normalized server-side profile email, not an optional token claim.                | `invitations/index.js`, `UsersTable` policy/configuration     | `check-auth-invitation-binding.js`, Phase 3 regression source   | Full Jest run and deployed invitation journey. |
| AUTH-01-04  | Authentication and refresh flows preserve the correct scope set; only the Cognito `admin` group receives `platform-admin`. | Pre Token Generation V2.0 Lambda                              | executable static check and `pre-token-generation.test.js`      | Deployed login and refresh proof.              |
| AUTH-01-05  | An ID token cannot satisfy a scoped protected method.                                                                      | API Gateway method scopes                                     | OpenAPI/SAM parity check                                        | Deployed ID-token rejection.                   |
| AUTH-01-06  | A retained pilot pool cannot outlive the client, resource server, groups or trigger functions required by the contract.    | generated pilot template                                      | retained-auth-plane assertions in `check-auth-contract.js`      | CloudFormation deploy/update/delete rehearsal. |

## Verification completed in the preparation environment

| Gate                              | Result                                   |
| --------------------------------- | ---------------------------------------- |
| Authentication contract           | PASS — 46 protected SAM events           |
| General SAM route/Lambda contract | PASS — 56 API events, 24 Lambda sources  |
| OpenAPI                           | PASS — 54 paths                          |
| Infrastructure semantics          | PASS — 77 resources, 17 DynamoDB indexes |
| Node.js syntax                    | PASS — 85 files                          |
| Phase 3 asset gate                | PASS                                     |
| Phase 4 asset gate                | PASS                                     |
| Sprint 4.5C asset gate            | PASS                                     |
| Sprint 4.5D asset gate            | PASS                                     |
| Sprint 4.5E asset gate            | PASS                                     |
| Pilot template parity             | PASS                                     |
| Lockfile portability              | PASS — 599 public npm artifacts          |
| Bash syntax                       | PASS                                     |

## Verification not claimed

The environment could not resolve `registry.npmjs.org`, so dependency installation did not complete. The following are therefore not claimed for this release preparation:

- Jest suite and coverage;
- ESLint;
- Prettier;
- esbuild Lambda bundle gate;
- Vite production build;
- npm audit;
- SAM CLI validation/build;
- CloudFormation deployment;
- live Pre Token Generation invocation;
- live API Gateway scope enforcement;
- Cognito refresh/revocation behavior.

The repository contains the tests and deployed evidence command required to close those gates in public CI and an isolated AWS account.

## Exit status

AUTH-01 source implementation is complete, but its highest-value acceptance criterion remains externally open:

```text
npm run test:auth:deployed
```

The release must remain pre-production until that AWS evidence is green and retained against the exact commit/build.

## Next canonical block

`QUOTA-01 — Atomic entitlement counters, reservations, idempotency and drift reconciliation.`
