# Inventario tecnico completo

## Metriche

| Area | File | Righe indicative |
| --- | --- | --- |
| Backend JS | 33 | 8516 |
| Frontend JS | 21 | 5861 |
| Frontend CSS | 1 | 87 |
| Tests JS | 17 | 5392 |
| Tests Python | 1 | 245 |
| Scripts JS | 28 | 3929 |
| Scripts Shell | 6 | 458 |
| Docs Markdown | 36 | 6982 |

## Lambda

| Risorsa SAM | Handler | Responsabilità | Eventi/rotte | Dipendenze configurate |
| --- | --- | --- | --- | --- |
| GetStandsFunction | get-stands/index.handler | Elenca gli stand pubblici con pubblicazione fail-closed e paginazione. | GET /stands | EVENT_STANDS_INDEX, PUBLIC_STANDS_INDEX, STANDS_TABLE |
| GetStandDetailFunction | get-stand-detail/index.handler | Restituisce la proiezione pubblica di un singolo stand. | GET /stands/{standId} | STANDS_TABLE |
| SearchStandsFunction | search-stands/index.handler | Ricerca nel catalogo pubblico attraversando le pagine DynamoDB. | GET /stands/search | EVENT_STANDS_INDEX, PUBLIC_STANDS_INDEX, STANDS_TABLE |
| CheckoutFunction | checkout/index.handler | Gestisce il checkout dei prodotti, gli ordini e il webhook Stripe; nel pilot persistente è disabilitato per impostazione predefinita. | POST /checkout/create-intent<br>POST /checkout/confirm-order<br>GET /checkout/order/{orderId}<br>POST /checkout/webhook | ORDERS_TABLE, PAYMENT_EVENTS_TABLE, PAYMENT_MODE, STANDS_TABLE, STRIPE_SECRET_KEY_ARN |
| AdminFunction | admin/index.handler | Espone dashboard, gestione stand, utenti, ordini e analytics per amministratori di piattaforma. | GET /admin/dashboard<br>ANY /admin/stands<br>ANY /admin/stands/{standId}<br>GET /admin/users<br>GET /admin/orders<br>GET /admin/analytics | COGNITO_CLIENT_ID, COGNITO_USER_POOL_ID, INTERACTIONS_TABLE, ORDERS_TABLE, STANDS_TABLE, USERS_TABLE |
| UserSavedStandsFunction | user-saved-stands/index.handler | Gestisce i preferiti dell’utente autenticato. | GET /user/saved-stands<br>POST /user/saved-stands<br>DELETE /user/saved-stands/{standId} | SAVED_AT_INDEX, SAVED_STANDS_TABLE, STANDS_TABLE |
| UserAccountFunction | user-account/index.handler | Espone stato dell’account, bloccanti alla cancellazione e cancellazione sicura. | GET /user/account<br>DELETE /user/account | COGNITO_USER_POOL_ID, MEMBERSHIPS_TABLE, ORDERS_TABLE, OWNER_STANDS_INDEX, SAVED_STANDS_TABLE, STANDS_TABLE, USERS_TABLE |
| UserOrdersFunction | user-orders/index.handler | Elenca gli ordini appartenenti all’utente autenticato. | GET /user/orders | ORDERS_TABLE, USER_ORDERS_INDEX |
| UserStatsFunction | user-stats/index.handler | Calcola statistiche personali basate su ordini pagati e preferiti. | GET /user/stats | ORDERS_TABLE, SAVED_STANDS_TABLE |
| ContactStandFunction | contact-stand/index.handler | Riceve lead pubblici con validazione, idempotenza, honeypot e challenge anti-bot configurabile. | POST /stands/contact | BOT_CHALLENGE_MODE, BOT_CHALLENGE_SECRET_ARN, LEADS_TABLE, STANDS_TABLE |
| TrackInteractionFunction | track-interaction/index.handler | Registra interazioni pubbliche consentite, non economiche e validate. | POST /interactions | STANDS_TABLE, TABLE_INTERACTIONS |
| OrganizationsFunction | organizations/index.handler | Gestisce organizzazioni, membership, ownership transfer ed entitlement. | GET /me/memberships<br>POST /platform/organizations<br>ANY /organizations/{organizationId}<br>POST /organizations/{organizationId}/ownership-transfer<br>ANY /organizations/{organizationId}/memberships<br>ANY /organizations/{organizationId}/memberships/{userId}<br>GET /organizations/{organizationId}/entitlement | AUDIT_TABLE, ENTITLEMENTS_TABLE, MEMBERSHIPS_TABLE, ORGANIZATIONS_TABLE, ORGANIZATION_MEMBERS_INDEX, USERS_TABLE |
| EventsFunction | events/index.handler | Gestisce ciclo di vita eventi, pubblicazione, archiviazione, duplicazione, assegnazione e moderazione stand. | ANY /organizations/{organizationId}/events<br>ANY /organizations/{organizationId}/events/{eventId}<br>POST /organizations/{organizationId}/events/{eventId}/duplicate<br>POST /organizations/{organizationId}/events/{eventId}/archive<br>POST /organizations/{organizationId}/events/{eventId}/publish<br>GET /organizations/{organizationId}/events/{eventId}/stands<br>PATCH /organizations/{organizationId}/events/{eventId}/stands/{standId}/assignment<br>PATCH /organizations/{organizationId}/events/{eventId}/stands/{standId}/moderation | AUDIT_TABLE, ENTITLEMENTS_TABLE, EVENTS_TABLE, EVENT_STANDS_INDEX, MEMBERSHIPS_TABLE, ORGANIZATION_EVENTS_INDEX, STANDS_TABLE |
| InvitationsFunction | invitations/index.handler | Gestisce inviti, invio SES, accettazione, revoca e reinvio. | ANY /organizations/{organizationId}/events/{eventId}/invitations<br>ANY /organizations/{organizationId}/events/{eventId}/invitations/{invitationId}<br>POST /organizations/{organizationId}/events/{eventId}/invitations/{invitationId}/resend<br>POST /invitations/{invitationId}/accept | APP_URL, AUDIT_TABLE, EMAIL_CONFIGURATION_SET, ENTITLEMENTS_TABLE, EVENTS_TABLE, EVENT_INVITATIONS_INDEX, EVENT_STANDS_INDEX, INVITATIONS_TABLE, INVITATION_EMAIL_FROM, INVITATION_EMAIL_MODE, MEMBERSHIPS_TABLE, ORGANIZATIONS_TABLE, STANDS_TABLE |
| ExhibitorStandsFunction | exhibitor-stands/index.handler | Consente all’espositore di leggere e modificare gli stand assegnati e inviarli in revisione. | GET /exhibitor/stands<br>ANY /exhibitor/stands/{standId}<br>POST /exhibitor/stands/{standId}/submit | AUDIT_TABLE, EVENTS_TABLE, OWNER_STANDS_INDEX, STANDS_TABLE |
| ExhibitorLeadsFunction | exhibitor-leads/index.handler | Consente all’espositore di consultare, esportare e aggiornare i lead dei propri stand. | GET /exhibitor/leads<br>GET /exhibitor/leads/export<br>PATCH /exhibitor/leads/{leadId} | AUDIT_TABLE, LEADS_TABLE, MEMBERSHIPS_TABLE, STANDS_TABLE, STAND_LEADS_INDEX |
| PublicEventsFunction | public-events/index.handler | Espone eventi pubblici e relativi stand. | GET /events<br>GET /events/{eventId}<br>GET /events/{eventId}/stands | EVENTS_TABLE, EVENT_STANDS_INDEX, PUBLIC_EVENTS_INDEX, STANDS_TABLE |
| BillingFunction | billing/index.handler | Gestisce billing SaaS Stripe, Checkout, Billing Portal, webhook e entitlement. | GET /organizations/{organizationId}/billing<br>POST /organizations/{organizationId}/billing/checkout<br>POST /organizations/{organizationId}/billing/portal<br>POST /billing/webhook | APP_URL, AUDIT_TABLE, BILLING_MODE, ENTITLEMENTS_TABLE, MEMBERSHIPS_TABLE, ORGANIZATIONS_TABLE, PAYMENT_EVENTS_TABLE, STRIPE_PRICE_MAP, STRIPE_SECRET_KEY_ARN |
| EmailEventsFunction | email-events/index.handler | Elabora la telemetria SES/SNS relativa agli inviti. | SNS:InvitationEmailEvents | AUDIT_TABLE, INVITATIONS_TABLE |
| AuditViewFunction | audit-view/index.handler | Espone l’audit trail dell’organizzazione ai ruoli autorizzati. | GET /organizations/{organizationId}/audit | AUDIT_TABLE, MEMBERSHIPS_TABLE, ORGANIZATION_AUDIT_INDEX |
| DataExportFunction | data-export/index.handler | Genera l’esportazione dei dati personali dell’utente. | GET /user/export | MEMBERSHIPS_TABLE, ORDERS_TABLE, SAVED_STANDS_TABLE, USERS_TABLE, USER_ORDERS_INDEX, USER_SAVED_INDEX |
| PaymentReconciliationFunction | payment-reconciliation/index.handler | Riconcilia periodicamente webhook, ordini ed entitlement con Stripe. | Schedule:Schedule | BILLING_MODE, ENTITLEMENTS_TABLE, ORDERS_TABLE, PAYMENT_EVENTS_TABLE, PAYMENT_MODE, RECONCILIATION_MAX_ITEMS, RECONCILIATION_MAX_SCAN_PAGES, STALE_ORDER_MINUTES, STRIPE_SECRET_KEY_ARN |
| ProfileSyncFunction | profile-sync/index.handler | Crea o sincronizza il profilo applicativo dopo la conferma Cognito. |  | USERS_TABLE |

