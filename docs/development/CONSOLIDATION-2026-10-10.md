# Consolidamento AI Pavilion — 10 ottobre 2026

Architettura AWS confermata. Release applicativa `0.9.0-internal-pilot.1`.
Baseline: `a22acbda9c77e3eca52ab361eeab9c50cb24dc61`.
Stato: consolidamento sorgente verificato; pilot e produzione ancora subordinati alle evidenze distribuite e alle approvazioni previste.

## Correzioni

- Verifica di membership, ruolo e appartenenza dell'evento prima di riservare capacità o restituire una risposta idempotente.
- Una richiesta duplicata in corso non richiama il writer. Il replay appartiene anche all'identità che ha iniziato la richiesta e mantiene gli header CORS.
- Dopo il successo del writer, un errore nel collegamento alla quota conserva la prenotazione per il recupero, anziché liberare capacità già occupata.
- Scadenze degli inviti normalizzate da ISO o epoch; inviti scaduti esclusi dal conteggio senza confondere l'indice dell'array con l'orario corrente.
- Riconciliazione: rilascio delle scadenze prima dello snapshot, rinvio dei contatori con writer in corso, letture consistenti dalle tabelle e controllo della revisione per impedire sovrascritture concorrenti.
- Jest 30 e Tailwind 4; migrazione PostCSS, utilità CSS e compatibilità della cascata. Directory degli asset pubblici Vite corretta, incluso il placeholder degli stand.
- Override limitato a `@istanbuljs/load-nyc-config -> js-yaml ^4.3.0`: elimina la catena vulnerabile `argparse 1 -> sprintf-js`. Verificato il caricamento YAML tramite l'API effettivamente usata, oltre alla suite completa con coverage.
- Avvio frontend corretto: alias `globalThis` per la dipendenza Cognito e configurazione dei timer UI ripristinata. Titolo hero reso leggibile sullo sfondo. Smoke test del bundle reale aggiunto alla CI.
- CI estesa a `verify:source` e alla verifica dei manifest. Build SAM del pilot con base del repository e `esbuild` locale. Le suite sorgente/SAM non richiedono credenziali AWS; deploy e prove online mantengono il preflight.
- Manifest: metadati ricavati da `PROJECT-STATUS.json`; directory generate `.aws-sam-*` escluse.

## Verifiche locali

| Controllo                          | Risultato                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run verify`                   | PASS: formattazione, lint, sintassi, contratti, bundle, test e build                                 |
| Jest                               | 332 test passati; 7 test DynamoDB distribuiti saltati perché manca l'ambiente AWS                    |
| Coverage                           | Statement 77,17%; branch 65,12%; funzioni 79,90%; righe 77,22%                                       |
| Soglie mantenute                   | Statement/righe 75%; branch 65%; funzioni 70%                                                        |
| `npm run verify:source`            | PASS, inclusi gate AUTH, LEGACY, quote, runtime, template pilot e promozione                         |
| Test Node foundations / promozione | 16 + 7 passati; ulteriori controlli del comando sorgente passati                                     |
| `npm audit`                        | 0 vulnerabilità segnalate al 10 ottobre 2026                                                         |
| `npm run test:frontend`            | PASS in Chromium: avvio desktop/mobile, CSS, login, ricerca e asset pubblico; richieste API simulate |
| Build Vite                         | PASS; asset statici inclusi                                                                          |
| Preflight AWS                      | PENDING: CLI AWS/SAM, identità e URL staging non disponibili localmente                              |

Questi test usano mock o contratti locali dove previsto: non dimostrano il comportamento distribuito di DynamoDB, Cognito o altri servizi reali. La CI GitHub verifica il commit pubblicato, inclusi entrambi i template SAM. I risultati associati al commit sono la fonte per lo stato della CI; questo documento non sostituisce una ricevuta di promozione legata a commit, ambiente e data.

## Browser

Lo smoke locale esercita il bundle compilato su viewport 1365×900 e 390×844, senza errori JavaScript né overflow orizzontale. Non esegue il login Cognito reale.

Tailwind 4 richiede almeno Safari 16.4, Chrome 111 o Firefox 128. I controlli browser sullo staging e l'audit manuale WCAG restano necessari.

## Chiusura operativa ancora necessaria

1. Configurare l'ambiente GitHub protetto `internal-pilot`: ruolo OIDC AWS, regione, stack e configurazione dei servizi descritti nel runbook.
2. Eseguire deployment controllato e suite Cognito, API, tenant isolation, concorrenza/failure injection, browser/CSP, Stripe test mode, SES, WAF, carico/costi e restore con RPO/RTO misurati.
3. Raccogliere le approvazioni indipendenti richieste dal piano, incluse sicurezza, accessibilità e privacy/legale, e valutare la promozione sullo stesso commit.

Non sono stati creati stack, inviate email, effettuati pagamenti o autorizzati dati clienti durante questo consolidamento. AR, showroom 360°, raccomandazioni AI di produzione, streaming e marketplace multi-vendor restano esplicitamente fuori dal pilot corrente.

Riferimenti: [runbook pilot](../operations/INTERNAL-PILOT-RUNBOOK.md), [piano dei gate](../../config/internal-pilot-plan.json), [stato machine-readable](../../PROJECT-STATUS.json).
