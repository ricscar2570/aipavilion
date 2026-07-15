#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${STACK_NAME:-ai-pavilion-dev}"
AWS_REGION="${AWS_REGION:-eu-west-1}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-http://127.0.0.1:3000}"
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_test_not_configured}"
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-whsec_not_configured}"

if [[ ! "$STACK_NAME" =~ ^[A-Za-z][A-Za-z0-9-]{0,39}$ ]]; then
    echo "STACK_NAME must start with a letter, contain only letters, numbers or hyphens, and be at most 40 characters." >&2
    exit 1
fi

for command_name in node npm sam aws; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Missing required command: $command_name" >&2
        exit 1
    fi
done

if [[ "$STRIPE_SECRET_KEY" != sk_test_* ]]; then
    echo "STRIPE_SECRET_KEY must be a Stripe test-mode key beginning with sk_test_." >&2
    exit 1
fi

mkdir -p .artifacts

npm ci
npm run verify
sam validate --lint --template-file template.yaml
sam build --template-file template.yaml
sam deploy \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --resolve-s3 \
    --capabilities CAPABILITY_IAM \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset \
    --parameter-overrides \
        "Environment=dev" \
        "AllowedOrigin=$ALLOWED_ORIGIN" \
        "StripeSecretKey=$STRIPE_SECRET_KEY" \
        "StripeWebhookSecret=$STRIPE_WEBHOOK_SECRET" \
        "PaymentMode=simulated"

aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs' \
    --output json > .artifacts/dev-stack-outputs.json

AWS_REGION="$AWS_REGION" ALLOWED_ORIGIN="$ALLOWED_ORIGIN" node scripts/dev/write-dev-env.js
node scripts/validate-config.js --env .env.development.local
AWS_REGION="$AWS_REGION" node scripts/dev/seed-dev.js
AWS_REGION="$AWS_REGION" node scripts/dev/create-test-users.js

RUN_DEPLOYED_INTEGRATION=1 AWS_REGION="$AWS_REGION" \
    npm run test:integration
AWS_REGION="$AWS_REGION" npm run test:smoke:deployed

cat <<MESSAGE

Disposable development stack is ready.
Stack: $STACK_NAME
Region: $AWS_REGION
Outputs: .artifacts/dev-stack-outputs.json
Test users: .artifacts/dev-test-users.json
Frontend config: .env.development.local

Run the browser end-to-end suite after installing requirements-dev.txt:
  npm run test:e2e:deployed

Destroy the environment with:
  STACK_NAME=$STACK_NAME AWS_REGION=$AWS_REGION npm run dev:destroy
MESSAGE
