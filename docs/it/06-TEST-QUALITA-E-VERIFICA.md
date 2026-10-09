# Test, qualità e confine di verifica

## Suite presente

| File di test                                             | Scopo                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| tests/e2e/test_deployed.py                               | Percorso browser distribuito tramite Playwright.                                                              |
| tests/fixtures/stripe/payment_intent.payment_failed.json | Fixture Stripe usata dai test.                                                                                |
| tests/fixtures/stripe/payment_intent.succeeded.json      | Fixture Stripe usata dai test.                                                                                |
| tests/integration/dynamodb.deployed.test.js              | Test contro tabelle e indici DynamoDB distribuiti.                                                            |
| tests/unit/admin.test.js                                 | Test unitari/regressione per admin.                                                                           |
| tests/unit/api-client.test.js                            | Test unitari/regressione per api client.                                                                      |
| tests/unit/api-endpoints.test.js                         | Test unitari/regressione per api endpoints.                                                                   |
| tests/unit/audit.test.js                                 | Test unitari/regressione per audit.                                                                           |
| tests/unit/auth-contract.test.js                         | Regressione statica del contratto Cognito: access token, scope, SAM/OpenAPI e separazione dai ruoli tenant.   |
| tests/unit/auth-lifecycle.test.js                        | Test unitari/regressione per auth lifecycle.                                                                  |
| tests/unit/catalog.test.js                               | Test unitari/regressione per catalog.                                                                         |
| tests/unit/checkout.test.js                              | Test unitari/regressione per checkout.                                                                        |
| tests/unit/frontend.test.js                              | Test unitari/regressione per frontend.                                                                        |
| tests/unit/observability.test.js                         | Test unitari/regressione per observability.                                                                   |
| tests/unit/payment-reconciliation.test.js                | Test unitari/regressione per payment reconciliation.                                                          |
| tests/unit/pre-token-generation.test.js                  | Test del trigger Cognito V2.0 che aggiunge gli scope agli access token e fallisce chiuso sugli eventi legacy. |
| tests/unit/phase3-endpoints.test.js                      | Test unitari/regressione per phase3 endpoints.                                                                |
| tests/unit/phase4-endpoints.test.js                      | Test unitari/regressione per phase4 endpoints.                                                                |
| tests/unit/profile-sync.test.js                          | Test unitari/regressione per profile sync.                                                                    |
| tests/unit/user-account.test.js                          | Test unitari/regressione per user account.                                                                    |
| tests/unit/user-endpoints.test.js                        | Test unitari/regressione per user endpoints.                                                                  |
| tests/unit/validate-config.test.js                       | Test unitari/regressione per validate config.                                                                 |

## Gate locale

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

## CI

| Workflow      | Funzione                                                                               |
| ------------- | -------------------------------------------------------------------------------------- |
| ci.yml        | Lint, formattazione, contratti, test, coverage, build frontend, audit e build SAM.     |
| security.yml  | Audit dipendenze, controlli statici e ricerca formati comuni di segreti.               |
| deploy.yml    | Deploy di uno stack dev eliminabile, seed, test DynamoDB/API/browser e distruzione.    |
| staging.yml   | Deploy staging/production con OIDC, migrazioni, prove distribuite e manifest evidenze. |
| synthetic.yml | Controllo orario del sito staging, header di sicurezza e salute API.                   |

## Limite interpretativo della coverage

Le soglie coprono tutto il backend Lambda eccetto i moduli comuni e soltanto alcuni moduli frontend. La percentuale globale non misura da sola la qualità della SPA o dei percorsi distribuiti.

## Evidenze indispensabili

1. Installazione da lockfile pubblico.
2. Lint, formattazione, test e build.
3. `sam validate` e `sam build`.
4. Deploy dev e staging senza modifiche da console.
5. Test di tutti gli indici DynamoDB.
6. Login Cognito reale con access token, issuer/client e scope attesi.
7. Refresh token con conservazione degli scope applicativi.
8. Rifiuto dell'ID token sulle API protette e dell'accesso admin senza scope.
9. Prova che lo scope tenant non sostituisce membership, ruolo e ownership server-side.
10. Smoke API con identità separate.
11. Playwright sul dominio CloudFront.
12. Synthetic ripetuto.
13. Prove Stripe, SES, WAF e CloudWatch.
14. Restore drill.
15. Security e accessibility review indipendenti.
