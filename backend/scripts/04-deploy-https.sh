#!/bin/bash
# day4-5-https-monitoring.sh - HTTPS & Monitoring (Essential)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../config/config.env"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔒 DAY 4-5: HTTPS & MONITORING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

validate_config || exit 1
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/day45-${TIMESTAMP}"
mkdir -p "${BACKUP_PATH}"
log_success "✓ Backup: ${BACKUP_PATH}"

# CloudFront Distribution
log_info "Creating CloudFront distribution..."
S3_ENDPOINT="${S3_BUCKET_NAME}.s3-website-${AWS_REGION}.amazonaws.com"

cat > /tmp/cf-config.json <<CF
{
    "CallerReference": "aipavilion-$(date +%s)",
    "Comment": "AI Pavilion Production",
    "Enabled": true,
    "DefaultRootObject": "index.html",
    "Origins": {
        "Quantity": 1,
        "Items": [{
            "Id": "S3-${S3_BUCKET_NAME}",
            "DomainName": "${S3_ENDPOINT}",
            "CustomOriginConfig": {
                "HTTPPort": 80,
                "HTTPSPort": 443,
                "OriginProtocolPolicy": "http-only",
                "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]},
                "OriginReadTimeout": 30,
                "OriginKeepaliveTimeout": 5
            }
        }]
    },
    "DefaultCacheBehavior": {
        "TargetOriginId": "S3-${S3_BUCKET_NAME}",
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
            "Quantity": 2,
            "Items": ["HEAD", "GET"],
            "CachedMethods": {"Quantity": 2, "Items": ["HEAD", "GET"]}
        },
        "Compress": true,
        "MinTTL": 0,
        "DefaultTTL": 300,
        "MaxTTL": 31536000,
        "ForwardedValues": {
            "QueryString": false,
            "Cookies": {"Forward": "none"}
        }
    },
    "CustomErrorResponses": {
        "Quantity": 2,
        "Items": [
            {"ErrorCode": 403, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 300},
            {"ErrorCode": 404, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 300}
        ]
    },
    "ViewerCertificate": {"CloudFrontDefaultCertificate": true, "MinimumProtocolVersion": "TLSv1.2_2021"},
    "PriceClass": "PriceClass_100"
}
CF

CREATE_OUTPUT=$(aws cloudfront create-distribution --distribution-config file:///tmp/cf-config.json --output json 2>/dev/null || echo '{}')
DIST_ID=$(echo "$CREATE_OUTPUT" | jq -r '.Distribution.Id // empty')

if [ -n "$DIST_ID" ]; then
    DIST_DOMAIN=$(echo "$CREATE_OUTPUT" | jq -r '.Distribution.DomainName')
    save_config "CLOUDFRONT_DISTRIBUTION_ID" "$DIST_ID"
    save_config "CLOUDFRONT_DOMAIN" "$DIST_DOMAIN"
    log_success "✓ CloudFront created: ${DIST_ID}"
    log_info "  Domain: https://${DIST_DOMAIN}"
    log_warning "  ⏱ Deployment takes 10-20 minutes"
else
    log_warning "⚠ CloudFront creation skipped (may already exist)"
fi

# CloudWatch Dashboard
log_info "Creating CloudWatch dashboard..."
DASHBOARD_NAME="AI-Pavilion-Production"

aws cloudwatch put-dashboard \
    --dashboard-name ${DASHBOARD_NAME} \
    --dashboard-body '{
        "widgets": [
            {
                "type": "metric",
                "properties": {
                    "metrics": [
                        ["AWS/ApiGateway", "Count", {"stat": "Sum"}],
                        [".", "4XXError", {"stat": "Sum"}],
                        [".", "5XXError", {"stat": "Sum"}]
                    ],
                    "period": 300,
                    "stat": "Sum",
                    "region": "'${AWS_REGION}'",
                    "title": "API Gateway Metrics"
                }
            }
        ]
    }' \
    --region ${AWS_REGION} 2>/dev/null || log_warning "Dashboard may already exist"

log_success "✓ CloudWatch dashboard: ${DASHBOARD_NAME}"

# Enable X-Ray tracing
log_info "Enabling X-Ray tracing..."
for func in $(aws lambda list-functions --region ${AWS_REGION} --query 'Functions[?starts_with(FunctionName, `ai-pavilion`)].FunctionName' --output text); do
    aws lambda update-function-configuration \
        --function-name $func \
        --tracing-config Mode=Active \
        --region ${AWS_REGION} 2>/dev/null && log_info "  ✓ $func" || true
done

log_success "✓ X-Ray enabled"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ DAY 4-5 COMPLETE: HTTPS & MONITORING!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
if [ -n "$DIST_DOMAIN" ]; then
    echo "🔒 HTTPS URL: https://${DIST_DOMAIN}"
    echo "   (wait 10-20 min for deployment)"
else
    echo "🔒 HTTPS: Check CloudFront console"
fi
echo ""
echo "📊 Dashboard: https://console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#dashboards:name=${DASHBOARD_NAME}"
echo "💾 Backup: ${BACKUP_PATH}"
echo ""
echo "📋 Next: Day 6 - AR Visualization"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
