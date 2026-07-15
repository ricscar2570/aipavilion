#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${STACK_NAME:-ai-pavilion-dev}"
AWS_REGION="${AWS_REGION:-eu-west-1}"

for command_name in sam aws; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Missing required command: $command_name" >&2
        exit 1
    fi
done

if [[ "${CONFIRM_DESTROY:-}" != "$STACK_NAME" ]]; then
    echo "Refusing to destroy the stack without explicit confirmation." >&2
    echo "Run: CONFIRM_DESTROY=$STACK_NAME STACK_NAME=$STACK_NAME npm run dev:destroy" >&2
    exit 1
fi

sam delete \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --no-prompts

if aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" >/dev/null 2>&1; then
    echo "Stack still exists after sam delete." >&2
    exit 1
fi

rm -f \
    .artifacts/dev-stack-outputs.json \
    .artifacts/dev-test-users.json \
    .env.development.local

echo "Destroyed $STACK_NAME and removed local development credentials."
