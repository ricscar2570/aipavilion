#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=eu-west-1}"
: "${BACKEND_STACK:=ai-pavilion-staging-backend}"
: "${FRONTEND_STACK:=ai-pavilion-staging-frontend}"
: "${OPERATIONS_STACK:=ai-pavilion-staging-operations}"
: "${ENVIRONMENT:=staging}"
: "${ALLOWED_ORIGIN:=}"
: "${APP_URL:=}"
: "${ALERT_EMAIL:?Set ALERT_EMAIL for operational alarms and budgets}"
: "${INVITATION_EMAIL_FROM:?Set INVITATION_EMAIL_FROM to a verified SES identity}"
: "${BOT_CHALLENGE_SECRET:?Set BOT_CHALLENGE_SECRET}"
: "${TURNSTILE_SITE_KEY:?Set TURNSTILE_SITE_KEY}"
: "${STRIPE_SECRET_KEY:?Set a Stripe test key for staging}"
: "${STRIPE_WEBHOOK_SECRET:=whsec_product_checkout_disabled}"
: "${STRIPE_BILLING_WEBHOOK_SECRET:?Set the subscription webhook secret}"
: "${STRIPE_PILOT_PRICE_ID:?Set STRIPE_PILOT_PRICE_ID}"
: "${STRIPE_STARTER_PRICE_ID:?Set STRIPE_STARTER_PRICE_ID}"
: "${STRIPE_PROFESSIONAL_PRICE_ID:?Set STRIPE_PROFESSIONAL_PRICE_ID}"
: "${STRIPE_PUBLISHABLE_KEY:?Set STRIPE_PUBLISHABLE_KEY}"
: "${MONTHLY_BUDGET_USD:=150}"
: "${PRODUCT_PAYMENT_MODE:=disabled}"
: "${DOMAIN_NAME:=}"
: "${ACM_CERTIFICATE_ARN:=}"

if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo "ENVIRONMENT must be staging or production" >&2
    exit 2
fi
if [[ "$STRIPE_SECRET_KEY" != sk_test_* && "$ENVIRONMENT" == "staging" ]]; then
    echo "Staging accepts only Stripe test keys" >&2
    exit 2
fi
if [[ "$PRODUCT_PAYMENT_MODE" != "disabled" && "$PRODUCT_PAYMENT_MODE" != "stripe" ]]; then
    echo "PRODUCT_PAYMENT_MODE must be disabled or stripe" >&2
    exit 2
fi
if [[ "$PRODUCT_PAYMENT_MODE" == "stripe" && "$STRIPE_WEBHOOK_SECRET" != whsec_* ]]; then
    echo "STRIPE_WEBHOOK_SECRET must be configured when product checkout is enabled" >&2
    exit 2
fi
for command in node npm sam aws; do
    command -v "$command" >/dev/null || {
        echo "Missing command: $command" >&2
        exit 2
    }
done

ORIGIN_CONTEXT=$(node scripts/pilot/resolve-deployment-origin.js)
CONFIGURED_ORIGIN=$(node -e 'const value=JSON.parse(process.argv[1]); console.log(value.configuredOrigin)' "$ORIGIN_CONTEXT")
BOOTSTRAP_ORIGIN=$(node -e 'const value=JSON.parse(process.argv[1]); console.log(value.bootstrapOrigin)' "$ORIGIN_CONTEXT")
export AWS_REGION BACKEND_STACK FRONTEND_STACK OPERATIONS_STACK ENVIRONMENT BOOTSTRAP_ORIGIN PRODUCT_PAYMENT_MODE
mkdir -p .artifacts

node scripts/check-lockfile-portability.js
node scripts/pilot/preflight-staging.js
npm run ci:install
npm run pilot:generate
npm run verify
sam validate --lint --template-file infrastructure/backend-pilot.yaml
sam build --template-file infrastructure/backend-pilot.yaml

backend_deploy() {
    local site_origin="$1"
    sam deploy \
        --stack-name "$BACKEND_STACK" \
        --region "$AWS_REGION" \
        --resolve-s3 \
        --capabilities CAPABILITY_IAM \
        --no-confirm-changeset \
        --no-fail-on-empty-changeset \
        --parameter-overrides \
            Environment="$ENVIRONMENT" \
            AllowedOrigin="$site_origin" \
            AppUrl="$site_origin" \
            StripeSecretKey="$STRIPE_SECRET_KEY" \
            StripeWebhookSecret="$STRIPE_WEBHOOK_SECRET" \
            StripeBillingWebhookSecret="$STRIPE_BILLING_WEBHOOK_SECRET" \
            StripePilotPriceId="$STRIPE_PILOT_PRICE_ID" \
            StripeStarterPriceId="$STRIPE_STARTER_PRICE_ID" \
            StripeProfessionalPriceId="$STRIPE_PROFESSIONAL_PRICE_ID" \
            PaymentMode="$PRODUCT_PAYMENT_MODE" \
            BillingMode=stripe \
            InvitationEmailMode=ses \
            InvitationEmailFrom="$INVITATION_EMAIL_FROM" \
            BotChallengeMode=turnstile \
            BotChallengeSecret="$BOT_CHALLENGE_SECRET" \
            AuditRetentionDays=730
}

capture_backend_outputs() {
    aws cloudformation describe-stacks \
        --stack-name "$BACKEND_STACK" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs' \
        --output json > .artifacts/staging-backend-outputs.json
    chmod 600 .artifacts/staging-backend-outputs.json
}

backend_deploy "$BOOTSTRAP_ORIGIN"
capture_backend_outputs

