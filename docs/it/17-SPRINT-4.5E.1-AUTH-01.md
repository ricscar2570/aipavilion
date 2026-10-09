# Sprint 4.5E.1 / AUTH-01 — Contratto Cognito con access token e scope

**Versione:** `0.8.6-auth.1`
**Stato:** implementazione sorgente completata; prova AWS reale ancora obbligatoria.

## Problema risolto

Il frontend inviava già l’access token Cognito, ma le rotte API Gateway protette non dichiaravano scope. Inoltre l’accettazione degli inviti dipendeva dalla presenza dell’email nei claim del token.

## Contratto canonico

```text
access token valido
+ scope API grossolano
+ membership server-side
+ ruolo applicativo
+ ownership/assegnazione
+ entitlement
= operazione autorizzata
```

Gli scope sono:

- `aipavilion/user`;
- `aipavilion/tenant`;
- `aipavilion/platform-admin`.

Gli scope non assegnano un ruolo tenant. Membership, stato, ruolo, proprietà e limiti continuano a essere verificati nel backend.

## Implementazione

- Resource Server Cognito `aipavilion`.
- User Pool esplicitamente su piano `ESSENTIALS`.
- trigger Pre Token Generation V2.0;
- piano Cognito persistente conservato come unità coerente nello staging: pool, client, scope, gruppi e trigger;
- scope user/tenant per gli utenti autenticati;
- scope platform-admin soltanto per il gruppo Cognito `admin`;
- 46 eventi SAM protetti con scope esplicito;
- OpenAPI riallineato;
- email degli inviti risolta dal profilo server-side tramite `sub`;
- prova AWS dedicata `npm run test:auth:deployed`, inclusa la conservazione degli scope dopo il refresh;
- verifica statica/eseguibile `npm run check:auth`.

## Tracciabilità sintetica

| Requisito  | Invariante                                                | Prova locale                       | Prova ancora necessaria                                          |
| ---------- | --------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| AUTH-01-01 | Ogni rotta protetta richiede access token e scope atteso. | `check-auth-contract.js`           | AWS/API Gateway sulla build esatta.                              |
| AUTH-01-02 | Gli scope non sostituiscono membership e ownership.       | Contratto sorgente e test dedicato | Utente con scope tenant ma senza membership deve ricevere `403`. |
| AUTH-01-03 | L’invito usa il profilo server-side associato a `sub`.    | `check-auth-invitation-binding.js` | Suite Jest e percorso distribuito.                               |
| AUTH-01-04 | Gli scope restano corretti anche dopo refresh.            | Trigger V2.0 eseguito localmente   | Refresh Cognito reale.                                           |
| AUTH-01-05 | L’ID token non soddisfa le rotte scoped.                  | Parità SAM/OpenAPI                 | Rifiuto distribuito `401/403`.                                   |
| AUTH-01-06 | Il piano Cognito persistente viene conservato come unità. | Controllo template pilot           | Rehearsal CloudFormation.                                        |

## Verifiche già superate

- 46 rotte protette coerenti;
- 56 eventi API;
- 24 Lambda;
- 54 path OpenAPI;
- 77 risorse infrastrutturali;
- 17 indici DynamoDB;
- 85 file Node.js sintatticamente validi;
- parità del template pilot.

## Limite della consegna

L’ambiente non ha risolto il registry npm pubblico e non dispone di AWS/SAM. Non vengono quindi dichiarati come eseguiti Jest, lint, build, audit, deploy o test Cognito reali. Il gate AUTH-01 sarà definitivamente chiuso solo dopo una prova AWS verde associata al commit esatto.

## Prossimo blocco

`QUOTA-01`: limiti di piano atomici, reservation, idempotenza e riconciliazione del drift.
