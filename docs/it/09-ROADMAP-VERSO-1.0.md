# Roadmap canonica verso AI Pavilion 1.0

La roadmap usa gate ed evidenze, non una media di voti. Una milestone è approvata soltanto quando i gate obbligatori sono verdi, i rischi residui sono registrati e le prove sono riconducibili al commit e alla build.

| Milestone                           | Obiettivo                    | Contenuto                                                                                       | Stato                                                           |
| ----------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `0.8.6-legacy.1` / Core Correctness | Invarianti fondamentali      | AUTH-01, QUOTA-01, INVITE-01, CONCURRENCY-01, EXPORT-01 e LEGACY-01.                            | Sorgente completata; prove distribuite AWS ancora obbligatorie. |
| `0.8.7` / 4.5F                      | UX, privacy e accessibilità  | Session lifecycle, error contract, offline, WCAG 2.2 AA, retention e publishing saga.           | Successivo.                                                     |
| `0.8.8` / 4.5G                      | Prova avversaria e operativa | Tenant escape, failure injection, Stripe, SES, WAF, carico, restore e security assessment.      | Successivo.                                                     |
| `0.9.0`                             | Internal Pilot               | Percorso completo, runbook, incident/support rehearsal, cost baseline ed evidence bundle.       | Successivo.                                                     |
| `0.9.5`                             | Controlled Customer Pilot    | Un cliente, scope limitato, dati autorizzati, supporto diretto e metriche.                      | Successivo.                                                     |
| `0.9.8 RC1`                         | Production Hardening         | Refactoring guidato dalle prove, osservabilità, IAM review, retest e rehearsal.                 | Successivo.                                                     |
| `1.0.0`                             | Production Approved          | Tutti i gate critici verdi, rischi residui approvati, pilot chiuso, restore e rollback provati. | Obiettivo commerciale.                                          |
| `1.0.x`                             | Operationally Proven         | SLO, incidenti, costi, supporto e affidabilità verificati nel periodo osservativo.              | Dopo la GA.                                                     |

## Regola di scope freeze

Fino alla 1.0 entra una nuova funzione soltanto se elimina un bloccante del pilot, soddisfa un requisito normativo o mitiga un rischio P0/P1. Restano esclusi AI, AR, 360°, marketplace multi-vendor, Stripe Connect, streaming, chat, networking e booking avanzato.

## Gate non derogabili per la 1.0

- nessun tenant escape o bypass dell’autenticazione;
- nessuna esposizione di segreti o perdita dati non recuperabile;
- billing idempotente e riconciliabile;
- restore e rollback provati;
- privacy e WCAG approvate;
- zero finding critical e nessun high non formalmente risolto o accettabile;
- CI, build, deploy e migrazioni riproducibili;
- pilot cliente concluso con supporto e osservabilità operativi.

## Tracciabilità

Ogni requisito critico segue la catena:

```text
requisito → invariante → componente → test → evidenza → milestone
```