## Tabelle

| Risorsa | Nome fisico | Contenuto | Indici |
| --- | --- | --- | --- |
| StandsTable | ${AWS::StackName}-stands | Stand, prodotti incorporati, stato di moderazione, visibilità pubblica, assegnazione espositore. | category-index, event-stands-index, public-stands-index, owner-stands-index |
| OrdersTable | ${AWS::StackName}-orders | Ordini visitatore e stato di pagamento. | user-orders-index |
| PaymentEventsTable | ${AWS::StackName}-payment-events | Deduplicazione, lease e stato dei webhook Stripe. | — |
| UsersTable | ${AWS::StackName}-users | Profilo applicativo associato all’identità Cognito. | — |
| LeadsTable | ${AWS::StackName}-leads | Richieste di contatto generate dai visitatori. | stand-leads-index, organization-leads-index |
| InteractionsTable | ${AWS::StackName}-interactions | Eventi di engagement non economici. | stand-created-index, event-created-index |
| SavedStandsTable | ${AWS::StackName}-saved-stands | Preferiti degli utenti. | user-saved-at-index |
| OrganizationsTable | ${AWS::StackName}-organizations | Tenant cliente, piano, onboarding e owner. | organization-slug-index |
| MembershipsTable | ${AWS::StackName}-memberships | Appartenenza e ruolo dell’utente nell’organizzazione. | organization-members-index |
| EventsTable | ${AWS::StackName}-events | Eventi virtuali/ibridi, ciclo di pubblicazione e visibilità. | organization-events-index, public-events-index |
| InvitationsTable | ${AWS::StackName}-invitations | Inviti per espositori e collaboratori, stato di consegna. | email-invitations-index, event-invitations-index |
| EntitlementsTable | ${AWS::StackName}-entitlements | Piano SaaS, limiti e stato di sincronizzazione Stripe. | — |
| AuditEventsTable | ${AWS::StackName}-audit-events | Audit trail tenant-scoped. | organization-audit-index |
| SchemaMigrationsTable | ${AWS::StackName}-schema-migrations | Versioni e stato delle migrazioni dati. | — |

