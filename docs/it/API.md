# Documentazione API

Riferimento REST API di AI Pavilion.

## URL Base

```
https://your-api-id.execute-api.us-east-1.amazonaws.com/prod
```

## Autenticazione

La maggior parte degli endpoint richiede autenticazione via token JWT nell'header:

```
Authorization: Bearer <token>
```

## Endpoint

### Stand

#### GET /stands
Elenca tutti gli stand espositivi.

**Risposta:**
```json
[
  {
    "stand_id": "stand_001",
    "name": "Epic Games Booth",
    "booth_number": "42",
    "category": "action",
    "description": "...",
    "image_url": "https://...",
    "is_sponsored": true,
    "ar_enabled": true,
    "rating": 4.5
  }
]
```

#### GET /stands/{id}
Ottieni dettagli stand.

### Prodotti

#### GET /products
Elenca tutti i prodotti.

#### GET /products/{id}
Ottieni dettagli prodotto.

### Checkout

#### POST /checkout/create-session
Crea sessione checkout Stripe.

**Richiesta:**
```json
{
  "items": [
    {
      "product_id": "prod_001",
      "quantity": 1
    }
  ]
}
```

### Analytics

#### GET /analytics/overview
Analytics piattaforma (solo admin).

#### GET /analytics/stand/{id}
Analytics specifiche stand.

## Risposte Errore

Tutti gli errori seguono questo formato:

```json
{
  "error": "Messaggio errore qui"
}
```

Codici HTTP:
- 200: Successo
- 400: Richiesta Non Valida
- 401: Non Autorizzato
- 404: Non Trovato
- 500: Errore Server
