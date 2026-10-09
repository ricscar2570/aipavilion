# Cronologia completa dell’evoluzione

## Repository iniziale

La prima versione presentava AI Pavilion come piattaforma immersiva già vicina alla produzione, ma il codice conteneva repository duplicate, deployment concorrenti, rotte mancanti, schema ordini incoerente, packaging Lambda fragile, autenticazione incompleta e funzionalità promesse ma non collegate.

## Fase 1 — 0.4.0

Consolidamento della repository, rimozione duplicati, bundling Lambda, CI bloccante, correzione rotte e schema ordini, checkout con prezzi server-side e prima baseline verificabile.

## Fase 2 — 0.5.0

Stack dev autosufficiente, Cognito e seed sintetici, test distribuiti predisposti, smoke API e percorso Playwright.

## Sprint 2.5 — 0.6.0

Catalogo sicuro, retry controllati, idempotenza checkout, webhook deduplicati, access token coerente, OpenAPI e test negativi.

## Fase 3 — 0.7.0

Introduzione del dominio multi-tenant: organizzazioni, membership, eventi, inviti, portali, ownership delle risorse e isolamento tra tenant.

## Fase 4 — 0.8.0

Staging persistente, CloudFront/S3, WAF, SES, billing SaaS, backup, osservabilità, privacy e accessibilità di base.

## Sprint 4.5A — 0.8.1

Lockfile portabile, validazione infrastrutturale semantica, correzione export privacy e bootstrap CloudFront in due passaggi.

## Sprint 4.5B — 0.8.2

Automazione delle evidenze staging, checkout prodotti disabilitato nel pilot, preflight esterno e test browser sul sito distribuito.

## Sprint 4.5C — 0.8.3

MFA, password temporanea, reset, ownership transfer, riassegnazione stand e cancellazione account con bloccanti.

## Sprint 4.5D — 0.8.4

Audit transazionale, lease webhook, watermark temporali, riconciliazione Stripe, retry DynamoDB e saga archiviazione.

## Sprint 4.5E — 0.8.5

Catalogo fail-closed, contatti opt-in, ricerca paginata corretta, prodotti nascosti esclusi, CSP senza inline e rimozione delle funzioni incompiute.

## Sprint 4.5E.1 / AUTH-01 — 0.8.6-auth.1

Contratto Cognito con access token e scope custom, trigger Pre Token Generation V2.0, 46 rotte protette con scope esplicito, separazione tra scope e autorizzazione tenant, identità inviti risolta dal profilo server-side e prova AWS dedicata. La consegna è una prerelease: QUOTA-01 e gli altri blocchi di Core Correctness restano aperti.

## Core Correctness — 0.8.6-invite.1 / 0.8.6-export.1

Sono stati implementati i protocolli atomici delle quote e degli inviti, le revisioni monotone e gli export completi/sicuri. Le prerelease hanno mantenuto separato lo stato source-complete dalle prove AWS ancora aperte.

## LEGACY-01 — 0.8.6-legacy.1

È stato censito ogni writer mutante, eliminato il writer globale degli stand, resa read-only la relativa superficie admin, introdotto il dominio canonico degli stand e protetti i writer sintetici/migrazione. La revisione ha corretto anche regressioni ereditate nei writer di eventi e stand prima del consolidamento.

## Snapshot completo

La presente consegna chiude a livello sorgente AUTH-01, QUOTA-01, INVITE-01, CONCURRENCY-01, EXPORT-01 e LEGACY-01. La fase successiva è 0.8.7 / 4.5F; le prove distribuite AWS, sicurezza, privacy, WCAG e restore restano obbligatorie prima del pilot.
