#!/usr/bin/env bash
set -euo pipefail
: "${AWS_REGION:=eu-west-1}"
: "${SOURCE_TABLE:?Set SOURCE_TABLE to a staging DynamoDB table with PITR enabled}"
RESTORE_TABLE="${SOURCE_TABLE}-restore-drill-$(date +%s)"
cleanup() {
    aws dynamodb delete-table --table-name "$RESTORE_TABLE" --region "$AWS_REGION" >/dev/null 2>&1 || true
}
trap cleanup EXIT
SOURCE_COUNT=$(aws dynamodb scan --table-name "$SOURCE_TABLE" --region "$AWS_REGION" --select COUNT --query Count --output text)
aws dynamodb restore-table-to-point-in-time \
    --source-table-name "$SOURCE_TABLE" \
    --target-table-name "$RESTORE_TABLE" \
    --use-latest-restorable-time \
    --region "$AWS_REGION" >/dev/null
aws dynamodb wait table-exists --table-name "$RESTORE_TABLE" --region "$AWS_REGION"
RESTORED_COUNT=$(aws dynamodb scan --table-name "$RESTORE_TABLE" --region "$AWS_REGION" --select COUNT --query Count --output text)
if [[ "$SOURCE_COUNT" != "$RESTORED_COUNT" ]]; then
    echo "Restore drill count mismatch: source=$SOURCE_COUNT restored=$RESTORED_COUNT" >&2
    exit 1
fi
printf 'Restore drill passed for %s: %s items restored to %s\n' "$SOURCE_TABLE" "$RESTORED_COUNT" "$RESTORE_TABLE"
