# Sicurezza, privacy e autenticazione

## Autenticazione

Cognito gestisce password, conferma, MFA, password temporanea, reset, cambio password e logout globale. La policy richiede dodici caratteri, maiuscola, minuscola, numero e simbolo.

## Autorizzazione

Le rotte protette usano access token e controlli server-side. I gruppi Cognito non sostituiscono la membership tenant-scoped.

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
