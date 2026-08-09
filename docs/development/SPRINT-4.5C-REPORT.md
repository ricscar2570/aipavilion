# Sprint 4.5C report — authentication and account lifecycle

## Objective

Close the authentication and account-lifecycle P0 findings before AWS pilot execution. The sprint covers Cognito challenges, password recovery, password-policy consistency, organization ownership transfer, stand reassignment and safe personal-account deletion.

## Implemented

### Cognito lifecycle

- Sign-in supports `NEW_PASSWORD_REQUIRED`.
- Sign-in supports SMS and software-token MFA challenges.
- The dashboard supports software-token MFA enrollment, verification and disablement.
- Forgot-password proceeds from code delivery to code confirmation and new password submission.
- Password changes and recovery use the same validation rules as Cognito.
- Cognito remains the only password processor; application Lambda functions do not receive credentials.
- Local application session data is cleared after sign-out and account deletion.

### Password policy

All user-facing validation now matches the User Pool policy:

- minimum 12 characters;
- one lowercase character;
- one uppercase character;
- one number;
- one symbol.

### Organization ownership

`POST /organizations/{organizationId}/ownership-transfer`:

- requires the current active owner;
- accepts only an active organizer as the target;
- obtains the target email from the server-side profile;
- updates organization ownership;
- promotes the target to owner;
- demotes the previous owner to organizer;
- writes the audit event in the same DynamoDB transaction.

### Stand reassignment

`PATCH /organizations/{organizationId}/events/{eventId}/stands/{standId}/assignment`:

- requires owner/organizer authorization;
- accepts only an active tenant member;
- updates the stand owner and audit event in one transaction;
- gives users an actionable way to remove assigned-stand deletion blockers.

### Account deletion

`GET /user/account` returns deletion readiness and blocker codes. `DELETE /user/account` re-checks the same conditions and refuses deletion while the account:

- owns any organization;
- is assigned to any stand.

After blockers are resolved, deletion:

1. removes saved stands;
2. anonymizes orders;
3. removes non-owner memberships;
4. removes the application profile;
5. deletes the Cognito identity.

Batch deletions retry DynamoDB unprocessed items with bounded backoff.

## Verification completed in the preparation environment

- Portable lockfile validation across 599 package artifacts.
- JavaScript syntax checks across 71 Node.js files.
- SAM/API route-to-handler checks for 56 API events and 22 Lambda sources.
- OpenAPI checks for 54 documented paths.
- Semantic table/index/IAM infrastructure checks across 71 CloudFormation resources and 17 DynamoDB indexes.
- Pilot-template regeneration and parity checks.
- Phase 3, Phase 4 and Sprint 4.5C asset checks.
- Pilot origin-resolution checks.
- Shell syntax checks for development and pilot scripts.

The Sprint-specific gate also found and corrected a deployment contract gap: the account-lifecycle Lambda used the memberships table, stands table and owner index but those values were not explicitly supplied by the SAM environment. Both development and pilot templates now provide them and the regression checker requires them.

## Verification not claimed

The preparation environment could not reach the public npm registry and did not contain AWS/SAM credentials. Therefore the following remain external gates:

- `npm ci` against the public registry;
- Jest execution and coverage;
- ESLint and Prettier;
- Vite and esbuild output;
- SAM validation/build;
- deployed Cognito MFA and recovery journeys;
- deployed ownership-transfer and account-deletion journeys.

The repository contains regression tests for these paths and `npm run verify` now includes the Sprint 4.5C regression gate. Public CI must execute the dependency-driven gates before release.

## Remaining work

Sprint 4.5D should address transactional consistency outside the newly transactional ownership operations, webhook processing leases, Stripe event ordering and reconciliation.
