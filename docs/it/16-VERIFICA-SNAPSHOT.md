# Verifica dello snapshot 0.8.6-legacy.1

Data: 24 agosto 2026
Versione: `0.8.6-legacy.1`

## Controlli statici e contrattuali eseguibili nello snapshot

- contratto LEGACY-01: ogni writer mutante scoperto è dichiarato nell’inventario;
- superficie platform-admin degli stand read-only in handler, IAM, SAM e OpenAPI;
- guardia dei writer sintetici contro destinazioni production-like;
- migrazioni e repair plan-only per impostazione predefinita;
- fixture stand canoniche, fail-closed e revisionate;
- sintassi Node.js dei file modificati;
- parità SAM/Lambda: 56 eventi API e 25 sorgenti Lambda;
- OpenAPI: 54 path e 63 operazioni;
- infrastruttura: 80 risorse e 17 indici DynamoDB;
- template backend pilot rigenerato e allineato;
- parsing JSON e controlli infrastrutturali disponibili;
- manifest e verifica indipendente del pacchetto finale, prodotti durante il packaging della release.

## Controlli dipendenti dalla toolchain esterna

L’ambiente di preparazione non ha completato l’installazione dal registry npm pubblico e non dispone di credenziali AWS/SAM utilizzabili. I risultati finali distinguono quindi fra gate realmente eseguiti e gate pending. Non vengono dichiarati come superati senza relativo log:

- suite Jest e coverage;
- ESLint e Prettier;
- build Vite ed esbuild;
- npm audit;
- SAM validate/build;
- deployment CloudFormation;
- Cognito/API Gateway reale;
- concorrenza DynamoDB distribuita;
- IAM denial in AWS;
- test browser CloudFront;
- WCAG manuale;
- penetration test;
- restore drill.

## Risultato

I sei blocchi di Core Correctness sono source-complete. La release resta pre-produzione e non autorizza clienti o dati reali. La prossima milestone è `0.8.7 / Sprint 4.5F`, mentre le prove AWS accumulate restano obbligatorie prima del pilot.
