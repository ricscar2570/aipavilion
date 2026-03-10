# 📦 Installation Guide - AI Pavilion

Complete installation guide in English.

## Prerequisites

- AWS Account with CLI configured
- Node.js 18+ and npm  
- Stripe account (test keys)
- Basic AWS knowledge

## Quick Installation (10 minutes)

### 1. Clone Repository
```bash
git clone https://github.com/yourusername/ai-pavilion.git
cd ai-pavilion
```

### 2. AWS Setup
```bash
# Configure AWS CLI
aws configure
# Enter: Access Key, Secret Key, Region (us-east-1), Output (json)

# Verify
aws sts get-caller-identity
```

### 3. Stripe Setup
```bash
# Get test keys from: https://dashboard.stripe.com/test/apikeys
export STRIPE_SECRET_KEY='sk_test_your_key_here'
export STRIPE_PUBLISHABLE_KEY='pk_test_your_key_here'
```

### 4. Deploy Infrastructure
```bash
cd backend/scripts
chmod +x deploy-all.sh
./deploy-all.sh
```

The script will:
- ✅ Create Cognito User Pool  
- ✅ Setup Stripe integration
- ✅ Deploy Lambda functions
- ✅ Create DynamoDB tables
- ✅ Configure CloudFront CDN
- ✅ Upload frontend to S3
- ✅ Enable AR & 360° features

### 5. Access Your Platform
```bash
# URL will be displayed at end of deployment
# Example: https://d123xyz.cloudfront.net
```

## Step-by-Step Deployment

For more control, run scripts individually:

```bash
cd backend/scripts

# 1. Authentication (Cognito)
./01-deploy-auth.sh

# 2. Payments (Stripe)  
./02-deploy-payments.sh

# 3. Products Catalog
./03-deploy-products.sh

# 4. HTTPS & CDN
./04-deploy-https.sh

# 5. AR Features
./05-deploy-ar.sh

# 6. 360° Tours
./06-deploy-360.sh

# 7. UI Enhancements
./07-deploy-ui.sh

# 8. Analytics
./08-deploy-analytics.sh

# 9. Advanced Features
./09-deploy-features.sh
```

## Verification

Test your deployment:

```bash
# 1. Open platform URL
# 2. Login with test user:
#    Email: test@aipavilion.demo
#    Password: TestPass123!
# 3. Browse stands
# 4. Test AR on mobile device
# 5. Try 360° tour
# 6. Check analytics dashboard
```

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues.

## Cost Estimate

Approximately **$18-25/month** for AWS services.
Stripe charges 2.9% + $0.30 per transaction.

## Next Steps

- [Configuration Guide](./CONFIGURATION.md)
- [API Documentation](./API.md)
- [Customization Guide](./CUSTOMIZATION.md)
