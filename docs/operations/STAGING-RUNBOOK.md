# Staging runbook

## Purpose

This runbook operates the persistent AI Pavilion staging environment. Staging is retained, protected and migration-aware. It is not the disposable development stack and must never contain production customer data until the external assurance gates are complete.

Version 0.8.6-auth.1 retains the first-deployment URL fix, deployed evidence suite and scheduled reconciliation. It also applies the fail-closed public-catalogue migration, opt-in contact projection, a CSP without inline allowances and the AUTH-01 scoped Cognito access-token contract. The wrapper can create CloudFront without a pre-existing `APP_URL`, discover the final site origin, reapply backend CORS/Cognito configuration and then test the actual deployed application.

## Stacks

| Stack      | Default name                     | Responsibility                                                         |
| ---------- | -------------------------------- | ---------------------------------------------------------------------- |
| Backend    | `ai-pavilion-staging-backend`    | API Gateway, Cognito, Lambda, DynamoDB, SES event plumbing and secrets |
| Frontend   | `ai-pavilion-staging-frontend`   | Private S3 origin, CloudFront, TLS and browser security headers        |
| Operations | `ai-pavilion-staging-operations` | WAF, alarms, dashboard, backup plan and cost budget                    |

Use separate AWS accounts for staging and production whenever possible. Never deploy the disposable `template.yaml` with customer data.

## Required operator tools

- Node.js 20.19+ or 22.12+ and npm 10+;
- public npm access to `https://registry.npmjs.org`;
- AWS CLI v2;
- AWS SAM CLI;
- an AWS role allowed to deploy CloudFormation, IAM, Cognito, API Gateway, Lambda, DynamoDB, S3, CloudFront, SES, SNS, WAF, Backup, Budgets and Secrets Manager;
- a verified SES sender identity;
- Stripe test-mode products, prices and webhook endpoints for staging;
- a Cloudflare Turnstile site key and secret;
- an alert email address able to confirm the SNS subscription.

## Required environment variables

These values are always required:

```bash
export AWS_REGION=eu-west-1
export ENVIRONMENT=staging
export ALERT_EMAIL=operations@example.com
export INVITATION_EMAIL_FROM=events@example.com
export BOT_CHALLENGE_SECRET='...'
export TURNSTILE_SITE_KEY='0x...'
export STRIPE_SECRET_KEY='sk_test_...'
# Required only when PRODUCT_PAYMENT_MODE=stripe
export STRIPE_WEBHOOK_SECRET='whsec_...'
export STRIPE_BILLING_WEBHOOK_SECRET='whsec_...'
export STRIPE_PILOT_PRICE_ID='price_...'
export STRIPE_STARTER_PRICE_ID='price_...'
export STRIPE_PROFESSIONAL_PRICE_ID='price_...'
export STRIPE_PUBLISHABLE_KEY='pk_test_...'
export MONTHLY_BUDGET_USD=150
export PRODUCT_PAYMENT_MODE=disabled
```

### Default CloudFront domain

For the first staging deployment on the generated CloudFront domain, leave these unset:

```bash
unset APP_URL ALLOWED_ORIGIN DOMAIN_NAME ACM_CERTIFICATE_ARN
```

The deployment wrapper will:

1. bootstrap the backend with a temporary non-routable HTTPS origin;
2. create the frontend distribution;
3. read the `SiteUrl` CloudFormation output;
4. redeploy the backend with the final CloudFront origin;
5. generate the frontend environment from the final backend and frontend outputs.

### Custom domain

For a custom domain, provide the domain and a certificate in `us-east-1`:

```bash
export DOMAIN_NAME=staging.example.com
export ACM_CERTIFICATE_ARN='arn:aws:acm:us-east-1:...'
export APP_URL="https://${DOMAIN_NAME}"
export ALLOWED_ORIGIN="$APP_URL"
```

`APP_URL`, `ALLOWED_ORIGIN` and `DOMAIN_NAME` must resolve to the same HTTPS origin. Paths, query strings, fragments and HTTP origins are rejected. Staging rejects non-test Stripe secret keys.