API_ORIGIN=$(node -e 'const x=require("./.artifacts/staging-backend-outputs.json"); const item=x.find(v=>v.OutputKey==="ApiEndpoint"); if(!item) throw new Error("ApiEndpoint output missing"); console.log(new URL(item.OutputValue).origin)')

aws cloudformation deploy \
    --stack-name "$FRONTEND_STACK" \
    --region "$AWS_REGION" \
    --template-file infrastructure/frontend-pilot.yaml \
    --no-fail-on-empty-changeset \
    --parameter-overrides \
        Environment="$ENVIRONMENT" \
        DomainName="$DOMAIN_NAME" \
        AcmCertificateArn="$ACM_CERTIFICATE_ARN" \
        ApiOrigin="$API_ORIGIN"
aws cloudformation describe-stacks \
    --stack-name "$FRONTEND_STACK" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs' \
    --output json > .artifacts/staging-frontend-outputs.json
chmod 600 .artifacts/staging-frontend-outputs.json

FINAL_APP_URL=$(node -e 'const x=require("./.artifacts/staging-frontend-outputs.json"); const item=x.find(v=>v.OutputKey==="SiteUrl"); if(!item) throw new Error("SiteUrl output missing"); console.log(new URL(item.OutputValue).origin)')
if [[ -n "$CONFIGURED_ORIGIN" && "$FINAL_APP_URL" != "$CONFIGURED_ORIGIN" ]]; then
    echo "Frontend stack produced ${FINAL_APP_URL}, expected ${CONFIGURED_ORIGIN}" >&2
    exit 2
fi

if [[ "$FINAL_APP_URL" != "$BOOTSTRAP_ORIGIN" ]]; then
    echo "Finalizing backend CORS and Cognito callbacks for ${FINAL_APP_URL}"
    backend_deploy "$FINAL_APP_URL"
    capture_backend_outputs
fi

export APP_URL="$FINAL_APP_URL"
export ALLOWED_ORIGIN="$FINAL_APP_URL"
export STACK_OUTPUTS_FILE=.artifacts/staging-backend-outputs.json

node - <<'NODE'
const fs = require("fs");
const context = {
    environment: process.env.ENVIRONMENT,
    region: process.env.AWS_REGION,
    backendStack: process.env.BACKEND_STACK,
    frontendStack: process.env.FRONTEND_STACK,
    operationsStack: process.env.OPERATIONS_STACK,
    bootstrapOrigin: process.env.BOOTSTRAP_ORIGIN,
    finalAppUrl: process.env.APP_URL,
    productPaymentMode: process.env.PRODUCT_PAYMENT_MODE || "disabled",
    generatedAt: new Date().toISOString(),
};
fs.writeFileSync(
    ".artifacts/staging-deployment-context.json",
    `${JSON.stringify(context, null, 2)}\n`,
    { mode: 0o600 },
);
NODE

npm run pilot:migrate:plan
npm run pilot:migrate
npm run pilot:migrate:verify
node scripts/pilot/write-staging-env.js
node scripts/validate-config.js --env .env.production.local
npm run build

SITE_BUCKET=$(node -e 'const x=require("./.artifacts/staging-frontend-outputs.json"); console.log(x.find(v=>v.OutputKey==="SiteBucketName").OutputValue)')
DISTRIBUTION_ID=$(node -e 'const x=require("./.artifacts/staging-frontend-outputs.json"); console.log(x.find(v=>v.OutputKey==="DistributionId").OutputValue)')
aws s3 sync dist/ "s3://${SITE_BUCKET}/" --delete --cache-control 'public,max-age=31536000,immutable' --exclude index.html
aws s3 cp dist/index.html "s3://${SITE_BUCKET}/index.html" --cache-control 'no-cache,no-store,must-revalidate' --content-type text/html
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths '/*' >/dev/null

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
API_ID=$(node -e 'const x=require("./.artifacts/staging-backend-outputs.json"); console.log(x.find(v=>v.OutputKey==="ApiGatewayId").OutputValue)')
API_NAME=$(node -e 'const x=require("./.artifacts/staging-backend-outputs.json"); console.log(x.find(v=>v.OutputKey==="ApiGatewayName").OutputValue)')
TABLE_NAMES=$(node - <<'NODE'
const x=require('./.artifacts/staging-backend-outputs.json');
console.log(x.filter(v=>v.OutputKey.endsWith('TableName') && v.OutputKey !== 'SchemaMigrationsTableName').map(v=>v.OutputValue).join(','));
NODE
)
IFS=',' read -ra TABLE_ARRAY <<< "$TABLE_NAMES"
BACKUP_ARNS=()
for table in "${TABLE_ARRAY[@]}"; do
    BACKUP_ARNS+=("arn:aws:dynamodb:${AWS_REGION}:${ACCOUNT_ID}:table/${table}")
done
BACKUP_RESOURCE_ARNS=$(IFS=,; echo "${BACKUP_ARNS[*]}")
aws cloudformation deploy \
    --stack-name "$OPERATIONS_STACK" \
    --region "$AWS_REGION" \
    --template-file infrastructure/operations-pilot.yaml \
    --capabilities CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset \
    --parameter-overrides \
        Environment="$ENVIRONMENT" \
        ApiGatewayId="$API_ID" \
        ApiName="$API_NAME" \
        ApiStage="$ENVIRONMENT" \
        AlertEmail="$ALERT_EMAIL" \
        MonthlyBudgetUsd="$MONTHLY_BUDGET_USD" \
        BackupResourceArns="$BACKUP_RESOURCE_ARNS"

node scripts/pilot/synthetic-check.js
printf 'Staging deployment complete: %s\n' "$FINAL_APP_URL"
