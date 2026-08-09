#!/usr/bin/env bash
set -euo pipefail

for command_name in python3 curl; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Missing required command: $command_name" >&2
        exit 1
    fi
done

python3 - <<'PY'
import importlib.util
missing = [name for name in ("playwright", "boto3") if importlib.util.find_spec(name) is None]
if missing:
    raise SystemExit("Missing Python packages: " + ", ".join(missing) + ". Run pip install -r requirements-dev.txt")
PY

mkdir -p .artifacts
BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:3000}"
BASE_URL="${BASE_URL%/}"
export E2E_BASE_URL="$BASE_URL"

case "$BASE_URL" in
    http://127.0.0.1:*|http://localhost:*|https://127.0.0.1:*|https://localhost:*)
        for command_name in node npm; do
            if ! command -v "$command_name" >/dev/null 2>&1; then
                echo "Missing required command for local browser test: $command_name" >&2
                exit 1
            fi
        done
        npm run dev -- --host 127.0.0.1 --port 3000 > .artifacts/vite-e2e.log 2>&1 &
        VITE_PID=$!
        trap 'kill "$VITE_PID" >/dev/null 2>&1 || true' EXIT
        ;;
    https://*)
        VITE_PID=""
        ;;
    *)
        echo "E2E_BASE_URL must be localhost HTTP(S) or a remote HTTPS origin" >&2
        exit 2
        ;;
esac

for _ in $(seq 1 60); do
    if curl --fail --silent --location "$BASE_URL/" >/dev/null; then
        break
    fi
    sleep 1
done

if ! curl --fail --silent --location "$BASE_URL/" >/dev/null; then
    if [[ -f .artifacts/vite-e2e.log ]]; then
        cat .artifacts/vite-e2e.log >&2
    fi
    echo "Browser target did not become ready: $BASE_URL" >&2
    exit 1
fi

python3 tests/e2e/test_deployed.py
