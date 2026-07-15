# Staging runbook

## Purpose

This runbook operates the persistent AI Pavilion staging environment introduced in version 0.8.0. Staging is retained, protected and migration-aware. It is not the disposable development stack.

## Stacks

| Stack      | Default name                     | Responsibility                                                         |
| ---------- | -------------------------------- | ---------------------------------------------------------------------- |
| Backend    | `ai-pavilion-staging-backend`    | API Gateway, Cognito, Lambda, DynamoDB, SES event plumbing and secrets |
| Frontend   | `ai-pavilion-staging-frontend`   | Private S3 origin, CloudFront, TLS and browser security headers        |
| Operations | `ai-pavilion-staging-operations` | WAF, alarms, dashboard, backup plan and cost budget                    |

Use separate AWS accounts for staging and production whenever possible. Never deploy the disposable `template.yaml` with customer data.

## Required operator tools

- Node.js 20.19+ or 22.12+ and npm 10+;
- AWS CLI v2;
- AWS SAM CLI;
- an AWS role allowed to deploy CloudFormation, IAM, Cognito, API Gateway, Lambda, DynamoDB, S3, CloudFront, SES, SNS, WAF, Backup, Budgets and Secrets Manager;
- a verified SES sender identity;
- Stripe test-mode products, prices and webhook endpoints for staging;
- a Cloudflare Turnstile site key and secret;
- an alert email address able to confirm the SNS subscription.

## Required environment variables

```bash
export AWS_REGION=eu-west-1
export ENVIRONMENT=staging
export ALLOWED_ORIGIN=https://staging.example.com
export APP_URL="$ALLOWED_ORIGIN"
export ALERT_EMAIL=operations@example.com
export INVITATION_EMAIL_FROM=events@example.com
export BOT_CHALLENGE_SECRET='...'
export TURNSTILE_SITE_KEY='0x...'
export STRIPE_SECRET_KEY='sk_test_...'
export STRIPE_WEBHOOK_SECRET='whsec_...'
export STRIPE_BILLING_WEBHOOK_SECRET='whsec_...'
export STRIPE_PILOT_PRICE_ID='price_...'
export STRIPE_STARTER_PRICE_ID='price_...'
export STRIPE_PROFESSIONAL_PRICE_ID='price_...'
export STRIPE_PUBLISHABLE_KEY='pk_test_...'
export DOMAIN_NAME=staging.example.com
export ACM_CERTIFICATE_ARN='arn:aws:acm:us-east-1:...'
export MONTHLY_BUDGET_USD=150
```

The CloudFront certificate must be in `us-east-1`. Staging rejects non-test Stripe secret keys.

## Deployment

```bash
npm run pilot:deploy
```

The wrapper performs, in order:

1. deterministic dependency installation;
2. generation of the retained backend template;
3. complete source, contract, test, coverage and build verification;
4. SAM validation and backend deployment;
5. capture of permission-restricted stack outputs;
6. migration plan, application and verification;
7. private frontend/CDN deployment;
8. frontend configuration validation and build;
9. immutable asset upload and uncached `index.html` upload;
10. CloudFront invalidation;
11. WAF, alarms, backup and budget deployment;
12. public synthetic verification.

A deployment is unsuccessful if any step fails. Do not bypass a failed migration or synthetic check.

## Stripe configuration

Configure two different webhook endpoints in Stripe test mode:

- product checkout: `POST /checkout/webhook`;
- SaaS subscription billing: `POST /billing/webhook`.

Subscribe the billing endpoint to:

- `checkout.session.completed`;
- `customer.subscription.created`;
- `customer.subscription.updated`;
- `customer.subscription.deleted`.

Store each signing secret in the corresponding deployment variable. Never place either secret in frontend configuration.

## SES configuration

The backend creates an SES configuration set and an SNS event destination. Confirm that:

- the sender identity is verified;
- the account is out of the SES sandbox before inviting arbitrary pilot users;
- delivery, bounce, complaint and reject events reach the SNS topic;
- invitation records change `deliveryStatus` after SES events;
- repeated bounces or complaints are handled by support before resending.

## Verification after deployment

```bash
npm run pilot:synthetic
```

Also verify manually:

- homepage and public events load;
- CSP, HSTS, frame and MIME-sniffing headers are present;
- organizer login works with an access token;
- organization profile and billing status load;
- an invitation is delivered and accepted by the addressed account;
- the exhibitor can submit a stand and the organizer can publish it;
- a public lead requires a valid Turnstile token;
- Stripe test checkout updates the entitlement;
- audit events are visible only inside the correct organization.

## Monitoring

The operations stack creates:

- API 5xx alarm;
- API p95 latency alarm;
- unusual WAF block-volume alarm;
- CloudWatch dashboard;
- SNS alert topic;
- monthly actual and forecast budget alerts.

The alert email subscription must be confirmed. Treat missing telemetry as an incident, not as proof of health.

## Backup and restore

DynamoDB point-in-time recovery is enabled in the retained pilot template. AWS Backup creates a daily recovery point retained for 35 days.

Exercise a table restoration with:

```bash
export SOURCE_TABLE=<staging-table-name>
npm run pilot:restore-drill
```

The drill restores to a temporary table, compares item counts and deletes the temporary table. Item-count equality is a minimum check; perform sampled semantic verification before declaring a production recovery exercise successful.

## Rollback

Application rollback:

1. identify the last known-good release tag;
2. verify that its migration compatibility permits rollback;
3. deploy that source through the same pipeline;
4. run the synthetic check;
5. inspect 5xx, latency and WAF metrics.

Data rollback:

- do not reverse a migration by editing records manually;
- use a versioned compensating migration where possible;
- use point-in-time restore into a new table for destructive corruption;
- validate restored data before changing application references.

## Incident escalation

Follow [`INCIDENT-RESPONSE.md`](INCIDENT-RESPONSE.md). Preserve request IDs, CloudFormation events, CloudWatch logs and Stripe/SES event identifiers. Do not copy access tokens or personal data into tickets.
