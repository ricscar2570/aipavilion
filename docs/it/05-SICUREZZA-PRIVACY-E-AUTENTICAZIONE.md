# Sicurezza, privacy e autenticazione

## Autenticazione

Cognito gestisce password, conferma, TOTP MFA, password temporanea, reset e cambio password. La policy richiede dodici caratteri, maiuscola, minuscola, numero e simbolo. Il frontend invia esclusivamente l’access token alle API protette.

Il User Pool usa esplicitamente il piano `ESSENTIALS` e un trigger Pre Token Generation V2.0 che aggiunge scope custom anche ai token ottenuti dai flussi SRP/password e refresh.

## Autorizzazione

API Gateway richiede uno scope grossolano:

- `aipavilion/user`;
- `aipavilion/tenant`;
- `aipavilion/platform-admin`.

Gli scope non sostituiscono la membership tenant-scoped. Il backend verifica ancora stato della membership, ruolo, ownership, assegnazione ed entitlement. Il gruppo Cognito `admin` rimane una protezione separata per l’amministrazione globale.

L’identità canonica è `sub`. L’accettazione degli inviti recupera l’email dal profilo applicativo server-side e non dipende dalla presenza dell’email nell’access token.

La revoca dei refresh token e il logout non implicano l’invalidazione istantanea di ogni JWT già emesso. Le operazioni sensibili continuano quindi a verificare lo stato server-side corrente.

## Protezione pubblica

- catalogo fail-closed;
- contatti opt-in;
- lead con honeypot, idempotenza e Turnstile;
- WAF e rate limit definiti in IaC;
- CSP senza inline script/style;
- dipendenze opzionali caricate dinamicamente.

## Privacy

L’utente può esportare dati personali e richiedere la cancellazione. La cancellazione viene bloccata per owner e stand assegnati. Il progetto possiede un inventario dati, ma retention, ruoli GDPR, DPA e termini cliente richiedono approvazione professionale.

## Pagamenti

I prezzi sono server-owned. Gli eventi Stripe sono firmati, deduplicati, dotati di lease e riconciliati. Il checkout prodotti non è un marketplace e resta disabilitato nel pilot.

## Gate residui

- penetration test;
- tenant-isolation assessment;
- test WAF;
- revisione IAM reale;
- approvazione privacy e legale;
- restore drill misurato;
- accessibilità manuale.

## Verifica AUTH-01

```bash
npm run check:auth
npm run test:auth:deployed
```

Il primo comando verifica sorgente, SAM, OpenAPI e logica del trigger senza dipendenze esterne. Il secondo è il gate AWS obbligatorio e dimostra contenuto dei token, rifiuto dell’ID token, scope amministrativo e permanenza del controllo membership.
