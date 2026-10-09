# Internal pilot evidence

Runtime evidence, manual approvals and promotion receipts are intentionally not committed. Use the protected staging workflow and retain generated artifacts externally.

Directories used at execution time:

```text
evidence/internal-pilot/runtime
evidence/internal-pilot/approvals
evidence/internal-pilot/promotion
```

`PENDING`, missing, stale, wrong-commit or wrong-environment evidence blocks promotion.
