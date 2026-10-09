# ADR — Quote atomiche e protocollo di accettazione inviti

## Decisione

AI Pavilion usa contatori DynamoDB dedicati e record di reservation/occupancy per proteggere quote di eventi e stand. Gli inviti pendenti prenotano lo slot prima della creazione della risorsa. L'identità di accettazione deriva da `sub` e dal profilo applicativo server-side; l'email del client non è autorevole.

## Motivazione

Il precedente schema count-then-write permetteva oversubscription sotto concorrenza e non riservava capacità per gli inviti pendenti. Inoltre una membership inattiva poteva produrre uno stand assegnato ma non utilizzabile.

## Conseguenze

- due nuove tabelle DynamoDB;
- migrazione obbligatoria;
- riconciliazione schedulata;
- idempotency key sui writer;
- nessuna riattivazione implicita delle membership;
- prove AWS concorrenti obbligatorie prima del pilot.
