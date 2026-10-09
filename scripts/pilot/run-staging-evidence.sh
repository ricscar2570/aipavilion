#!/usr/bin/env bash
set -euo pipefail

: "${ENVIRONMENT:=staging}"
: "${AWS_REGION:=eu-west-1}"
: "${APP_URL:?APP_URL must be the deployed CloudFront or custom-domain origin}"
: "${ALLOW_SYNTHETIC_FIXTURES:=false}"
: "${PRODUCT_PAYMENT_MODE:=disabled}"

if [[ "$ENVIRONMENT" != "staging" ]]; then
    echo "Synthetic evidence is restricted to ENVIRONMENT=staging" >&2
    exit 2
fi
if [[ "$ALLOW_SYNTHETIC_FIXTURES" != "true" ]]; then
    echo "Set ALLOW_SYNTHETIC_FIXTURES=true to provision isolated staging evidence data" >&2
    exit 2
fi
if [[ ! -f .artifacts/staging-backend-outputs.json || ! -f .artifacts/staging-frontend-outputs.json ]]; then
    echo "Staging stack outputs are missing. Run pilot:deploy first." >&2
    exit 2
fi

export STACK_OUTPUTS_FILE=.artifacts/staging-backend-outputs.json
export DEV_TEST_USERS_FILE=.artifacts/staging-test-users.json
export TEST_USERS_FILE="$DEV_TEST_USERS_FILE"
export TEST_USER_ENVIRONMENT=staging
export DEV_VISITOR_EMAIL=visitor.staging@example.com
export DEV_ADMIN_EMAIL=admin.staging@example.com
export DEV_ATLAS_ORGANIZER_EMAIL=organizer.atlas.staging@example.com
export DEV_ATLAS_EXHIBITOR_EMAIL=exhibitor.atlas.staging@example.com
export DEV_RIVAL_ORGANIZER_EMAIL=organizer.rival.staging@example.com
export DEV_RIVAL_EXHIBITOR_EMAIL=exhibitor.rival.staging@example.com
export E2E_BASE_URL="${APP_URL%/}"
export E2E_PRODUCT_CHECKOUT=false
export SMOKE_PRODUCT_CHECKOUT=false
export EVIDENCE_DIR=.artifacts/evidence

mkdir -p "$EVIDENCE_DIR"
chmod 700 .artifacts "$EVIDENCE_DIR" 2>/dev/null || true

run_and_log() {
    local name="$1"
    shift
    echo "==> $name"
    "$@" 2>&1 | tee "$EVIDENCE_DIR/${name}.log"
}

cleanup_sensitive() {
    rm -f "$DEV_TEST_USERS_FILE"
}
trap cleanup_sensitive EXIT

run_and_log seed node scripts/dev/seed-dev.js
run_and_log users node scripts/dev/create-test-users.js
run_and_log dynamodb-integration npm run test:integration -- --silent
run_and_log auth-contract npm run test:auth:deployed
run_and_log api-smoke npm run test:smoke:deployed
run_and_log browser-e2e npm run test:e2e:deployed
run_and_log synthetic npm run pilot:synthetic

cp .artifacts/staging-preflight.json "$EVIDENCE_DIR/preflight.json" 2>/dev/null || true
node scripts/pilot/generate-evidence-manifest.js
printf 'Staging evidence complete: %s\n' "$APP_URL"
