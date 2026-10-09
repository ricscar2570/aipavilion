# Core Correctness completato — 0.8.6-legacy.1

La prerelease completa a livello sorgente i sei blocchi introdotti prima di 4.5F:

- **AUTH-01:** access token Cognito con scope API grossolani e autorizzazione tenant server-side;
- **QUOTA-01:** limiti atomici, reservation, idempotenza e riconciliazione;
- **INVITE-01:** binding dell’identità, policy delle membership e accettazione transazionale;
- **CONCURRENCY-01:** revisioni monotone, `If-Match`, `ETag` e conflitti espliciti;
- **EXPORT-01:** export completi, soglie esplicite e neutralizzazione delle formule CSV;
- **LEGACY-01:** inventario dei writer e una sola semantica di scrittura canonica.

## Decisione LEGACY-01

La vecchia amministrazione globale degli stand poteva produrre record senza organizzazione/evento, quota, moderazione, pubblicazione fail-closed, audit o revisione. È stata trasformata in superficie read-only.

Gli stand vengono creati o modificati soltanto attraverso:

- workflow tenant degli eventi;
- workflow espositore;
- inviti canonici;
- migrazioni o repair esplicitamente autorizzati.

I writer sintetici richiedono una variabile di consenso e rifiutano destinazioni production-like. Ogni nuovo file capace di scrivere deve essere dichiarato in `config/writer-inventory.json`; il gate `npm run check:legacy` blocca writer non censiti.

## Stato probatorio

“Source complete” non equivale a “dimostrato su AWS”. Restano obbligatori:

- CI pubblica completa;
- SAM build/deploy;
- prove Cognito e IAM;
- concorrenza DynamoDB;
- tenant escape;
- failure injection;
- privacy e WCAG;
- restore e security assessment.

La prossima fase è `0.8.7 / Sprint 4.5F`.
