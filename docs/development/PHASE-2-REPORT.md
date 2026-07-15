# Phase 2 report: deployed integration baseline

Version 0.5.0 converts the consolidated prototype into a disposable AWS integration system.

## Delivered

- Self-contained Cognito User Pool and public client.
- Cognito groups for administrators, organizers and exhibitors.
- Stack-managed Stripe test key and webhook secret, with explicit payment modes.
- Stack-scoped disposable DynamoDB resources, seven-day Lambda log retention and complete CloudFormation outputs.
- Canonical fixtures and deterministic seed verification.
- Provisioning of visitor and administrator test identities.
- Integration tests for all six DynamoDB tables and all three GSIs.
- Development-only simulated payment flow for deterministic vertical tests.
- Real Stripe-mode unit tests with reusable webhook fixtures and replay coverage.
- Structured request lifecycle logs and correlation identifiers without request-body logging.
- Deployed API smoke test covering login, persistence, checkout, admin access and account deletion.
- Playwright browser flow covering the user-facing vertical journey.
- OIDC-based GitHub development deployment workflow with optional automatic destruction.
- Deployment, rollback, incident and destruction runbook.

## Security boundary

`PaymentMode=simulated` is allowed only for disposable development verification. Production must use `PaymentMode=stripe`, real Stripe test/live configuration appropriate to the environment, an independent security review and a non-disposable infrastructure template.

## Verification boundary

The repository can verify source, bundles, unit tests and frontend build locally. SAM validation, AWS deployment, real DynamoDB integration, Cognito login and browser traversal require an AWS account and are performed by the development deployment workflow or an equipped workstation.

## Remaining before a customer pilot

- tenant and organization ownership;
- organizer/exhibitor workflows;
- query-based stand catalogue access patterns;
- abuse prevention on lead and interaction endpoints;
- production hosting and delivery for the frontend;
- privacy retention and data export policy;
- WCAG 2.2 AA audit;
- alarms, backup restoration and incident exercises;
- independent penetration testing.

## Local verification result

The repository-level quality gate validates source formatting, lint, syntax, API/Lambda contracts, isolated Lambda bundles, Phase 2 assets, Jest coverage and the Vite build. The final local run passed 154 tests; seven deployed DynamoDB tests were correctly skipped until a live stack is supplied. Deployed integration and browser suites are opt-in because they require a live stack.

The preparation environment did not provide AWS SAM CLI or AWS deployment credentials. Consequently, the stack, Cognito login, real DynamoDB tests and Playwright traversal were implemented but not falsely reported as executed there. They run in the OIDC development workflow or from a workstation following the runbook.

## Known technical debt

- The clean install still emits deprecation notices from ESLint 8/Jest-era transitive tooling; upgrading the lint/test toolchain is scheduled for the next maintenance pass.
- Frontend cart and template modules remain less thoroughly unit-tested than the backend and should receive component/browser coverage during Phase 3.
- Dependency auditing remains enforced in GitHub CI; the preparation environment's npm audit endpoint was not reliably reachable during the final packaging run.
