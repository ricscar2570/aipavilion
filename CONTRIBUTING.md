# Contributing to AI Pavilion

## Supported workflow

1. Create a focused branch from the current canonical branch.
2. Change only active source under `backend/`, `frontend/`, `scripts/`, `tests/`, `docs/`, or `template.yaml`.
3. Add or update tests and documentation for behavior changes.
4. Run the complete local gate:

```bash
npm ci
npm run verify
npm audit --audit-level=high
```

5. When AWS SAM CLI is available, also run:

```bash
sam validate --lint --template-file template.yaml
sam build --template-file template.yaml
```

## Rules

- Do not reintroduce a parallel application tree or deployment system.
- Do not accept authoritative prices, permissions, tenant IDs, or ownership from the browser.
- Do not add a frontend endpoint without a matching SAM route and backend implementation.
- Do not expose tokens, payment identifiers, secrets, or personal request bodies in logs.
- Do not claim a feature is shipped unless it is reachable, tested, documented, and deployed in the supported architecture.
- Keep `package-lock.json` updated with dependency changes.

Pull requests must pass the CI quality and SAM jobs before merge.