## Frontend

| Modulo frontend | Responsabilità |
| --- | --- |
| account/auth.js | Autenticazione Cognito, challenge MFA, password temporanea, reset e gestione sessione. |
| account/dashboard-templates.js | Template della dashboard account. |
| account/dashboard.js | Dashboard visitatore, preferiti, ordini, export e cancellazione account. |
| app.js | Bootstrap SPA, router hash, coordinamento delle viste e feature flags. |
| checkout/cart.js | Carrello locale e stato dei prodotti selezionati. |
| checkout/checkout.js | Orchestrazione del checkout prodotti; nascosto quando disabilitato. |
| checkout/stripe.js | Caricamento dinamico e integrazione Stripe lato browser. |
| core/api.js | Client HTTP, access token Cognito, retry controllato ed errori. |
| core/config.js | Configurazione runtime generata dagli output dello stack. |
| core/constants.js | Costanti condivise. |
| core/external.js | Caricamento sicuro di dipendenze esterne opzionali. |
| core/helpers.js | Utility generali e sanitizzazione. |
| core/templates.js | Template UI comuni. |
| core/validators.js | Validazione dei dati lato browser. |
| events/public.js | Elenco e dettaglio degli eventi pubblici. |
| stands/card.js | Card accessibili degli stand. |
| stands/detail.js | Dettaglio pubblico dello stand e invio lead. |
| stands/search.js | Ricerca pubblica e navigazione risultati. |
| styles.css | Stili Tailwind e regole accessibilità. |
| tenant/portal-templates.js | Template dei portali organizzatore/espositore. |
| tenant/portal.js | Onboarding, team, eventi, inviti, stand, lead, audit e billing. |
| ui/ui.js | Gestione di messaggi, caricamenti, modali e stati globali. |

## Test

