# 📦 Guida Installazione - AI Pavilion

Guida completa all'installazione in italiano.

## Prerequisiti

- Account AWS con CLI configurata
- Node.js 18+ e npm
- Account Stripe (chiavi test)
- Conoscenza base di AWS

## Installazione Rapida (10 minuti)

### 1. Clona Repository
```bash
git clone https://github.com/yourusername/ai-pavilion.git
cd ai-pavilion
```

### 2. Configura AWS
```bash
# Configura AWS CLI
aws configure
# Inserisci: Access Key, Secret Key, Regione (us-east-1), Output (json)

# Verifica
aws sts get-caller-identity
```

### 3. Configura Stripe
```bash
# Ottieni chiavi test da: https://dashboard.stripe.com/test/apikeys
export STRIPE_SECRET_KEY='sk_test_tua_chiave_qui'
export STRIPE_PUBLISHABLE_KEY='pk_test_tua_chiave_qui'
```

### 4. Deploya Infrastruttura
```bash
cd backend/scripts
chmod +x deploy-all.sh
./deploy-all.sh
```

Lo script:
- ✅ Crea Cognito User Pool
- ✅ Configura integrazione Stripe
- ✅ Deploya funzioni Lambda
- ✅ Crea tabelle DynamoDB
- ✅ Configura CloudFront CDN
- ✅ Carica frontend su S3
- ✅ Abilita funzionalità AR e 360°

### 5. Accedi alla Tua Piattaforma
```bash
# L'URL verrà mostrato al termine del deployment
# Esempio: https://d123xyz.cloudfront.net
```

## Deployment Passo-Passo

Per maggiore controllo, esegui gli script singolarmente:

```bash
cd backend/scripts

# 1. Autenticazione (Cognito)
./01-deploy-auth.sh

# 2. Pagamenti (Stripe)
./02-deploy-payments.sh

# 3. Catalogo Prodotti
./03-deploy-products.sh

# 4. HTTPS & CDN
./04-deploy-https.sh

# 5. Funzionalità AR
./05-deploy-ar.sh

# 6. Tour 360°
./06-deploy-360.sh

# 7. Miglioramenti UI
./07-deploy-ui.sh

# 8. Analytics
./08-deploy-analytics.sh

# 9. Funzionalità Avanzate
./09-deploy-features.sh
```

## Verifica

Testa il deployment:

```bash
# 1. Apri URL piattaforma
# 2. Login con utente test:
#    Email: test@aipavilion.demo
#    Password: TestPass123!
# 3. Esplora gli stand
# 4. Testa AR su dispositivo mobile
# 5. Prova tour 360°
# 6. Controlla dashboard analytics
```

## Risoluzione Problemi

Vedi [RISOLUZIONE-PROBLEMI.md](./RISOLUZIONE-PROBLEMI.md) per problemi comuni.

## Stima Costi

Circa **$18-25/mese** per servizi AWS.
Stripe addebita 2.9% + $0.30 per transazione.

## Prossimi Passi

- [Guida Configurazione](./CONFIGURAZIONE.md)
- [Documentazione API](./API.md)
- [Guida Personalizzazione](./PERSONALIZZAZIONE.md)
