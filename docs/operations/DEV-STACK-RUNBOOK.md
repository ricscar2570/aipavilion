# Disposable development stack runbook

## Purpose

The `ai-pavilion-dev` stack proves the multi-tenant system against real AWS services. It creates its own Cognito User Pool, public web client, role groups, API Gateway stage, 22 Lambda functions, 14 DynamoDB tables, 17 GSIs, Lambda log groups and a Stripe development secret.

The template accepts only `Environment=dev` and uses deletion policies intended for teardown. Never use this stack for customer or production data.

## Prerequisites

- Node.js 20.19+ or 22.12+ and npm 10+;
- AWS SAM CLI;
- AWS CLI v2;
- AWS permissions for CloudFormation, IAM, Lambda, API Gateway, DynamoDB, Cognito, Secrets Manager, SES, SNS and CloudWatch;
- Python 3.11+ and `pip install -r requirements-dev.txt` for browser tests;
- Playwright Chromium;
- an exact browser origin, normally `http://127.0.0.1:3000`.

## Deploy

```bash
export AWS_REGION=eu-west-1
export STACK_NAME=ai-pavilion-dev
export ALLOWED_ORIGIN=http://127.0.0.1:3000

# Optional. Only Stripe test keys are accepted by the wrapper.
export STRIPE_SECRET_KEY=sk_test_not_configured
export STRIPE_WEBHOOK_SECRET=whsec_not_configured

npm run dev:deploy
```

The wrapper performs the local gate, SAM validation/build, deployment, output capture, canonical two-tenant seed, six development identities, DynamoDB integration tests and deployed API smoke tests.

Generated local files are ignored and permission restricted:

- `.artifacts/dev-stack-outputs.json`;
- `.artifacts/dev-test-users.json`;
- `.env.development.local`.

Do not paste them into issues, commits or public logs.

## Verify the deployed system

```bash
npm run test:smoke:deployed
npm run test:e2e:deployed
```

The API smoke suite verifies:

1. public event and stand discovery;
2. visitor, administrator, two organizer and two exhibitor identities;
3. membership and organization boundaries;
4. event ownership and publication;
5. assigned stand ownership;
6. lead persistence, exhibitor access and cross-tenant denial;
7. server-authoritative simulated checkout and order ownership;
8. administrator authorization;
9. account deletion and correlation IDs.

The browser suite adds the organizer invitation, exhibitor acceptance, stand edit/submit, organizer moderation and final public publication journey.

## Diagnose failures

CloudFormation events:

```bash
aws cloudformation describe-stack-events \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --max-items 40
```

Recent Lambda errors:

```bash
aws logs tail "/aws/lambda/${STACK_NAME}-events" --since 15m --region "$AWS_REGION"
aws logs tail "/aws/lambda/${STACK_NAME}-invitations" --since 15m --region "$AWS_REGION"
aws logs tail "/aws/lambda/${STACK_NAME}-exhibitor-stands" --since 15m --region "$AWS_REGION"
```

Do not patch deployed code or tables manually. Correct source, seed or migration logic and redeploy.

## Rollback

For an application regression with a healthy disposable stack, redeploy a known-good Git tag:

```bash
git checkout <known-good-tag>
npm ci
npm run verify
sam build --template-file template.yaml
sam deploy \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    Environment=dev \
    AllowedOrigin="$ALLOWED_ORIGIN" \
    StripeSecretKey=sk_test_not_configured \
    StripeWebhookSecret=whsec_not_configured \
    StripeBillingWebhookSecret=whsec_billing_not_configured \
    PaymentMode=simulated \
    BillingMode=simulated \
    InvitationEmailMode=simulated \
    BotChallengeMode=simulated
```

## Destroy

The exact stack name is required as a guard:

```bash
export CONFIRM_DESTROY="$STACK_NAME"
npm run dev:destroy
```

Verify that CloudFormation reports the stack as absent. Destroying the stack deletes all seeded tenant data and generated identities.

## Incident handling

If a development credential or invitation link is exposed:

1. stop browser and smoke tests;
2. destroy the disposable stack;
3. revoke the relevant AWS/OIDC session;
4. rotate configured Stripe test secrets;
5. remove leaked artifacts from logs and storage;
6. redeploy to regenerate identities and invitations;
7. record the incident and the affected request IDs.

Development identities, invitation links and simulated payments must never be reused in staging or production.
