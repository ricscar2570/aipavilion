#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=eu-west-1}"
: "${BACKEND_STACK:=ai-pavilion-staging-backend}"
: "${FRONTEND_STACK:=ai-pavilion-staging-frontend}"
: "${ENVIRONMENT:=staging}"

if [[ "$ENVIRONMENT" != "staging" ]]; then
    echo "Internal-pilot fixtures are restricted to ENVIRONMENT=staging" >&2
    exit 2
fi
for command_name in aws node; do
    command -v "$command_name" >/dev/null 2>&1 || {
        echo "Missing required command: $command_name" >&2
        exit 2
    }
done

mkdir -p .artifacts
chmod 700 .artifacts 2>/dev/null || true

if [[ ! -s .artifacts/staging-backend-outputs.json ]]; then
    aws cloudformation describe-stacks \
        --stack-name "$BACKEND_STACK" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs' \
        --output json > .artifacts/staging-backend-outputs.json
fi
if [[ ! -s .artifacts/staging-frontend-outputs.json ]]; then
    aws cloudformation describe-stacks \
        --stack-name "$FRONTEND_STACK" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs' \
        --output json > .artifacts/staging-frontend-outputs.json
fi
chmod 600 .artifacts/staging-backend-outputs.json .artifacts/staging-frontend-outputs.json

export STACK_OUTPUTS_FILE=.artifacts/staging-backend-outputs.json
export TEST_USERS_FILE=.artifacts/staging-test-users.json
export DEV_TEST_USERS_FILE="$TEST_USERS_FILE"
export TEST_USER_ENVIRONMENT=staging
export ALLOW_SYNTHETIC_FIXTURES=true
export RUN_DEPLOYED_INTEGRATION=1
export E2E_PRODUCT_CHECKOUT=false
export SMOKE_PRODUCT_CHECKOUT=false
export DEV_VISITOR_EMAIL=visitor.staging@example.com
export DEV_ADMIN_EMAIL=admin.staging@example.com
export DEV_ATLAS_ORGANIZER_EMAIL=organizer.atlas.staging@example.com
export DEV_ATLAS_EXHIBITOR_EMAIL=exhibitor.atlas.staging@example.com
export DEV_RIVAL_ORGANIZER_EMAIL=organizer.rival.staging@example.com
export DEV_RIVAL_EXHIBITOR_EMAIL=exhibitor.rival.staging@example.com

API_URL=$(node -e 'const x=require("./.artifacts/staging-backend-outputs.json"); const i=x.find(v=>v.OutputKey==="ApiEndpoint"); if(!i) throw new Error("ApiEndpoint output missing"); console.log(i.OutputValue.replace(/\/$/,""))')
APP_URL=$(node -e 'const x=require("./.artifacts/staging-frontend-outputs.json"); const i=x.find(v=>v.OutputKey==="SiteUrl"); if(!i) throw new Error("SiteUrl output missing"); console.log(new URL(i.OutputValue).origin)')
export API_URL APP_URL
export E2E_BASE_URL="$APP_URL"

node scripts/dev/seed-dev.js
node scripts/dev/create-test-users.js
node scripts/internal-pilot/export-test-context.js

if [[ -n "${GITHUB_ENV:-}" ]]; then
    {
        echo "STACK_OUTPUTS_FILE=$STACK_OUTPUTS_FILE"
        echo "TEST_USERS_FILE=$TEST_USERS_FILE"
        echo "DEV_TEST_USERS_FILE=$DEV_TEST_USERS_FILE"
        echo "TEST_USER_ENVIRONMENT=$TEST_USER_ENVIRONMENT"
        echo "ALLOW_SYNTHETIC_FIXTURES=$ALLOW_SYNTHETIC_FIXTURES"
        echo "RUN_DEPLOYED_INTEGRATION=$RUN_DEPLOYED_INTEGRATION"
        echo "E2E_PRODUCT_CHECKOUT=$E2E_PRODUCT_CHECKOUT"
        echo "SMOKE_PRODUCT_CHECKOUT=$SMOKE_PRODUCT_CHECKOUT"
        echo "API_URL=$API_URL"
        echo "APP_URL=$APP_URL"
        echo "E2E_BASE_URL=$E2E_BASE_URL"
        echo "ORGANIZATION_ID=org_atlas"
        echo "EVENT_ID=evt_atlas_2026"
        echo "STRIPE_PROOF_ORGANIZATION_ID=org_atlas"
    } >> "$GITHUB_ENV"
fi
