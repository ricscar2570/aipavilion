# ADR-003 — Scoped Cognito access tokens at the API boundary

- **Status:** Accepted for `0.8.6-auth.1`
- **Date:** 2026-08-23
- **Decision owner:** AI Pavilion engineering
- **Related gate:** Sprint 4.5E.1 / AUTH-01

## Context

The active frontend signs users in with Cognito user-password/SRP flows and sends the Cognito access token to protected REST API Gateway routes. The previous SAM authorizer did not declare authorization scopes. For a REST API Cognito authorizer, a method without scopes is not an explicit access-token contract. Invitation acceptance also assumed that the access token contained an `email` claim.

The application already has fine-grained authorization in Lambda handlers: active tenant membership, application role, ownership, assignment and entitlement. These controls must remain server-owned and must not be replaced by Cognito scopes.

## Decision

AI Pavilion uses the following layered contract:

```text
valid Cognito access token
+ required coarse API scope
+ active server-side membership when applicable
+ application role policy
+ ownership/assignment/resource relationship
+ entitlement
= authorized operation
```

### Coarse scopes

The Cognito resource server identifier is `aipavilion` and defines:

- `aipavilion/user` — signed-in user surfaces;
- `aipavilion/tenant` — tenant and exhibitor surfaces, still subject to membership and resource checks;
- `aipavilion/platform-admin` — platform administration, still subject to the Cognito `admin` group and the independent admin verifier.

Every authenticated user receives `user` and `tenant`. Only a user in the `admin` Cognito group receives `platform-admin`. Giving every authenticated identity the coarse tenant scope is deliberate: the scope grants access to the tenant API family, not membership in a tenant. Lambda authorization remains authoritative.

### Token customization

A Cognito Pre Token Generation trigger using event version `V2_0` adds the custom scopes to access tokens produced by authentication and refresh flows. The user pool explicitly selects the Cognito `ESSENTIALS` tier required by this capability.

### Persistent authentication plane

The staging template retains the entire Cognito authentication plane as one coherent unit: user pool, resource server, app client, groups, Pre Token Generation trigger, Post Confirmation profile-sync trigger and their invocation permissions. Retaining only the user pool would leave an orphaned pool without the client, scopes or trigger functions required by the contract.

### API Gateway

Every protected SAM event declares exactly one required authorization scope. The OpenAPI operation contains the matching `x-cognito-authorization-scope` extension. `npm run check:auth` verifies the parity.

### Identity and email

`sub` is the canonical authenticated identity. Email is not an authorization claim. Invitation acceptance loads the application profile from `UsersTable` with a consistent read and compares the invitation recipient with the normalized server-side profile email.

### Revocation boundary

Access tokens remain valid according to Cognito token lifetime and authorizer behavior. `EnableTokenRevocation` and refresh-token revocation do not create a promise of instantaneous invalidation of every already-issued JWT. Sensitive operations must continue to verify current server-side state such as membership, ownership and account status.

## Consequences

### Positive

- API Gateway now has an explicit access-token contract.
- An ID token cannot satisfy scoped protected methods.
- Route families are separated at the gateway without moving tenant authorization into Cognito.
- Invitation acceptance no longer depends on optional access-token identity attributes.
- Deployed evidence can prove the contract independently of the broader application smoke test.
- A retained pilot user pool cannot outlive the client, custom scopes and trigger functions that make it usable.

### Costs and limitations

- Cognito Essentials is an explicit infrastructure and pricing dependency.
- The Pre Token Generation Lambda is on the authentication critical path.
- A live AWS deployment is required to prove trigger invocation, token contents and API Gateway enforcement.
- Token revocation latency remains bounded by the configured token lifetime and AWS behavior.

## Verification

Static and dependency-free gates:

```bash
npm run check:auth
npm run check:contracts
npm run check:openapi
npm run check:infrastructure
```

Deployed gate:

```bash
npm run test:auth:deployed
```

The deployed gate verifies access-token metadata and scopes, scope preservation after refresh, ID-token rejection, missing-admin-scope rejection and continued server-side membership enforcement.
