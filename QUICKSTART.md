# AI Pavilion 0.8.6-auth.1 quick start

## 1. Verify the source

Use Node.js `20.19+` or `22.12+` and npm 10+.

```bash
node scripts/check-lockfile-portability.js
npm run ci:install
npm run verify
npm audit --audit-level=high
```

The dependency-free authentication contract can also be checked directly:

```bash
npm run check:auth
```

`package-lock.json` is the reproducibility source. All resolved artifacts must use `https://registry.npmjs.org`; CI checks this before `npm run ci:install`.

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

The frontend sends Cognito access tokens to protected APIs. API Gateway requires the route-specific `aipavilion/user`, `aipavilion/tenant` or `aipavilion/platform-admin` scope, while Lambda handlers still enforce membership, role, ownership and entitlement. Backend credentials and webhook secrets must never appear in frontend environment files.

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
- either a custom HTTPS domain or permission to use the generated CloudFront domain;
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

It verifies the source and infrastructure contracts, deploys retained backend/frontend/operations stacks, discovers the generated CloudFront URL when necessary, reapplies backend CORS/Cognito settings, writes a permission-restricted frontend configuration, applies migrations, builds and uploads the frontend, invalidates CloudFront and runs synthetic checks.

## 5. Operational evidence

Persistent staging defaults to `PRODUCT_PAYMENT_MODE=disabled`. SaaS subscription billing remains Stripe-backed, but visitors contact exhibitors rather than purchasing products through a multi-vendor checkout.

After staging deployment, run the isolated synthetic evidence suite against the deployed CloudFront origin:

```bash
export APP_URL=https://your-staging-origin.example
export ALLOW_SYNTHETIC_FIXTURES=true
npm run pilot:evidence
```

This runs DynamoDB integration, API smoke, remote Playwright and synthetic checks, then writes a checksum manifest under `.artifacts/evidence/`. Run the destructive backup restore exercise separately:

```bash
npm run pilot:restore-drill
```

A green local build is not a substitute for deployed AWS, Stripe, SES, WAF, accessibility or restore evidence.

## Deployed authentication proof

After the canonical fixtures and test identities exist in an AWS stack:

```bash
npm run test:auth:deployed
```

This proves the V2.0 pre-token trigger, custom access-token scopes, ID-token rejection, admin-scope enforcement and the continuing server-side membership boundary. The Cognito User Pool must use the `ESSENTIALS` tier configured by the templates.
