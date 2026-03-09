#!/bin/bash
# day6-ar-visualization.sh - AR Product Visualization (Essential)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../config/config.env"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🥽 DAY 6: AR PRODUCT VISUALIZATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

validate_config || exit 1
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/day6-${TIMESTAMP}"
mkdir -p "${BACKUP_PATH}"

# Backup
cp "${FRONTEND_DIR}/src/config/config.js" "${BACKUP_PATH}/" 2>/dev/null || true
cp "${FRONTEND_DIR}/index.html" "${BACKUP_PATH}/" 2>/dev/null || true
log_success "✓ Backup: ${BACKUP_PATH}"

# Create 3D models bucket
MODELS_BUCKET="ai-pavilion-3d-models-${AWS_ACCOUNT_ID}"
aws s3 mb s3://${MODELS_BUCKET} --region ${AWS_REGION} 2>/dev/null || log_info "Bucket exists"

# CORS config
aws s3api put-bucket-cors --bucket ${MODELS_BUCKET} \
    --cors-configuration '{
        "CORSRules": [{
            "AllowedOrigins": ["*"],
            "AllowedMethods": ["GET", "HEAD"],
            "AllowedHeaders": ["*"],
            "MaxAgeSeconds": 3600
        }]
    }' 2>/dev/null || true

# Public access
aws s3api put-bucket-policy --bucket ${MODELS_BUCKET} \
    --policy '{
        "Version": "2012-10-17",
        "Statement": [{
            "Sid": "PublicRead",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::'${MODELS_BUCKET}'/models/*"
        }]
    }' 2>/dev/null || true

log_success "✓ 3D models bucket: ${MODELS_BUCKET}"

# Download sample 3D models
mkdir -p /tmp/sample-models
log_info "Downloading sample .glb models..."
curl -sL "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Chair/glTF-Binary/Chair.glb" \
    -o /tmp/sample-models/chair.glb 2>/dev/null || log_warning "Sample download failed"

if [ -f /tmp/sample-models/chair.glb ]; then
    aws s3 cp /tmp/sample-models/chair.glb s3://${MODELS_BUCKET}/models/chair.glb \
        --content-type "model/gltf-binary" 2>/dev/null
    log_success "✓ Sample model uploaded"
fi

# Update config.js with AR settings
cat > /tmp/update-ar-config.js << 'JS'
const fs = require('fs');
const config = fs.readFileSync(process.argv[2], 'utf8');
const modelsUrl = process.argv[3];
const updated = config.replace(
    /\/\/ AR configuration placeholder/,
    `ar: { enabled: true, modelsCDN: '${modelsUrl}', defaultScale: '1 1 1' },`
);
fs.writeFileSync(process.argv[2], updated, 'utf8');
console.log('✅ AR config added');
JS

node /tmp/update-ar-config.js "${FRONTEND_DIR}/src/config/config.js" "https://${MODELS_BUCKET}.s3.${AWS_REGION}.amazonaws.com"

# Add Model Viewer to index.html
if ! grep -q "model-viewer" "${FRONTEND_DIR}/index.html"; then
    sed -i.bak '/<\/head>/i\
    <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.3.0/model-viewer.min.js"></script>
' "${FRONTEND_DIR}/index.html"
    rm -f "${FRONTEND_DIR}/index.html.bak"
    log_success "✓ Model Viewer added to index.html"
fi

# Update sample stands with AR
log_info "Enabling AR on sample stands..."
aws dynamodb scan --table-name ${DYNAMODB_TABLE} --limit 2 --region ${AWS_REGION} --output json | \
jq -r '.Items[].stand_id.S' | head -2 | while read STAND_ID; do
    aws dynamodb update-item \
        --table-name ${DYNAMODB_TABLE} \
        --key "{\"stand_id\": {\"S\": \"${STAND_ID}\"}}" \
        --update-expression "SET ar_enabled = :enabled, model_url = :url" \
        --expression-attribute-values "{
            \":enabled\": {\"BOOL\": true},
            \":url\": {\"S\": \"https://${MODELS_BUCKET}.s3.${AWS_REGION}.amazonaws.com/models/chair.glb\"}
        }" \
        --region ${AWS_REGION} 2>/dev/null
    log_info "  ✓ AR enabled: ${STAND_ID}"
done

# Deploy frontend
aws s3 sync ${FRONTEND_DIR}/ s3://${S3_BUCKET_NAME}/ --exclude ".git/*" --quiet
log_success "✓ Frontend deployed with AR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ DAY 6 COMPLETE: AR VISUALIZATION!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🥽 AR Infrastructure:"
echo "   Models Bucket: ${MODELS_BUCKET}"
echo "   Sample Model:  chair.glb"
echo ""
echo "📱 Test AR:"
echo "   1. Open on mobile: http://${S3_BUCKET_NAME}.s3-website-${AWS_REGION}.amazonaws.com"
echo "   2. Navigate to AR-enabled stand"
echo "   3. Tap 'View in AR' button"
echo "   4. Position 3D model in your space!"
echo ""
echo "💾 Backup: ${BACKUP_PATH}"
echo "📋 Next: Day 7 - 360° Virtual Tours"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
