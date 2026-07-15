#!/usr/bin/env bash
set -euo pipefail

for command_name in node npm python3 curl; do
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
npm run dev -- --host 127.0.0.1 --port 3000 > .artifacts/vite-e2e.log 2>&1 &
VITE_PID=$!
trap 'kill "$VITE_PID" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 40); do
    if curl --fail --silent http://127.0.0.1:3000/ >/dev/null; then
        break
    fi
    sleep 0.5
done

if ! curl --fail --silent http://127.0.0.1:3000/ >/dev/null; then
    cat .artifacts/vite-e2e.log >&2
    echo "Vite did not become ready." >&2
    exit 1
fi

python3 tests/e2e/test_deployed.py