`PRODUCT_PAYMENT_MODE=disabled` is the staging and pilot default. Stripe subscription billing remains active, but visitors cannot purchase exhibitor products through AI Pavilion. Enabling `stripe` requires a separate merchant-of-record or marketplace approval and a product-payment webhook secret.

For automated lead evidence, use Cloudflare Turnstile test credentials so Playwright can complete the public contact journey without bypassing bot protection.

## Preflight

From a clean clone:

```bash
node scripts/check-lockfile-portability.js
node scripts/check-infrastructure-contracts.js
npm run check:auth
npm run ci:install
npm run verify
npm run pilot:check
npm run pilot:preflight
```

The first check rejects private registry hosts, embedded registry credentials and package/lock dependency drift. `npm run check:auth` validates source/SAM/OpenAPI scope parity before deployment. The staging evidence wrapper later runs `npm run test:auth:deployed` against Cognito and API Gateway. The infrastructure check validates every Lambda handler, DynamoDB table environment reference, policy table reference, index name and table output in both development and pilot templates.

## Deployment

```bash
npm run pilot:deploy
```

The wrapper performs, in order:

1. lockfile portability validation;
2. deterministic dependency installation;
3. generation and verification of the retained backend template;
4. complete source, contract, semantic infrastructure, test, coverage and frontend build verification;
5. SAM validation and backend bootstrap deployment;
6. frontend stack deployment and final site-origin discovery;
7. automatic backend finalization when the CloudFront origin was not known beforehand;
8. capture of permission-restricted stack outputs and non-secret deployment context;
9. migration plan, application and verification;
10. frontend configuration validation and build;
11. immutable asset upload and uncached `index.html` upload;
12. CloudFront invalidation;
13. operations/WAF/backup deployment;
14. synthetic verification.

The deployment itself does not create customer-like evidence records. The protected staging workflow performs the evidence phase separately and uploads only redacted logs and a checksum manifest.

The files under `.artifacts/` and `.env.production.local` are local deployment material. They are permission-restricted and must not be committed.

## Required evidence after deployment

Provision isolated synthetic fixtures and run the deployed evidence suite:

```bash
export APP_URL=https://your-staging-origin.example
export ALLOW_SYNTHETIC_FIXTURES=true
npm run pilot:evidence
```

The wrapper runs and retains logs for DynamoDB integration, API smoke, the remote CloudFront Playwright journey and the synthetic check. It deletes the generated test-user credential file after execution and writes `.artifacts/evidence/manifest.json`. Run the destructive restore exercise separately:

```bash
npm run pilot:restore-drill
```

Confirm manually:

- Cognito signup, password recovery and role access;
- organizer creation, event publication and invitation delivery;
- exhibitor acceptance, stand review and publication;
- public discovery and lead submission with Turnstile;
- personal-data export, including saved stands through `user-saved-at-index`;
- Stripe test checkout, billing portal and delayed webhook behavior;
- WAF blocks and CloudWatch alarms;
- SES delivery, bounce and complaint telemetry;
- backup restoration and measured RPO/RTO.

## Updating an existing staging stack

Run the same `npm run pilot:deploy` command. If the site origin is unchanged, CloudFormation performs one backend application. If the frontend produces a different origin, the wrapper deliberately performs a second backend application to keep CORS and Cognito callbacks coherent.

Review the changeset before production deployment. Production requires a protected GitHub environment and explicit release approval.

## Rollback

Application rollback uses the previous repository tag and the same deployment wrapper. Do not delete retained DynamoDB tables to roll back application code.

For a failed migration:

1. stop new writes if the migration is not backward compatible;
2. inspect `SchemaMigrationsTable` and migration logs;
3. deploy the last compatible application version;
4. run the documented compensating migration or restore drill;
5. record the incident and evidence.

For CloudFront configuration failure, restore the previous frontend stack template and invalidate `/*` after uploading the last known-good `dist/` artifact.

## Destruction boundary

Persistent staging resources use retention and point-in-time recovery. Do not run `sam delete` expecting complete cleanup. Destruction requires a reviewed data-retention decision, explicit removal of retention policies and a separate change record.
