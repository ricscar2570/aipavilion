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

## Snapshot completo

La presente consegna non introduce nuove funzioni. Riunisce codice, storico e documentazione per fornire una base unica da cui eseguire 4.5F, 4.5G e il pilot.
