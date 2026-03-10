#!/bin/bash
# deploy-all.sh - Complete AI Pavilion Deployment
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 AI PAVILION - FULL DEPLOYMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Deploy all components in order
for script in 01-deploy-auth.sh 02-deploy-payments.sh 03-deploy-products.sh 04-deploy-https.sh 05-deploy-ar.sh 06-deploy-360.sh 07-deploy-ui.sh 08-deploy-analytics.sh 09-deploy-features.sh; do
    if [ -f "${SCRIPT_DIR}/${script}" ]; then
        echo ""
        echo "▶️  Executing ${script}..."
        chmod +x "${SCRIPT_DIR}/${script}"
        "${SCRIPT_DIR}/${script}"
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ DEPLOYMENT COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Your AI Pavilion platform is ready! 🎉"
echo ""
