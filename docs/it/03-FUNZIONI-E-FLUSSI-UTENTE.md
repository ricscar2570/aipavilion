# Funzioni e flussi utente

## Organizzatore

1. Accede con Cognito.
2. Seleziona una membership attiva.
3. Completa l’onboarding dell’organizzazione.
4. Crea un evento nel rispetto dell’entitlement.
5. Invita gli espositori.
6. Controlla consegna, bounce o complaint.
7. Modera gli stand sottoposti.
8. Pubblica l’evento e sincronizza gli stand approvati.
9. Consulta lead, audit e billing.
10. Archivia l’evento con una saga recuperabile.

## Espositore

1. Riceve e accetta l’invito con la stessa email.
2. Ottiene membership e stand assegnato.
3. Modifica contenuti e prodotti.
4. Decide se esporre email, telefono e sito.
5. Invia lo stand in revisione.
6. Consulta ed esporta i lead del proprio stand.
7. Può liberare l’account dopo la riassegnazione degli stand.

## Visitatore

1. Consulta eventi pubblici.
2. Esplora stand approvati.
3. Cerca testo in stand e prodotti visibili.
4. Salva preferiti se autenticato.
5. Invia un lead protetto.
6. Gestisce account, export e cancellazione.

## Amministratore

L’amministratore opera fuori dal tenant normale e può vedere dashboard, utenti, stand, ordini e analytics globali.

## Stati principali

### Evento

`draft → published → archiving → archived`

### Stand

`draft → submitted → approved/rejected → published`

La visibilità pubblica richiede anche evento pubblicato e chiave di indicizzazione coerente.

### Invito

`pending → accepted | revoked | expired` con stato di consegna separato.

### Ordine prodotto

`creating → pending → paid | failed | cancelled`, con riconciliazione.

### Entitlement SaaS

Stati derivati da Stripe e protetti da watermark temporale.
