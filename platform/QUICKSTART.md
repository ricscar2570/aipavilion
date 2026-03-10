# 🚀 Quick Start - AI Pavilion

Get your virtual gaming expo running in **10 minutes**!

## Prerequisites

- ✅ AWS Account ([Sign up](https://aws.amazon.com/))
- ✅ AWS CLI installed and configured
- ✅ Node.js 18+ installed
- ✅ Stripe account ([Get test keys](https://dashboard.stripe.com/test/apikeys))

## Installation

### 1️⃣ Clone & Navigate
```bash
git clone https://github.com/yourusername/ai-pavilion.git
cd ai-pavilion
```

### 2️⃣ Configure AWS
```bash
aws configure
# Enter your AWS credentials
```

### 3️⃣ Set Stripe Keys
```bash
export STRIPE_SECRET_KEY='sk_test_YOUR_KEY'
export STRIPE_PUBLISHABLE_KEY='pk_test_YOUR_KEY'
```

### 4️⃣ Deploy Everything
```bash
cd backend/scripts
chmod +x deploy-all.sh
./deploy-all.sh
```

⏱️ **Deployment takes ~5-10 minutes**

### 5️⃣ Access Your Platform
```bash
# URL will be displayed at end of deployment
# Example: https://d123abc.cloudfront.net
```

## First Login

```
Email: test@aipavilion.demo
Password: TestPass123!
```

## What's Deployed?

✅ **Authentication** - Cognito User Pool  
✅ **Payments** - Stripe integration  
✅ **Database** - DynamoDB tables  
✅ **API** - Lambda + API Gateway  
✅ **Frontend** - S3 + CloudFront  
✅ **AR/360°** - Model storage  

## Next Steps

- 📖 Read [Full Documentation](./docs/en/README.md)
- 🎨 Customize [Configuration](./docs/en/CONFIGURATION.md)
- 🚀 Deploy to production
- 🌐 Add custom domain

## Support

- 📧 Email: support@aipavilion.example
- 💬 [Discord Community](https://discord.gg/aipavilion)
- 📝 [GitHub Issues](https://github.com/yourusername/ai-pavilion/issues)

---

**Ready to build your virtual expo!** 🎮✨
