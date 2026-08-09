# Sprint 4.5B report — staging evidence automation

## Objective

Make the persistent staging path capable of producing repeatable, reviewable evidence instead of ending after infrastructure deployment.

## Delivered

- External staging preflight for required tools, environment variables, AWS identity, SES sender verification and public npm reachability.
- Default pilot scope with visitor product checkout disabled while SaaS subscription billing remains enabled.
- Two-pass backend/frontend deployment retained for first CloudFront creation.
- Remote-browser Playwright mode that targets the deployed CloudFront origin instead of silently launching a local development frontend.
- Reusable staging synthetic fixtures and isolated test accounts.
- Deployed DynamoDB, API smoke, browser journey and synthetic checks executed through one evidence command.
- Product-checkout assertions made environment-aware: simulated checkout remains covered by the disposable development stack, while persistent staging verifies that visitor checkout is disabled.
- Evidence logs, hashes and a manifest containing release, commit, workflow and output-key metadata.
- GitHub staging workflow now installs Python/Playwright dependencies, deploys, exports the final origin, runs the evidence suite and uploads only the redacted evidence directory.
- Frontend cart and product-purchase controls are hidden when visitor payments are disabled.

## Commands

```bash
npm run pilot:preflight
npm run pilot:deploy
ALLOW_SYNTHETIC_FIXTURES=true npm run pilot:evidence
```

## Evidence boundary

The evidence suite is restricted to `ENVIRONMENT=staging`. It writes generated test credentials only to a permission-restricted local file and deletes that file after execution. Uploaded workflow artifacts contain logs and a checksum manifest, not test-user passwords or raw stack-output files.

## Verification performed in the preparation environment

The source, shell and Python syntax were checked. Static contract checks were updated to require the evidence assets and pilot checkout boundary.

The preparation environment did not provide public npm access, AWS CLI, SAM CLI or AWS credentials. Therefore this report does not claim that public CI, CloudFormation, AWS integration tests or the browser suite have executed successfully against a deployed account. The new workflow is the mechanism that must produce that external evidence.

## Next gate

Sprint 4.5C was completed in version 0.8.3 with Cognito challenge handling, password recovery, ownership transfer, stand reassignment and account-deletion safeguards. Tracked organization closure remains a separate operational workflow.
