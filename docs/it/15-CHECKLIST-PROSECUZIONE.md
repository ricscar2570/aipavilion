# Checklist per riprendere lo sviluppo

## Prima di modificare il codice

- usare questo snapshot come unica base;
- verificare Node e npm;
- eseguire `npm run ci:install`;
- eseguire `npm run verify`;
- eseguire `npm audit --audit-level=high`;
- non modificare manualmente i template pilot generati;
- aggiornare OpenAPI e SAM insieme;
- aggiungere test per ogni modifica di dominio.

## Prima di distribuire dev

- account AWS isolato;
- ruolo OIDC o credenziali temporanee;
- nome stack valido;
- dati sintetici;
- nessun segreto nel repository.

## Prima di distribuire staging

- mittente SES verificato;
- credenziali Stripe test;
- Turnstile test;
- alert email;
- budget;
- ambiente GitHub protetto;
- product checkout disabilitato;
- backup e logging configurati.

## Prima del pilot

- prove staging ripetute;
- zero P0/P1;
- accessibility review;
- penetration test;
- privacy/legal review;
- restore drill;
- incident drill;
- supporto e rollback;
- cliente informato che si tratta di pilot.

## Regole di scope

- non introdurre marketplace prima di Stripe Connect e modello legale;
- non introdurre AI solo per il nome;
- non introdurre AR/360° prima della stabilità del core;
- non interpretare un test unitario come prova del servizio AWS reale.
