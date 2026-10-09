# Deployment, operazioni e runbook

## Ambienti

- `local`: Vite e dipendenze locali.
- `dev`: stack AWS eliminabile con pagamenti simulati.
- `staging`: stack persistente con dati sintetici e servizi reali in test mode.
- `production`: stesso modello infrastrutturale, attivabile solo dopo i gate.

## Flusso staging

1. Preflight strumenti, AWS, SES e registry.
2. Generazione e controllo template pilot.
3. Bootstrap backend.
4. Creazione frontend CloudFront/S3.
5. Risoluzione origine finale.
6. Aggiornamento backend CORS/callback.
7. Migrazioni.
8. Pubblicazione frontend.
9. Test distribuiti.
10. Manifest di evidenze.

## Operazioni

Sono presenti procedure per incidenti, synthetic, budget, backup e restore. Ogni procedura deve produrre evidenza datata e responsabile.

## Comandi

```bash
# Installazione riproducibile
npm run ci:install

# Contratto AUTH-01 senza dipendenze esterne
npm run check:auth

# Gate completo locale
npm run verify
npm audit --audit-level=high

# Ambiente dev eliminabile
export AWS_REGION=eu-west-1
export STACK_NAME=ai-pavilion-dev
export ALLOWED_ORIGIN=http://127.0.0.1:3000
npm run dev:deploy

# Prova distribuita AUTH-01 su uno stack già predisposto
npm run test:auth:deployed

# Staging persistente
npm run pilot:generate
npm run pilot:check
npm run pilot:preflight
npm run pilot:deploy
ALLOW_SYNTHETIC_FIXTURES=true npm run pilot:evidence

# Migrazioni
npm run pilot:migrate:plan
npm run pilot:migrate
npm run pilot:migrate:verify

# Synthetic e restore drill
npm run pilot:synthetic
npm run pilot:restore-drill
```
