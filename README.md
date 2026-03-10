# AI Pavilion

Virtual gaming expo platform. Exhibitors get a branded stand with product listings, AR model support, and 360° tour embedding. Visitors browse, add to cart, and pay via Stripe.

Built on AWS serverless: Lambda + DynamoDB + Cognito + S3/CloudFront.

---

## What's included

**Backend (Lambda)**
- Auth — Cognito signup/signin with email verification
- Checkout — Stripe PaymentIntent flow with server-side total validation and webhook handling
- Stands — CRUD for stand listings with full DynamoDB pagination
- Products — product catalogue per stand
- Admin — JWT-verified admin API (requires Cognito group `admin`)
- Interaction tracking

**Frontend**
- Stand grid with search
- Stand detail page with product listings, AR viewer (model-viewer), 360° tours (Pannellum)
- Cart and Stripe Elements checkout
- User dashboard (orders, saved stands)
- Hash-based routing, no framework dependency

---

## Requirements

- AWS account with CLI configured (`aws configure`)
- Node.js 18+
- Stripe account (test keys to start)

---

## Setup

```bash
cd platform
npm install

# Copy and fill in your keys
cp .env.example .env
cp backend/config/config.env.example backend/config/config.env

# Validate config before deploying
npm run validate-config

# Deploy
./master-deploy.sh
```

See `platform/QUICKSTART.md` for a step-by-step walkthrough.

---

## Architecture

```
CloudFront → S3 (frontend bundle)
          → API Gateway → Lambda functions → DynamoDB
                        → Cognito (auth)
                        → Stripe (payments via Secrets Manager)
```

---

## Status

Working MVP. Requires an AWS account and real keys to run end-to-end. Not yet battle-tested in production — expect to spend time on IAM policies, API Gateway configuration, and Stripe webhook registration before going live.

---

## License

MIT
