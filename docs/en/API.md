# API Documentation

AI Pavilion REST API reference.

## Base URL

```
https://your-api-id.execute-api.us-east-1.amazonaws.com/prod
```

## Authentication

Most endpoints require authentication via JWT token in header:

```
Authorization: Bearer <token>
```

## Endpoints

### Stands

#### GET /stands
List all exhibitor stands.

**Response:**
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
Get stand details.

**Response:**
```json
{
  "stand_id": "stand_001",
  "name": "Epic Games Booth",
  "products": [...],
  "ar_model_url": "https://...",
  "tour_scenes": [...]
}
```

### Products

#### GET /products
List all products.

#### GET /products/{id}
Get product details.

### Checkout

#### POST /checkout/create-session
Create Stripe checkout session.

**Request:**
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

**Response:**
```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/..."
}
```

### Analytics

#### GET /analytics/overview
Platform-wide analytics (admin only).

#### GET /analytics/stand/{id}
Stand-specific analytics.

**Response:**
```json
{
  "views": 1234,
  "products": 12,
  "revenue": 4567.89,
  "conversionRate": "3.2%"
}
```

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message here"
}
```

HTTP Status Codes:
- 200: Success
- 400: Bad Request
- 401: Unauthorized
- 404: Not Found
- 500: Server Error
