# Pilot service objectives

These objectives guide the invited pilot. They are not a paid production SLA.

- Monthly availability objective: 99.5% excluding announced maintenance.
- Public API 5xx objective: below 0.5% over a rolling day.
- Public API p95 latency objective: below 2 seconds.
- Confirmed-data loss objective: zero under normal operation.
- Recovery point objective target: 24 hours from daily backup, with DynamoDB PITR offering a finer technical recovery window.
- Recovery time objective target: four hours for a single-table recovery during staffed pilot hours.
- SEV-1 acknowledgement objective: one staffed hour.
- Pilot support channel and staffed hours must be stated in each pilot agreement.

These objectives become contractual only after measured staging/pilot evidence and legal/commercial approval.
