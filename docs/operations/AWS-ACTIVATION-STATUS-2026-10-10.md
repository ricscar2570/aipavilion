# Attivazione AWS — verifica del 10 ottobre 2026

## Punto di partenza verificato

Il codice applicativo è consolidato sul commit `2490032fe08761105eab8d010d440834d738076b`.
La [CI 38025002655](https://github.com/ricscar2570/aipavilion/actions/runs/38025002655) è PASS per qualità e SAM, incluso lo smoke browser desktop/mobile. Questo checkpoint aggiorna solo la diagnosi operativa; non costituisce una prova di deployment.

## Blocco osservato

La più recente esecuzione di staging individuata nell'elenco delle esecuzioni consultato è [Staging synthetic check 37810113032](https://github.com/ricscar2570/aipavilion/actions/runs/37810113032), dell'8 ottobre 2026. Il job `check` si interrompe in `aws-actions/configure-aws-credentials@v4` con:

```text
Credentials could not be loaded, please check your action inputs: Could not load credentials from any providers
```

Installazione delle dipendenze, lettura degli stack e test pubblici risultano SKIPPED. Non è quindi un errore restituito dall'applicazione. Il workflow richiede `AWS_READ_ROLE_ARN` nell'ambiente GitHub `staging`; non è stato possibile leggere l'inventario attuale dei segreti o verificare il ruolo IAM. Il log storico non dimostra da solo la configurazione attuale dell'account AWS.

L'ambiente di lavoro corrente non dispone di profilo AWS, credenziali, identità OIDC, CLI AWS/SAM, URL API o URL applicazione. La ricerca dei collegamenti disponibili non ha individuato una capacità adatta a gestire questo deployment CloudFormation/Lambda. Il collegamento GitHub consente aggiornamenti del repository e lettura della CI, ma non espone gestione degli environment/segreti o avvio manuale dei workflow.

## Configurazioni da verificare nell'account

| Ambiente GitHub  | Segreto               | Workflow             | Scopo                                                   |
| ---------------- | --------------------- | -------------------- | ------------------------------------------------------- |
| `internal-pilot` | `AWS_OIDC_ROLE_ARN`   | `internal-pilot.yml` | Deployment controllato e raccolta delle prove del pilot |
| `staging`        | `AWS_DEPLOY_ROLE_ARN` | `staging.yml`        | Deployment dello staging                                |
| `staging`        | `AWS_READ_ROLE_ARN`   | `synthetic.yml`      | Verifica degli stack e del sito distribuito             |

Questi sono i nomi richiesti dal codice, non attestazioni che i ruoli esistano. Verificare account, policy e trust OIDC dei ruoli per il repository `ricscar2570/aipavilion` e per il rispettivo environment. Conservare i valori sensibili nei segreti protetti GitHub.

## Ripresa concreta

1. Accedere alle [impostazioni degli environment](https://github.com/ricscar2570/aipavilion/settings/environments) e all'account AWS scelto per lo staging; verificare i tre riferimenti di ruolo senza ampliare indiscriminatamente i permessi.
2. Verificare regione, mittente SES, email operativa, Turnstile, Stripe test mode/prezzi e fixture di prova secondo il [runbook](INTERNAL-PILOT-RUNBOOK.md).
3. Eseguire il workflow [Internal pilot evidence](https://github.com/ricscar2570/aipavilion/actions/workflows/internal-pilot.yml) sul commit da promuovere, ambiente `internal-pilot`, deployment stage `staging`.
4. Conservare le evidenze dello stesso commit e raccogliere le sei approvazioni previste. Nessuna approvazione manuale o prova distribuita va sostituita con un test locale.

Deployment AWS, invio email e prove sui servizi esterni non sono stati eseguiti durante questa verifica. Il prossimo passo richiede accesso operativo all'account e alle impostazioni GitHub; non richiede di riscrivere l'app.