| File di test | Scopo |
| --- | --- |
| tests/e2e/test_deployed.py | Percorso browser distribuito tramite Playwright. |
| tests/fixtures/stripe/payment_intent.payment_failed.json | Fixture Stripe usata dai test. |
| tests/fixtures/stripe/payment_intent.succeeded.json | Fixture Stripe usata dai test. |
| tests/integration/dynamodb.deployed.test.js | Test contro tabelle e indici DynamoDB distribuiti. |
| tests/unit/admin.test.js | Test unitari/regressione per admin. |
| tests/unit/api-client.test.js | Test unitari/regressione per api client. |
| tests/unit/api-endpoints.test.js | Test unitari/regressione per api endpoints. |
| tests/unit/audit.test.js | Test unitari/regressione per audit. |
| tests/unit/auth-lifecycle.test.js | Test unitari/regressione per auth lifecycle. |
| tests/unit/catalog.test.js | Test unitari/regressione per catalog. |
| tests/unit/checkout.test.js | Test unitari/regressione per checkout. |
| tests/unit/frontend.test.js | Test unitari/regressione per frontend. |
| tests/unit/observability.test.js | Test unitari/regressione per observability. |
| tests/unit/payment-reconciliation.test.js | Test unitari/regressione per payment reconciliation. |
| tests/unit/phase3-endpoints.test.js | Test unitari/regressione per phase3 endpoints. |
| tests/unit/phase4-endpoints.test.js | Test unitari/regressione per phase4 endpoints. |
| tests/unit/profile-sync.test.js | Test unitari/regressione per profile sync. |
| tests/unit/user-account.test.js | Test unitari/regressione per user account. |
| tests/unit/user-endpoints.test.js | Test unitari/regressione per user endpoints. |
| tests/unit/validate-config.test.js | Test unitari/regressione per validate config. |

## Workflow

| Workflow | Funzione |
| --- | --- |
| ci.yml | Lint, formattazione, contratti, test, coverage, build frontend, audit e build SAM. |
| security.yml | Audit dipendenze, controlli statici e ricerca formati comuni di segreti. |
| deploy.yml | Deploy di uno stack dev eliminabile, seed, test DynamoDB/API/browser e distruzione. |
| staging.yml | Deploy staging/production con OIDC, migrazioni, prove distribuite e manifest evidenze. |
| synthetic.yml | Controllo orario del sito staging, header di sicurezza e salute API. |

## Parametri

| Parametro dev | Tipo | Default | Valori ammessi | Descrizione |
| --- | --- | --- | --- | --- |
| Environment | String | dev | dev |  |
| AllowedOrigin | String | http://127.0.0.1:3000 | — | Exact frontend origin allowed by CORS. |
| StripeSecretKey | String | sk_test_not_configured | — | Stripe test-mode secret key. Use a real sk_test value only in dev. |
| StripeWebhookSecret | String | whsec_not_configured | — | Stripe test-mode webhook signing secret. |
| PaymentMode | String | disabled | disabled, simulated, stripe | Use simulated only for disposable development stacks. |
| AppUrl | String | http://127.0.0.1:3000 | — | Exact frontend base URL used for invitation and billing return links. |
| BillingMode | String | disabled | disabled, simulated, stripe |  |
| StripeBillingWebhookSecret | String | whsec_billing_not_configured | — |  |
| StripePilotPriceId | String | price_pilot_not_configured | — |  |
| StripeStarterPriceId | String | price_starter_not_configured | — |  |
| StripeProfessionalPriceId | String | price_professional_not_configured | — |  |
| InvitationEmailMode | String | simulated | disabled, simulated, ses |  |
| InvitationEmailFrom | String | no-reply@example.invalid | — |  |
| BotChallengeMode | String | simulated | disabled, simulated, turnstile |  |
| BotChallengeSecret | String | turnstile_not_configured | — |  |
| AuditRetentionDays | Number | 365 | — |  |

## Output

| Output | Descrizione | Valore logico |
| --- | --- | --- |
| ApiEndpoint | API Gateway base URL | https://${ApiGateway}.execute-api.${AWS::Region}.amazonaws.com/${Environment} |
| UserPoolId | Cognito User Pool ID | UserPool |
| UserPoolClientId | Cognito public web client ID | UserPoolClient |
| StripeSecretArn | ARN of the stack-managed Stripe test secret | StripeSecret |
| BotChallengeSecretArn |  | BotChallengeCredentials |
| InvitationEventTopicArn |  | InvitationEventTopic |
| StandsTableName |  | StandsTable |
| OrdersTableName |  | OrdersTable |
| PaymentEventsTableName |  | PaymentEventsTable |
| UsersTableName |  | UsersTable |
| LeadsTableName |  | LeadsTable |
| InteractionsTableName |  | InteractionsTable |
| SavedStandsTableName |  | SavedStandsTable |
| OrganizationsTableName |  | OrganizationsTable |
| MembershipsTableName |  | MembershipsTable |
| EventsTableName |  | EventsTable |
| InvitationsTableName |  | InvitationsTable |
| EntitlementsTableName |  | EntitlementsTable |
| AuditEventsTableName |  | AuditEventsTable |
| SchemaMigrationsTableName |  | SchemaMigrationsTable |
| ApiGatewayId |  | ApiGateway |
| ApiGatewayName |  | ${AWS::StackName}-api |
