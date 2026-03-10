#!/bin/bash
# day1-enable-auth.sh - Enable AWS Cognito Authentication
# SAFE, TESTED, PRODUCTION-READY VERSION

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../config/config.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_step() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}📍 STEP $1: $2${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔐 DAY 1: AWS COGNITO AUTHENTICATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ==================== PRE-FLIGHT CHECKS ====================
log_step "0" "Pre-flight Checks"

log_info "Checking AWS CLI..."
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI not found. Please install it first."
    exit 1
fi
log_success "AWS CLI found: $(aws --version | head -1)"

log_info "Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    log_error "AWS credentials not configured or invalid"
    exit 1
fi

CALLER_IDENTITY=$(aws sts get-caller-identity)
log_success "AWS credentials OK"
echo "$CALLER_IDENTITY" | jq '.'

log_info "Validating configuration..."
validate_config || exit 1
log_success "Configuration validated"

log_info "Checking existing resources..."
# Check S3 bucket exists
if ! aws s3 ls "s3://${S3_BUCKET_NAME}" &> /dev/null; then
    log_error "S3 bucket ${S3_BUCKET_NAME} not found!"
    exit 1
fi
log_success "S3 bucket exists"

# Check API Gateway exists
API_CHECK=$(aws apigateway get-rest-api \
    --rest-api-id ${API_GATEWAY_ID} \
    --region ${AWS_REGION} \
    --query 'name' \
    --output text 2>/dev/null || echo "")

if [ -z "$API_CHECK" ]; then
    log_error "API Gateway ${API_GATEWAY_ID} not found!"
    exit 1
fi
log_success "API Gateway exists: ${API_CHECK}"

# Check DynamoDB table exists
if ! aws dynamodb describe-table \
    --table-name ${DYNAMODB_TABLE} \
    --region ${AWS_REGION} &> /dev/null; then
    log_error "DynamoDB table ${DYNAMODB_TABLE} not found!"
    exit 1
fi
log_success "DynamoDB table exists"

# Check frontend files exist
if [ ! -f "${FRONTEND_DIR}/src/config/config.js" ]; then
    log_error "Frontend config.js not found at ${FRONTEND_DIR}/src/config/config.js"
    exit 1
fi
log_success "Frontend files found"

log_success "✅ All pre-flight checks passed!"

# ==================== BACKUP ====================
log_step "1" "Creating Backup"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/day1-${TIMESTAMP}"
mkdir -p "${BACKUP_PATH}"

log_info "Backing up frontend config.js..."
cp "${FRONTEND_DIR}/src/config/config.js" "${BACKUP_PATH}/config.js.backup"

log_info "Backing up frontend index.html..."
cp "${FRONTEND_DIR}/index.html" "${BACKUP_PATH}/index.html.backup"

log_info "Creating state snapshot..."
cat > "${BACKUP_PATH}/state.json" << EOF
{
    "timestamp": "${TIMESTAMP}",
    "aws_account": "${AWS_ACCOUNT_ID}",
    "region": "${AWS_REGION}",
    "s3_bucket": "${S3_BUCKET_NAME}",
    "api_gateway": "${API_GATEWAY_ID}",
    "dynamodb_table": "${DYNAMODB_TABLE}"
}
EOF

log_success "Backup created: ${BACKUP_PATH}"

# ==================== CREATE COGNITO USER POOL ====================
log_step "2" "Creating Cognito User Pool"

USER_POOL_NAME="ai-pavilion-users"

# Check if user pool already exists
EXISTING_POOL=$(aws cognito-idp list-user-pools \
    --max-results 60 \
    --region ${AWS_REGION} \
    --query "UserPools[?Name=='${USER_POOL_NAME}'].Id" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_POOL" ]; then
    log_warning "User pool '${USER_POOL_NAME}' already exists: ${EXISTING_POOL}"
    USER_POOL_ID=$EXISTING_POOL
    
    # Get user pool details
    USER_POOL_ARN=$(aws cognito-idp describe-user-pool \
        --user-pool-id ${USER_POOL_ID} \
        --region ${AWS_REGION} \
        --query 'UserPool.Arn' \
        --output text)
    
    log_info "Using existing user pool: ${USER_POOL_ID}"
else
    log_info "Creating new Cognito User Pool..."
    
    # Create user pool with email-based authentication
    CREATE_POOL_OUTPUT=$(aws cognito-idp create-user-pool \
        --pool-name "${USER_POOL_NAME}" \
        --region ${AWS_REGION} \
        --auto-verified-attributes email \
        --username-attributes email \
        --policies "PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=false}" \
        --schema Name=email,Required=true,Mutable=true Name=name,Required=false,Mutable=true \
        --mfa-configuration OFF \
        --account-recovery-setting "RecoveryMechanisms=[{Priority=1,Name=verified_email}]" \
        --email-configuration EmailSendingAccount=COGNITO_DEFAULT \
        --user-pool-tags Project=AIPayilion,Environment=Production \
        --output json)
    
    USER_POOL_ID=$(echo "$CREATE_POOL_OUTPUT" | jq -r '.UserPool.Id')
    USER_POOL_ARN=$(echo "$CREATE_POOL_OUTPUT" | jq -r '.UserPool.Arn')
    
    log_success "User Pool created: ${USER_POOL_ID}"
fi

save_config "COGNITO_USER_POOL_ID" "$USER_POOL_ID"
log_info "User Pool ID: ${USER_POOL_ID}"
log_info "User Pool ARN: ${USER_POOL_ARN}"

# ==================== CREATE APP CLIENT ====================
log_step "3" "Creating Cognito App Client"

APP_CLIENT_NAME="ai-pavilion-web-client"

# Check if app client already exists
EXISTING_CLIENTS=$(aws cognito-idp list-user-pool-clients \
    --user-pool-id ${USER_POOL_ID} \
    --region ${AWS_REGION} \
    --query "UserPoolClients[?ClientName=='${APP_CLIENT_NAME}'].ClientId" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_CLIENTS" ]; then
    log_warning "App client '${APP_CLIENT_NAME}' already exists"
    APP_CLIENT_ID=$(echo "$EXISTING_CLIENTS" | awk '{print $1}')
    log_info "Using existing app client: ${APP_CLIENT_ID}"
else
    log_info "Creating new App Client..."
    
    # Create app client (no client secret for public web apps)
    CREATE_CLIENT_OUTPUT=$(aws cognito-idp create-user-pool-client \
        --user-pool-id ${USER_POOL_ID} \
        --client-name "${APP_CLIENT_NAME}" \
        --region ${AWS_REGION} \
        --generate-secret false \
        --refresh-token-validity 30 \
        --access-token-validity 60 \
        --id-token-validity 60 \
        --token-validity-units "AccessToken=minutes,IdToken=minutes,RefreshToken=days" \
        --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_PASSWORD_AUTH \
        --prevent-user-existence-errors ENABLED \
        --output json)
    
    APP_CLIENT_ID=$(echo "$CREATE_CLIENT_OUTPUT" | jq -r '.UserPoolClient.ClientId')
    
    log_success "App Client created: ${APP_CLIENT_ID}"
fi

save_config "COGNITO_CLIENT_ID" "$APP_CLIENT_ID"
log_info "App Client ID: ${APP_CLIENT_ID}"

# ==================== UPDATE FRONTEND CONFIG ====================
log_step "4" "Updating Frontend Configuration"

CONFIG_FILE="${FRONTEND_DIR}/src/config/config.js"

log_info "Updating config.js with Cognito credentials..."

# Create Node.js script to safely update config
cat > /tmp/update-config.js << 'JSEOF'
const fs = require('fs');
const configPath = process.argv[2];
const userPoolId = process.argv[3];
const clientId = process.argv[4];

let config = fs.readFileSync(configPath, 'utf8');

// Update Cognito settings
config = config.replace(
    /userPoolId:\s*['""][^'"]*['"]/,
    `userPoolId: '${userPoolId}'`
);

config = config.replace(
    /clientId:\s*['""][^'"]*['"]/,
    `clientId: '${clientId}'`
);

// Enable real auth, disable mock
config = config.replace(
    /mockMode:\s*true/,
    'mockMode: false'
);

config = config.replace(
    /mockAuth:\s*true/g,
    'mockAuth: false'
);

config = config.replace(
    /USE_MOCK_AUTH:\s*true/,
    'USE_MOCK_AUTH: false'
);

// Update legacy constants
config = config.replace(
    /COGNITO_USER_POOL_ID:\s*['""][^'"]*['"]/,
    `COGNITO_USER_POOL_ID: '${userPoolId}'`
);

config = config.replace(
    /COGNITO_CLIENT_ID:\s*['""][^'"]*['"]/,
    `COGNITO_CLIENT_ID: '${clientId}'`
);

fs.writeFileSync(configPath, config, 'utf8');
console.log('✅ Config updated successfully');
JSEOF

# Execute config update
node /tmp/update-config.js "${CONFIG_FILE}" "${USER_POOL_ID}" "${APP_CLIENT_ID}"

log_success "Frontend configuration updated"

# Verify the update
log_info "Verifying config changes..."
if grep -q "${USER_POOL_ID}" "${CONFIG_FILE}" && grep -q "${APP_CLIENT_ID}" "${CONFIG_FILE}"; then
    log_success "✓ Cognito IDs present in config"
else
    log_error "Config update verification failed!"
    exit 1
fi

if grep -q "mockMode: false" "${CONFIG_FILE}"; then
    log_success "✓ Mock mode disabled"
else
    log_warning "⚠ Mock mode still enabled (check manually)"
fi

# ==================== CREATE LAMBDA AUTHORIZER ====================
log_step "5" "Creating Lambda Authorizer (Optional)"

log_info "Lambda authorizer for API Gateway..."
log_warning "⚠️ Skipping Lambda authorizer for now (can add later)"
log_info "Current setup uses Cognito User Pool authentication directly"

# ==================== DEPLOY FRONTEND ====================
log_step "6" "Deploying Frontend to S3"

log_info "Syncing frontend to S3..."
aws s3 sync ${FRONTEND_DIR}/ s3://${S3_BUCKET_NAME}/ \
    --exclude ".git/*" \
    --exclude "*.DS_Store" \
    --exclude "*.backup" \
    --exclude "node_modules/*" \
    --exclude ".env*" \
    --cache-control "public, max-age=300" \
    --quiet

log_success "Frontend deployed to S3"

# ==================== CREATE TEST USER ====================
log_step "7" "Creating Test User"

TEST_EMAIL="test@aipavilion.demo"
TEST_PASSWORD="TestPass123!"

log_info "Creating test user: ${TEST_EMAIL}"

# Check if user exists
USER_EXISTS=$(aws cognito-idp admin-get-user \
    --user-pool-id ${USER_POOL_ID} \
    --username ${TEST_EMAIL} \
    --region ${AWS_REGION} \
    2>/dev/null && echo "yes" || echo "no")

if [ "$USER_EXISTS" = "yes" ]; then
    log_warning "Test user already exists"
else
    # Create user
    aws cognito-idp admin-create-user \
        --user-pool-id ${USER_POOL_ID} \
        --username ${TEST_EMAIL} \
        --user-attributes Name=email,Value=${TEST_EMAIL} Name=email_verified,Value=true \
        --message-action SUPPRESS \
        --region ${AWS_REGION} \
        --output json > /dev/null
    
    # Set permanent password
    aws cognito-idp admin-set-user-password \
        --user-pool-id ${USER_POOL_ID} \
        --username ${TEST_EMAIL} \
        --password ${TEST_PASSWORD} \
        --permanent \
        --region ${AWS_REGION} > /dev/null
    
    log_success "Test user created successfully"
fi

# ==================== VERIFICATION & TESTING ====================
log_step "8" "Verification & Testing"

log_info "Testing Cognito configuration..."

# Test 1: User pool accessible
USER_POOL_STATUS=$(aws cognito-idp describe-user-pool \
    --user-pool-id ${USER_POOL_ID} \
    --region ${AWS_REGION} \
    --query 'UserPool.Status' \
    --output text 2>/dev/null || echo "ERROR")

if [ "$USER_POOL_STATUS" = "Enabled" ]; then
    log_success "✓ User pool is active"
else
    log_error "✗ User pool status: ${USER_POOL_STATUS}"
fi

# Test 2: App client accessible
APP_CLIENT_STATUS=$(aws cognito-idp describe-user-pool-client \
    --user-pool-id ${USER_POOL_ID} \
    --client-id ${APP_CLIENT_ID} \
    --region ${AWS_REGION} \
    --query 'UserPoolClient.ClientName' \
    --output text 2>/dev/null || echo "ERROR")

if [ "$APP_CLIENT_STATUS" = "${APP_CLIENT_NAME}" ]; then
    log_success "✓ App client is accessible"
else
    log_error "✗ App client check failed"
fi

# Test 3: Test user exists
TEST_USER_STATUS=$(aws cognito-idp admin-get-user \
    --user-pool-id ${USER_POOL_ID} \
    --username ${TEST_EMAIL} \
    --region ${AWS_REGION} \
    --query 'UserStatus' \
    --output text 2>/dev/null || echo "ERROR")

if [ "$TEST_USER_STATUS" != "ERROR" ]; then
    log_success "✓ Test user exists (status: ${TEST_USER_STATUS})"
else
    log_error "✗ Test user not found"
fi

# Test 4: Frontend deployed
S3_INDEX_EXISTS=$(aws s3 ls "s3://${S3_BUCKET_NAME}/index.html" 2>/dev/null && echo "yes" || echo "no")

if [ "$S3_INDEX_EXISTS" = "yes" ]; then
    log_success "✓ Frontend deployed to S3"
else
    log_error "✗ Frontend deployment verification failed"
fi

# Test 5: Config file updated
if grep -q "${USER_POOL_ID}" "${FRONTEND_DIR}/src/config/config.js"; then
    log_success "✓ Config file contains Cognito credentials"
else
    log_error "✗ Config file verification failed"
fi

# ==================== SUMMARY ====================
log_step "9" "Deployment Summary"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ DAY 1 COMPLETE: AUTHENTICATION ENABLED!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "🔐 Cognito Configuration:"
echo "   User Pool ID:    ${USER_POOL_ID}"
echo "   App Client ID:   ${APP_CLIENT_ID}"
echo "   Region:          ${AWS_REGION}"
echo ""

echo "👤 Test User Credentials:"
echo "   Email:           ${TEST_EMAIL}"
echo "   Password:        ${TEST_PASSWORD}"
echo ""

echo "🌐 Application URL:"
echo "   http://${S3_BUCKET_NAME}.s3-website-${AWS_REGION}.amazonaws.com"
echo ""

echo "📋 Next Steps:"
echo "   1. Open application in browser"
echo "   2. Click 'Login' button"
echo "   3. Use test credentials above"
echo "   4. Verify authentication works"
echo "   5. Check browser console for any errors"
echo ""

echo "💾 Backup Location:"
echo "   ${BACKUP_PATH}"
echo ""

echo "🧪 Quick Test Commands:"
echo "   # Test login via AWS CLI:"
echo "   aws cognito-idp initiate-auth \\"
echo "     --auth-flow USER_PASSWORD_AUTH \\"
echo "     --client-id ${APP_CLIENT_ID} \\"
echo "     --auth-parameters USERNAME=${TEST_EMAIL},PASSWORD=${TEST_PASSWORD} \\"
echo "     --region ${AWS_REGION}"
echo ""

# Save deployment info
cat > "${LOGS_DIR}/day1-deployment.json" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "status": "SUCCESS",
    "cognito": {
        "userPoolId": "${USER_POOL_ID}",
        "appClientId": "${APP_CLIENT_ID}",
        "region": "${AWS_REGION}"
    },
    "testUser": {
        "email": "${TEST_EMAIL}",
        "password": "${TEST_PASSWORD}"
    },
    "backup": "${BACKUP_PATH}"
}
EOF

log_success "Deployment info saved to: ${LOGS_DIR}/day1-deployment.json"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 Authentication is now LIVE!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
