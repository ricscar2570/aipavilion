# AI Pavilion 0.8.6-invite.1 — QUOTA-01 + INVITE-01

**Stato:** `SOURCE_COMPLETE_AWS_PROOF_PENDING`  
**Tag:** `v0.8.6-invite.1`

## Scopo

Questa prerelease corregge la baseline incompleta precedentemente etichettata come QUOTA-01 e introduce il protocollo INVITE-01. Le modifiche sono presenti nel codice eseguibile, non soltanto in manifest, rapporti o gate testuali.

## Invarianti QUOTA-01

```text
used + reserved + available = limit
used + reserved <= limit, salvo stato esplicito overLimit derivato da dati legacy o downgrade
```

Le allocazioni usano contatori DynamoDB condizionali, reservation idempotenti e record di occupancy. Eventi e inviti non possono superare il limite attraverso richieste concorrenti che condividono la stessa quota.

## Protocollo INVITE-01

L'accettazione richiede:

1. access token già verificato dall'authorizer;
2. `sub` come identità canonica;
3. profilo applicativo esistente e non eliminato;
4. email server-side corrispondente al destinatario;
5. invito `pending`, non revocato e non scaduto;
6. membership assente oppure attiva;
7. reservation di uno slot stand valida;
8. transizione idempotente della reservation da `reserved` a `used` dopo la creazione dello stand.

Membership inattive, sospese, pending o sconosciute non vengono riattivate implicitamente: l'organizzatore deve ripristinarle deliberatamente.

## Stati di quota

- `reserved`: unità prenotata ma non ancora consumata;
- `linked`: richiesta idempotente collegata alla risorsa creata;
- `used`: unità occupata da una risorsa attiva;
- `consumed`: reservation invito convertita in stand;
- `released`: unità restituita;
- `overLimit`: stato derivato quando i dati autorevoli superano il limite del piano.

## Migrazione

```bash
npm run quota:migrate:plan
npm run quota:migrate
npm run quota:reconcile:plan
```

La prima esecuzione è dry-run. La migrazione deve essere applicata prima di aprire traffico concorrente sui writer protetti.

## Riconciliazione

```bash
npm run quota:reconcile:plan
npm run quota:reconcile:apply
```

Il repair usa update condizionali e non sovrascrive cambiamenti concorrenti. La Lambda pianificata ripete il controllo ogni 15 minuti e pubblica metriche nel namespace `AI-Pavilion/Quota`.

## Prove locali

```bash
npm run test:quota-invite:static
node --check backend/lambda/common/quota-store.js
node --check backend/lambda/invitations/invite-wrapper.js
node --check backend/lambda/events/quota-wrapper.js
```

## Prova AWS ancora obbligatoria

La release non è `AWS_PROVEN` finché non vengono eseguiti:

- deploy di uno stack disposable;
- migrazione 003;
- test concorrente sulle quote;
- replay idempotente;
- doppia accettazione simultanea;
- invito scaduto/revocato;
- membership inattiva e sospesa;
- riconciliazione dopo failure injection;
- `sam validate` e `sam build` nella CI completa.

## Rollback

Il rollback del codice non deve eliminare le due nuove tabelle. Prima di ritornare a writer privi di QUOTA-01 occorre chiudere o mettere in manutenzione i flussi di creazione, altrimenti i contatori diventerebbero non autorevoli.

## Hardening aggiuntivo

- le parole riservate DynamoDB sono sempre aliasate nelle expression;
- il TTL usa `ttlExpiresAt` soltanto per la retention dei record terminali;
- `reservationExpiresAt` e `invitationExpiresAt` restano scadenze di dominio gestite dal reconciler;
- ogni allocazione rilegge il limite corrente dell'entitlement, così upgrade e downgrade non attendono il job pianificato;
- le metriche usano CloudWatch Embedded Metric Format e non introducono una nuova dipendenza npm.
