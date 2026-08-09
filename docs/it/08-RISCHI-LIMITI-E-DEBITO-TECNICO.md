# Rischi, limiti e debito tecnico

| Priorità | Rischio | Impatto | Mitigazione |
| --- | --- | --- | --- |
| P0 | Prova esterna mancante | La release non è stata reinstallata e distribuita nello stesso ambiente di preparazione per limiti di registry/AWS. | Eseguire CI pubblica, SAM build e staging con evidenze conservate. |
| P0 | Nessun pilot con clienti | Non esiste ancora prova di onboarding e utilizzo da parte di un organizzatore reale. | Pilot interno sintetico, poi un cliente controllato. |
| P1 | Webhook e riconciliazione non provati su Stripe reale | La logica è presente, ma timeout, ritardi e ordine degli eventi devono essere osservati. | Stripe test mode, eventi ritardati, retry e riconciliazione pianificata. |
| P1 | Accessibilità non certificata | Le fondamenta sono presenti ma non sostituiscono test manuali. | WCAG 2.2 AA, NVDA/VoiceOver, zoom, reflow e tastiera. |
| P1 | Ripristino non misurato | Backup e script non dimostrano da soli un restore efficace. | Restore drill con tempi, completezza e approvazione. |
| P1 | Ricerca limitata alla scala pilot | La scansione paginata del GSI è corretta ma non è un motore full-text scalabile. | Misurare volume; introdurre indice dedicato solo se necessario. |
| P1 | Moduli monolitici | Alcune Lambda e file frontend restano grandi e combinano più responsabilità. | Refactoring in controller, servizi di dominio e repository dati. |
| P2 | Marketplace non completato | Checkout prodotti non equivale a un mercato multi-vendor. | Mantenere disabilitato o avviare progetto Stripe Connect separato. |
| P2 | Nome AI non sostenuto da una funzione AI | La piattaforma non possiede una capacità AI centrale. | Definire un caso d’uso misurabile dopo il pilot. |
| P2 | Toolchain da modernizzare | ESLint 8/Jest 29 e alcune dipendenze di sviluppo generano debito. | Upgrade controllato dopo la stabilizzazione 1.0. |

## Debito strutturale

- file backend e frontend monolitici;
- prodotti incorporati negli stand;
- ricerca limitata alla scala pilot;
- coverage frontend parziale;
- toolchain da modernizzare;
- assenza di prova AWS completa;
- visione AI/immersiva non ancora implementata.

## Regola di sviluppo

Non aggiungere AR, 360°, marketplace o funzioni AI prima della chiusura dei gate 4.5F–4.5G.
