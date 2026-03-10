#!/bin/bash
# test-all-scripts.sh - Comprehensive Testing Framework
# Testa TUTTI gli script senza modificare AWS (dry-run mode)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../config/config.env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 AI PAVILION - COMPREHENSIVE TEST FRAMEWORK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This script tests all deployment scripts for:"
echo "  ✓ Syntax errors"
echo "  ✓ Prerequisite checks"
echo "  ✓ Configuration validation"
echo "  ✓ Script logic flow"
echo "  ✓ Error handling"
echo ""
echo "Mode: DRY-RUN (no AWS resources will be created)"
echo ""
read -p "Press ENTER to start testing..."
echo ""

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_WARNINGS=0

test_result() {
    local test_name=$1
    local result=$2
    local message=$3
    
    if [ "$result" = "PASS" ]; then
        echo -e "${GREEN}✓ PASS${NC} - $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    elif [ "$result" = "FAIL" ]; then
        echo -e "${RED}✗ FAIL${NC} - $test_name: $message"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    elif [ "$result" = "WARN" ]; then
        echo -e "${YELLOW}⚠ WARN${NC} - $test_name: $message"
        TESTS_WARNINGS=$((TESTS_WARNINGS + 1))
    fi
}

# ==================== TEST 1: SCRIPT SYNTAX ====================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: SCRIPT SYNTAX VALIDATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for script in ${SCRIPT_DIR}/day*.sh; do
    script_name=$(basename "$script")
    
    # Check if file exists
    if [ ! -f "$script" ]; then
        test_result "$script_name - File exists" "FAIL" "Script not found"
        continue
    fi
    
    # Check if executable
    if [ ! -x "$script" ]; then
        test_result "$script_name - Executable" "WARN" "Not executable (will fix)"
        chmod +x "$script"
    else
        test_result "$script_name - Executable" "PASS"
    fi
    
    # Bash syntax check
    if bash -n "$script" 2>/dev/null; then
        test_result "$script_name - Bash syntax" "PASS"
    else
        test_result "$script_name - Bash syntax" "FAIL" "Syntax errors detected"
    fi
    
    # Check shebang
    if head -1 "$script" | grep -q "^#!/bin/bash"; then
        test_result "$script_name - Shebang" "PASS"
    else
        test_result "$script_name - Shebang" "WARN" "Missing or incorrect shebang"
    fi
    
    # Check set -e (exit on error)
    if grep -q "set -e" "$script"; then
        test_result "$script_name - Error handling (set -e)" "PASS"
    else
        test_result "$script_name - Error handling" "WARN" "Missing 'set -e'"
    fi
done

echo ""

# ==================== TEST 2: PREREQUISITES ====================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: SYSTEM PREREQUISITES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# AWS CLI
if command -v aws &> /dev/null; then
    AWS_VERSION=$(aws --version 2>&1 | head -1)
    test_result "AWS CLI installed" "PASS"
    echo "    Version: $AWS_VERSION"
else
    test_result "AWS CLI installed" "FAIL" "Not found"
fi

# AWS Credentials
if aws sts get-caller-identity &> /dev/null; then
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    test_result "AWS credentials valid" "PASS"
    echo "    Account: $ACCOUNT_ID"
    
    # Verify matches config
    if [ "$ACCOUNT_ID" = "$AWS_ACCOUNT_ID" ]; then
        test_result "AWS Account ID matches config" "PASS"
    else
        test_result "AWS Account ID matches config" "WARN" "Config: $AWS_ACCOUNT_ID, Actual: $ACCOUNT_ID"
    fi
else
    test_result "AWS credentials valid" "FAIL" "Cannot authenticate"
fi

# Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    test_result "Node.js installed" "PASS"
    echo "    Version: $NODE_VERSION"
    
    # Check version >= 18
    MAJOR_VERSION=$(echo "$NODE_VERSION" | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$MAJOR_VERSION" -ge 18 ]; then
        test_result "Node.js version >= 18" "PASS"
    else
        test_result "Node.js version >= 18" "WARN" "Version $NODE_VERSION, recommended 18+"
    fi
else
    test_result "Node.js installed" "FAIL" "Not found"
fi

# jq
if command -v jq &> /dev/null; then
    JQ_VERSION=$(jq --version 2>&1)
    test_result "jq installed" "PASS"
    echo "    Version: $JQ_VERSION"
else
    test_result "jq installed" "FAIL" "Not found (required for JSON parsing)"
fi

echo ""

# ==================== TEST 3: AWS RESOURCES ====================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 3: EXISTING AWS RESOURCES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# S3 Bucket
if aws s3 ls "s3://${S3_BUCKET_NAME}" &> /dev/null; then
    test_result "S3 bucket exists (${S3_BUCKET_NAME})" "PASS"
    
    # Check bucket contents
    FILE_COUNT=$(aws s3 ls "s3://${S3_BUCKET_NAME}/" --recursive | wc -l)
    echo "    Files in bucket: $FILE_COUNT"
    
    # Check index.html exists
    if aws s3 ls "s3://${S3_BUCKET_NAME}/index.html" &> /dev/null; then
        test_result "Frontend deployed (index.html)" "PASS"
    else
        test_result "Frontend deployed" "WARN" "index.html not found"
    fi
else
    test_result "S3 bucket exists" "FAIL" "Bucket ${S3_BUCKET_NAME} not found"
fi

# API Gateway
if aws apigateway get-rest-api --rest-api-id ${API_GATEWAY_ID} --region ${AWS_REGION} &> /dev/null; then
    API_NAME=$(aws apigateway get-rest-api --rest-api-id ${API_GATEWAY_ID} --region ${AWS_REGION} --query 'name' --output text)
    test_result "API Gateway exists (${API_GATEWAY_ID})" "PASS"
    echo "    Name: $API_NAME"
else
    test_result "API Gateway exists" "FAIL" "API ${API_GATEWAY_ID} not found"
fi

# DynamoDB Table
if aws dynamodb describe-table --table-name ${DYNAMODB_TABLE} --region ${AWS_REGION} &> /dev/null; then
    TABLE_STATUS=$(aws dynamodb describe-table --table-name ${DYNAMODB_TABLE} --region ${AWS_REGION} --query 'Table.TableStatus' --output text)
    ITEM_COUNT=$(aws dynamodb scan --table-name ${DYNAMODB_TABLE} --region ${AWS_REGION} --select COUNT --output json | jq -r '.Count')
    test_result "DynamoDB table exists (${DYNAMODB_TABLE})" "PASS"
    echo "    Status: $TABLE_STATUS"
    echo "    Items: $ITEM_COUNT"
else
    test_result "DynamoDB table exists" "FAIL" "Table ${DYNAMODB_TABLE} not found"
fi

echo ""

# ==================== TEST 4: STRIPE CONFIGURATION ====================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 4: STRIPE CONFIGURATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Stripe keys configured
if [ -n "$STRIPE_SECRET_KEY" ]; then
    test_result "STRIPE_SECRET_KEY configured" "PASS"
    echo "    Key: ${STRIPE_SECRET_KEY:0:20}..."
    
    # Validate key format
    if [[ "$STRIPE_SECRET_KEY" == sk_test_* ]]; then
        test_result "Stripe key is TEST mode" "PASS"
    elif [[ "$STRIPE_SECRET_KEY" == sk_live_* ]]; then
        test_result "Stripe key is LIVE mode" "WARN" "Using LIVE key - be careful!"
    else
        test_result "Stripe key format" "FAIL" "Invalid format"
    fi
    
    # Test Stripe API connection
    if command -v curl &> /dev/null; then
        STRIPE_TEST=$(curl -s https://api.stripe.com/v1/balance -u "${STRIPE_SECRET_KEY}:" 2>&1)
        if echo "$STRIPE_TEST" | grep -q "available"; then
            test_result "Stripe API connection" "PASS"
            BALANCE=$(echo "$STRIPE_TEST" | jq -r '.available[0].amount // 0')
            echo "    Balance: \$$(echo "scale=2; $BALANCE/100" | bc)"
        else
            test_result "Stripe API connection" "FAIL" "Cannot connect to Stripe"
        fi
    fi
else
    test_result "STRIPE_SECRET_KEY configured" "WARN" "Not set (required for Day 2)"
fi

if [ -n "$STRIPE_PUBLISHABLE_KEY" ]; then
    test_result "STRIPE_PUBLISHABLE_KEY configured" "PASS"
    echo "    Key: ${STRIPE_PUBLISHABLE_KEY:0:20}..."
else
    test_result "STRIPE_PUBLISHABLE_KEY configured" "WARN" "Not set (required for Day 2)"
fi

echo ""

# ==================== TEST 5: FRONTEND FILES ====================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 5: FRONTEND FILES STRUCTURE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

REQUIRED_FILES=(
    "${FRONTEND_DIR}/index.html"
    "${FRONTEND_DIR}/src/app.js"
    "${FRONTEND_DIR}/src/config/config.js"
    "${FRONTEND_DIR}/src/modules/stands.module.js"
    "${FRONTEND_DIR}/src/modules/stand-detail.module.js"
    "${FRONTEND_DIR}/src/modules/cart.module.js"
    "${FRONTEND_DIR}/src/modules/checkout.module.js"
    "${FRONTEND_DIR}/src/services/api.service.js"
    "${FRONTEND_DIR}/src/services/auth.service.js"
    "${FRONTEND_DIR}/src/services/stripe.service.js"
)

for file in "${REQUIRED_FILES[@]}"; do
    file_name=$(basename "$file")
    if [ -f "$file" ]; then
        file_size=$(wc -c < "$file")
        test_result "Frontend file: $file_name" "PASS"
        echo "    Size: $file_size bytes"
    else
        test_result "Frontend file: $file_name" "FAIL" "Not found"
    fi
done

echo ""

# ==================== TEST 6: CONFIG VALIDATION ====================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 6: CONFIGURATION VALIDATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check config.js exists and is valid
CONFIG_FILE="${FRONTEND_DIR}/src/config/config.js"

if [ -f "$CONFIG_FILE" ]; then
    test_result "config.js exists" "PASS"
    
    # Check for required config sections
    if grep -q "apiGatewayUrl" "$CONFIG_FILE"; then
        test_result "config.js has apiGatewayUrl" "PASS"
    else
        test_result "config.js has apiGatewayUrl" "FAIL" "Missing API Gateway URL"
    fi
    
    if grep -q "cognito" "$CONFIG_FILE"; then
        test_result "config.js has cognito section" "PASS"
    else
        test_result "config.js has cognito section" "WARN" "Will be added in Day 1"
    fi
    
    if grep -q "stripe" "$CONFIG_FILE"; then
        test_result "config.js has stripe section" "PASS"
    else
        test_result "config.js has stripe section" "WARN" "Will be added in Day 2"
    fi
    
    # Check JavaScript syntax
    if node -c "$CONFIG_FILE" 2>/dev/null; then
        test_result "config.js JavaScript syntax" "PASS"
    else
        test_result "config.js JavaScript syntax" "FAIL" "Syntax errors"
    fi
else
    test_result "config.js exists" "FAIL" "File not found"
fi

echo ""

# ==================== TEST 7: NETWORK CONNECTIVITY ====================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 7: NETWORK CONNECTIVITY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test S3 website endpoint
if command -v curl &> /dev/null; then
    S3_ENDPOINT="http://${S3_BUCKET_NAME}.s3-website-${AWS_REGION}.amazonaws.com"
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$S3_ENDPOINT" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "403" ]; then
        test_result "S3 website endpoint accessible" "PASS"
        echo "    URL: $S3_ENDPOINT"
        echo "    HTTP: $HTTP_CODE"
    else
        test_result "S3 website endpoint accessible" "WARN" "HTTP $HTTP_CODE"
    fi
    
    # Test API Gateway endpoint
    API_ENDPOINT="${API_GATEWAY_URL}/stands"
    API_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_ENDPOINT" 2>/dev/null || echo "000")
    
    if [ "$API_CODE" = "200" ]; then
        test_result "API Gateway endpoint accessible" "PASS"
        echo "    URL: $API_ENDPOINT"
    else
        test_result "API Gateway endpoint accessible" "WARN" "HTTP $API_CODE"
    fi
fi

echo ""

# ==================== TEST 8: BACKUP SYSTEM ====================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 8: BACKUP SYSTEM"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check backup directory exists
if [ -d "$BACKUP_DIR" ]; then
    test_result "Backup directory exists" "PASS"
    
    # Check if writable
    if [ -w "$BACKUP_DIR" ]; then
        test_result "Backup directory writable" "PASS"
    else
        test_result "Backup directory writable" "FAIL" "No write permission"
    fi
    
    # Count existing backups
    BACKUP_COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name "day*" 2>/dev/null | wc -l)
    echo "    Existing backups: $BACKUP_COUNT"
    
else
    mkdir -p "$BACKUP_DIR" 2>/dev/null
    if [ -d "$BACKUP_DIR" ]; then
        test_result "Backup directory created" "PASS"
    else
        test_result "Backup directory" "FAIL" "Cannot create"
    fi
fi

# Check logs directory
if [ -d "$LOGS_DIR" ]; then
    test_result "Logs directory exists" "PASS"
else
    mkdir -p "$LOGS_DIR" 2>/dev/null
    if [ -d "$LOGS_DIR" ]; then
        test_result "Logs directory created" "PASS"
    else
        test_result "Logs directory" "FAIL" "Cannot create"
    fi
fi

echo ""

# ==================== TEST 9: SCRIPT DEPENDENCIES ====================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 9: SCRIPT DEPENDENCIES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check each script sources config.env correctly
for script in ${SCRIPT_DIR}/day*.sh; do
    script_name=$(basename "$script")
    
    if grep -q "source.*config.env" "$script"; then
        test_result "$script_name sources config.env" "PASS"
    else
        test_result "$script_name sources config.env" "FAIL" "Missing config source"
    fi
    
    # Check uses helper functions
    if grep -q "log_info\|log_success\|log_error\|log_warning" "$script"; then
        test_result "$script_name uses log functions" "PASS"
    else
        test_result "$script_name uses log functions" "WARN" "No logging found"
    fi
done

echo ""

# ==================== TEST 10: DEPLOYMENT READINESS ====================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 10: DEPLOYMENT READINESS CHECKLIST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

READY=true

# AWS
if command -v aws &> /dev/null && aws sts get-caller-identity &> /dev/null; then
    test_result "AWS ready" "PASS"
else
    test_result "AWS ready" "FAIL"
    READY=false
fi

# Node.js
if command -v node &> /dev/null; then
    test_result "Node.js ready" "PASS"
else
    test_result "Node.js ready" "FAIL"
    READY=false
fi

# jq
if command -v jq &> /dev/null; then
    test_result "jq ready" "PASS"
else
    test_result "jq ready" "FAIL"
    READY=false
fi

# S3 Bucket
if aws s3 ls "s3://${S3_BUCKET_NAME}" &> /dev/null; then
    test_result "S3 bucket ready" "PASS"
else
    test_result "S3 bucket ready" "FAIL"
    READY=false
fi

# API Gateway
if aws apigateway get-rest-api --rest-api-id ${API_GATEWAY_ID} --region ${AWS_REGION} &> /dev/null; then
    test_result "API Gateway ready" "PASS"
else
    test_result "API Gateway ready" "FAIL"
    READY=false
fi

# DynamoDB
if aws dynamodb describe-table --table-name ${DYNAMODB_TABLE} --region ${AWS_REGION} &> /dev/null; then
    test_result "DynamoDB ready" "PASS"
else
    test_result "DynamoDB ready" "FAIL"
    READY=false
fi

# Frontend files
if [ -f "${FRONTEND_DIR}/index.html" ] && [ -f "${FRONTEND_DIR}/src/config/config.js" ]; then
    test_result "Frontend files ready" "PASS"
else
    test_result "Frontend files ready" "FAIL"
    READY=false
fi

# Stripe (optional for Day 2+)
if [ -n "$STRIPE_SECRET_KEY" ] && [ -n "$STRIPE_PUBLISHABLE_KEY" ]; then
    test_result "Stripe configured" "PASS"
else
    test_result "Stripe configured" "WARN" "Required for Day 2+"
fi

echo ""

# ==================== SUMMARY ====================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED + TESTS_WARNINGS))

echo -e "${GREEN}✓ PASSED:${NC}   $TESTS_PASSED"
echo -e "${YELLOW}⚠ WARNINGS:${NC} $TESTS_WARNINGS"
echo -e "${RED}✗ FAILED:${NC}   $TESTS_FAILED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TOTAL:     $TOTAL_TESTS tests"
echo ""

# Overall status
if [ $TESTS_FAILED -eq 0 ]; then
    if [ $TESTS_WARNINGS -eq 0 ]; then
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}✅ ALL TESTS PASSED - READY FOR DEPLOYMENT!${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    else
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}⚠️  TESTS PASSED WITH WARNINGS${NC}"
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo "Warnings can usually be ignored or addressed before specific deployment days."
        echo "Review warnings above and address if needed."
    fi
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}❌ TESTS FAILED - FIX ISSUES BEFORE DEPLOYMENT${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Review failed tests above and fix issues before proceeding."
    echo ""
    echo "Common fixes:"
    echo "  - Install missing tools (aws, node, jq)"
    echo "  - Configure AWS credentials"
    echo "  - Verify AWS resources exist"
    echo "  - Check file paths"
    exit 1
fi

echo ""
echo "Next steps:"
echo "  1. Review any warnings above"
echo "  2. Configure Stripe keys (if not done): export STRIPE_SECRET_KEY='sk_test_...'"
echo "  3. Run deployment scripts: ./day1-enable-auth.sh"
echo ""

# Save test results
TEST_REPORT="${LOGS_DIR}/test-report-$(date +%Y%m%d-%H%M%S).txt"
{
    echo "AI Pavilion - Test Report"
    echo "Generated: $(date)"
    echo ""
    echo "Tests Passed: $TESTS_PASSED"
    echo "Tests Warnings: $TESTS_WARNINGS"
    echo "Tests Failed: $TESTS_FAILED"
    echo "Total Tests: $TOTAL_TESTS"
    echo ""
    if [ $TESTS_FAILED -eq 0 ]; then
        echo "Status: READY FOR DEPLOYMENT ✅"
    else
        echo "Status: ISSUES FOUND ❌"
    fi
} > "$TEST_REPORT"

echo "Test report saved: $TEST_REPORT"
echo ""
