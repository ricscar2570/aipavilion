#!/bin/bash

################################################################################
# AI PAVILION - MASTER DEPLOYMENT SCRIPT
# One-click deployment of complete platform
# Production-ready with comprehensive error handling
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logo
clear
echo -e "${PURPLE}"
cat << "EOF"
    ___    ____   ____             _ ___          
   /   |  /  _/  / __ \____ __   __(_) (_)___  ____ 
  / /| |  / /   / /_/ / __ `/ | / / / / / __ \/ __ \
 / ___ |_/ /   / ____/ /_/ /| |/ / / / / /_/ / / / /
/_/  |_/___/  /_/    \__,_/ |___/_/_/_/\____/_/ /_/ 
                                                     
    MASTER DEPLOYMENT SCRIPT v3.0
    Complete Platform Setup - Production Ready
EOF
echo -e "${NC}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${CYAN}🚀 AI PAVILION - COMPLETE DEPLOYMENT${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

################################################################################
# Step 0: Pre-flight Checks
################################################################################

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📋 Step 0: Pre-flight Checks${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found${NC}"
    echo "Install: https://aws.amazon.com/cli/"
    exit 1
fi
echo -e "${GREEN}✅ AWS CLI found${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    echo "Install: https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version must be 18 or higher (found: $(node -v))${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v) found${NC}"

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    echo "Run: aws configure"
    exit 1
fi
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)
if [ -z "$AWS_REGION" ]; then
    AWS_REGION="us-east-1"
    echo -e "${YELLOW}⚠️  No region configured, using us-east-1${NC}"
fi
echo -e "${GREEN}✅ AWS Account: $AWS_ACCOUNT_ID${NC}"
echo -e "${GREEN}✅ AWS Region: $AWS_REGION${NC}"

# Check Stripe keys
if [ -z "$STRIPE_SECRET_KEY" ] || [ -z "$STRIPE_PUBLISHABLE_KEY" ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Stripe API keys not found in environment${NC}"
    echo ""
    read -p "Enter Stripe Secret Key (sk_test_...): " STRIPE_SECRET_KEY
    read -p "Enter Stripe Publishable Key (pk_test_...): " STRIPE_PUBLISHABLE_KEY
    export STRIPE_SECRET_KEY
    export STRIPE_PUBLISHABLE_KEY
fi
echo -e "${GREEN}✅ Stripe keys configured${NC}"

echo ""
sleep 2

################################################################################
# Step 1: Deployment Mode Selection
################################################################################

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🎯 Step 1: Deployment Mode${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "Choose deployment mode:"
echo ""
echo "1. 🚀 QUICK START (Recommended)"
echo "   Complete platform with demo data"
echo "   Time: ~15 minutes"
echo ""
echo "2. 🎯 PRODUCTION"
echo "   Complete platform without demo data"
echo "   Time: ~15 minutes"
echo ""
echo "3. 🧪 DEMO ONLY"
echo "   Just demo environment for testing"
echo "   Time: ~10 minutes"
echo ""
echo "4. 📦 CUSTOM"
echo "   Select specific components"
echo "   Time: Varies"
echo ""

read -p "Enter choice (1-4): " DEPLOY_MODE

case $DEPLOY_MODE in
    1)
        echo -e "${GREEN}Selected: Quick Start${NC}"
        DEMO_DATA=true
        FULL_DEPLOY=true
        ;;
    2)
        echo -e "${GREEN}Selected: Production${NC}"
        DEMO_DATA=false
        FULL_DEPLOY=true
        ;;
    3)
        echo -e "${GREEN}Selected: Demo Only${NC}"
        DEMO_DATA=true
        FULL_DEPLOY=false
        ;;
    4)
        echo -e "${GREEN}Selected: Custom${NC}"
        echo ""
        read -p "Deploy backend? (y/n): " DEPLOY_BACKEND
        read -p "Deploy frontend? (y/n): " DEPLOY_FRONTEND
        read -p "Deploy admin dashboard? (y/n): " DEPLOY_ADMIN
        read -p "Include demo data? (y/n): " DEMO_DATA
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
sleep 1

################################################################################
# Step 2: Configuration Summary
################################################################################

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📝 Step 2: Configuration Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "Deployment Configuration:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "AWS Account:    $AWS_ACCOUNT_ID"
echo "AWS Region:     $AWS_REGION"
echo "Demo Data:      $DEMO_DATA"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -p "Proceed with deployment? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "Deployment cancelled"
    exit 0
fi

echo ""

################################################################################
# Step 3: Backend Deployment
################################################################################

if [ "$FULL_DEPLOY" = true ] || [ "$DEPLOY_BACKEND" = "y" ]; then
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}🔧 Step 3: Backend Deployment${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    cd backend/scripts
    
    echo "Running backend deployment scripts..."
    
    # Core services
    ./01-deploy-auth.sh
    ./02-deploy-payments.sh
    ./03-deploy-products.sh
    ./04-deploy-https.sh
    
    # Features
    ./05-deploy-ar.sh
    ./06-deploy-360.sh
    ./07-deploy-ui.sh
    ./08-deploy-analytics.sh
    ./09-deploy-features.sh
    
    # Admin dashboard (Week 3)
    if [ "$DEPLOY_ADMIN" = "y" ] || [ "$FULL_DEPLOY" = true ]; then
        ./12-deploy-admin-dashboard.sh
    fi
    
    cd ../..
    
    echo -e "${GREEN}✅ Backend deployment complete${NC}"
    echo ""
fi

################################################################################
# Step 4: Frontend Deployment
################################################################################

if [ "$FULL_DEPLOY" = true ] || [ "$DEPLOY_FRONTEND" = "y" ]; then
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}🎨 Step 4: Frontend Deployment${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Find S3 bucket
    BUCKET_NAME=$(aws s3api list-buckets --query "Buckets[?contains(Name, 'ai-pavilion-frontend')].Name" --output text | head -1)
    
    if [ -z "$BUCKET_NAME" ]; then
        echo "Creating S3 bucket..."
        BUCKET_NAME="ai-pavilion-frontend-$AWS_ACCOUNT_ID"
        aws s3 mb s3://$BUCKET_NAME --region $AWS_REGION
    fi
    
    echo "Uploading frontend files to S3..."
    aws s3 sync frontend/ s3://$BUCKET_NAME/ \
        --exclude "*.md" \
        --exclude ".git/*" \
        --cache-control "max-age=31536000" \
        --metadata-directive REPLACE
    
    # Upload HTML with no-cache
    aws s3 cp frontend/index.html s3://$BUCKET_NAME/index.html \
        --cache-control "no-cache" \
        --content-type "text/html"
    
    echo -e "${GREEN}✅ Frontend uploaded to: $BUCKET_NAME${NC}"
    echo ""
fi

################################################################################
# Step 5: Demo Data Population
################################################################################

if [ "$DEMO_DATA" = true ]; then
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}🎮 Step 5: Demo Data Population${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    TABLE_NAME="ai-pavilion-stands"
    
    echo "Creating 10 demo stands..."
    
    # Stand 1: Epic Games Showcase
    aws dynamodb put-item \
        --table-name $TABLE_NAME \
        --item '{
            "stand_id": {"S": "demo_epic_001"},
            "name": {"S": "Epic Games Showcase"},
            "booth_number": {"S": "A1"},
            "category": {"S": "action"},
            "description": {"S": "Latest AAA titles from Epic Games"},
            "image_url": {"S": "https://picsum.photos/400/300?random=1"},
            "is_sponsored": {"BOOL": true},
            "ar_enabled": {"BOOL": true},
            "tour_enabled": {"BOOL": true},
            "rating": {"N": "4.8"},
            "views": {"N": "1250"},
            "status": {"S": "approved"}
        }' > /dev/null
    
    echo "1/10 ✓ Epic Games Showcase"
    
    # Stand 2: Indie Corner
    aws dynamodb put-item \
        --table-name $TABLE_NAME \
        --item '{
            "stand_id": {"S": "demo_indie_002"},
            "name": {"S": "Indie Corner"},
            "booth_number": {"S": "B5"},
            "category": {"S": "indie"},
            "description": {"S": "Discover amazing indie games"},
            "image_url": {"S": "https://picsum.photos/400/300?random=2"},
            "ar_enabled": {"BOOL": true},
            "rating": {"N": "4.5"},
            "views": {"N": "890"},
            "status": {"S": "approved"}
        }' > /dev/null
    
    echo "2/10 ✓ Indie Corner"
    
    # Stand 3: Retro Gaming Museum
    aws dynamodb put-item \
        --table-name $TABLE_NAME \
        --item '{
            "stand_id": {"S": "demo_retro_003"},
            "name": {"S": "Retro Gaming Museum"},
            "booth_number": {"S": "C2"},
            "category": {"S": "retro"},
            "description": {"S": "Classic games and collectibles"},
            "image_url": {"S": "https://picsum.photos/400/300?random=3"},
            "tour_enabled": {"BOOL": true},
            "rating": {"N": "4.9"},
            "views": {"N": "1540"},
            "status": {"S": "approved"}
        }' > /dev/null
    
    echo "3/10 ✓ Retro Gaming Museum"
    
    # Stand 4: VR Experience Zone
    aws dynamodb put-item \
        --table-name $TABLE_NAME \
        --item '{
            "stand_id": {"S": "demo_vr_004"},
            "name": {"S": "VR Experience Zone"},
            "booth_number": {"S": "D7"},
            "category": {"S": "vr"},
            "description": {"S": "Immersive VR gaming experiences"},
            "image_url": {"S": "https://picsum.photos/400/300?random=4"},
            "ar_enabled": {"BOOL": true},
            "rating": {"N": "4.7"},
            "views": {"N": "2100"},
            "status": {"S": "approved"}
        }' > /dev/null
    
    echo "4/10 ✓ VR Experience Zone"
    
    # Stand 5: Merchandise Store
    aws dynamodb put-item \
        --table-name $TABLE_NAME \
        --item '{
            "stand_id": {"S": "demo_merch_005"},
            "name": {"S": "Gaming Merchandise Store"},
            "booth_number": {"S": "E3"},
            "category": {"S": "merchandise"},
            "description": {"S": "Official gaming merchandise and collectibles"},
            "image_url": {"S": "https://picsum.photos/400/300?random=5"},
            "ar_enabled": {"BOOL": true},
            "rating": {"N": "4.6"},
            "views": {"N": "1780"},
            "status": {"S": "approved"}
        }' > /dev/null
    
    echo "5/10 ✓ Merchandise Store"
    
    # Remaining stands (abbreviated for brevity)
    for i in {6..10}; do
        aws dynamodb put-item \
            --table-name $TABLE_NAME \
            --item "{
                \"stand_id\": {\"S\": \"demo_stand_00$i\"},
                \"name\": {\"S\": \"Demo Stand $i\"},
                \"booth_number\": {\"S\": \"Z$i\"},
                \"category\": {\"S\": \"other\"},
                \"description\": {\"S\": \"Demo stand for testing\"},
                \"image_url\": {\"S\": \"https://picsum.photos/400/300?random=$i\"},
                \"rating\": {\"N\": \"4.5\"},
                \"views\": {\"N\": \"500\"},
                \"status\": {\"S\": \"approved\"}
            }" > /dev/null
        echo "$i/10 ✓ Demo Stand $i"
    done
    
    echo ""
    echo -e "${GREEN}✅ Demo data populated${NC}"
    echo ""
fi

################################################################################
# Step 6: Post-Deployment Configuration
################################################################################

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}⚙️  Step 6: Post-Deployment Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get API Gateway URL
API_ID=$(aws apigateway get-rest-apis --query "items[?name=='ai-pavilion-api'].id" --output text)
API_URL="https://$API_ID.execute-api.$AWS_REGION.amazonaws.com/prod"

# Get CloudFront URL
DISTRIBUTION_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='AI Pavilion CDN'].Id" --output text)
if [ -n "$DISTRIBUTION_ID" ]; then
    CLOUDFRONT_URL=$(aws cloudfront get-distribution --id $DISTRIBUTION_ID --query "Distribution.DomainName" --output text)
    FRONTEND_URL="https://$CLOUDFRONT_URL"
else
    # Fallback to S3 website
    FRONTEND_URL="http://$BUCKET_NAME.s3-website-$AWS_REGION.amazonaws.com"
fi

echo "Creating configuration summary..."

cat > deployment-summary.txt << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI PAVILION - DEPLOYMENT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Date: $(date)
AWS Account: $AWS_ACCOUNT_ID
AWS Region: $AWS_REGION

PLATFORM URLS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Frontend:  $FRONTEND_URL
API:       $API_URL
Admin:     $FRONTEND_URL/admin

CREDENTIALS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Admin Email:    admin@aipavilion.demo
Admin Password: AdminDemo2026!

Test Email:     customer@aipavilion.demo
Test Password:  TestPass123!

STRIPE TEST CARD:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Number: 4242 4242 4242 4242
Exp:    12/28
CVC:    123

AWS RESOURCES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
API Gateway:     $API_ID
S3 Bucket:       $BUCKET_NAME
DynamoDB Table:  ai-pavilion-stands
CloudFront:      ${DISTRIBUTION_ID:-Not configured}

NEXT STEPS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Visit frontend URL
2. Test demo stands
3. Login to admin panel
4. Configure domain (optional)
5. Start marketing!

ESTIMATED COSTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Monthly: ~\$20-50 USD (usage-based)
- Lambda: ~\$5
- DynamoDB: ~\$5
- S3: ~\$1
- CloudFront: ~\$5-10
- API Gateway: ~\$3-5

SUPPORT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Documentation: See README.md
Issues: GitHub Issues
Email: support@aipavilion.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF

echo -e "${GREEN}✅ Configuration complete${NC}"
echo ""

################################################################################
# Final Summary
################################################################################

echo -e "${PURPLE}"
cat << "EOF"
╔══════════════════════════════════════════════════════╗
║                                                      ║
║         🎉  DEPLOYMENT SUCCESSFUL! 🎉               ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

cat deployment-summary.txt

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ AI Pavilion is now LIVE!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}Visit your platform: $FRONTEND_URL${NC}"
echo ""
echo -e "${YELLOW}⭐ Summary saved to: deployment-summary.txt${NC}"
echo ""

# Open browser (optional)
read -p "Open platform in browser? (y/n): " OPEN_BROWSER
if [ "$OPEN_BROWSER" = "y" ]; then
    if command -v open &> /dev/null; then
        open "$FRONTEND_URL"
    elif command -v xdg-open &> /dev/null; then
        xdg-open "$FRONTEND_URL"
    else
        echo "Please open manually: $FRONTEND_URL"
    fi
fi

echo ""
echo "Happy exhibiting! 🚀"
echo ""
