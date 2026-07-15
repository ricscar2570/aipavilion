# AI Pavilion 0.8.0 quick start

## 1. Verify the source

Use Node.js `20.19+` or `22.12+` and npm 10+.

```bash
npm ci
npm run verify
npm audit --audit-level=high
```

`package-lock.json` is the reproducibility source. CI must use `npm ci`.

## 2. Run the frontend locally

```bash
cp .env.example .env.development.local
npm run config:check
npm run dev
```

Open `http://127.0.0.1:3000`. Useful routes include:

- `#/events`;
- `#/organizer`;
- `#/exhibitor`;
- `#/invitation/<invitation-id>`.

The frontend sends Cognito access tokens to protected APIs. Backend credentials and webhook secrets must never appear in frontend environment files.

## 3. Deploy the disposable development stack

Install AWS CLI v2 and AWS SAM CLI, then verify the isolated development identity:

```bash
aws sts get-caller-identity
sam --version
```

For browser testing:

```bash
python3 -m pip install -r requirements-dev.txt
python3 -m playwright install chromium
```

Deploy, seed and test:

```bash
export AWS_REGION=eu-west-1
export STACK_NAME=ai-pavilion-dev
export ALLOWED_ORIGIN=http://127.0.0.1:3000
npm run dev:deploy
```

The wrapper creates the disposable Cognito/API/Lambda/DynamoDB environment, seeds two isolated tenants, creates development identities, applies migrations and runs deployed DynamoDB and API smoke checks.

Run the browser journey separately:

```bash
npm run test:e2e:deployed
```

Destroy the development stack explicitly:

```bash
export CONFIRM_DESTROY="$STACK_NAME"
npm run dev:destroy
```

The development template accepts only `Environment=dev` and is intentionally destructive. Never use it for customer data.

## 4. Prepare persistent staging

Read [`docs/operations/STAGING-RUNBOOK.md`](docs/operations/STAGING-RUNBOOK.md) before proceeding. Staging requires:

- a dedicated account or strongly isolated role;
- an exact HTTPS `APP_URL`;
- Stripe **test-mode** keys and Price IDs;
- a verified SES sender;
- Turnstile site and secret keys;
- an alert email;
- protected GitHub `staging` environment and OIDC roles.

Generate and inspect the retained backend template:

```bash
npm run pilot:generate
npm run pilot:check
```

The deployment wrapper consumes the environment variables documented in the runbook:

```bash
npm run pilot:deploy
```

It verifies the source, deploys retained backend/frontend/operations stacks, writes a permission-restricted frontend configuration, applies migrations, builds and uploads the frontend, invalidates CloudFront and runs synthetic checks.

## 5. Operational evidence

After staging deployment, execute and retain evidence for:

```bash
npm run test:integration
npm run test:smoke:deployed
npm run test:e2e:deployed
npm run pilot:synthetic
npm run pilot:restore-drill
```

A green local build is not a substitute for deployed AWS, Stripe, SES, WAF, accessibility or restore evidence.
