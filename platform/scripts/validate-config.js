#!/usr/bin/env node
/**
 * AI Pavilion - Config Validator
 *
 * Run this before any deployment to catch missing or placeholder values.
 * Usage: node scripts/validate-config.js
 *        node scripts/validate-config.js --env .env.staging
 */

const fs = require('fs');
const path = require('path');

// ─── Load .env ───────────────────────────────────────────────────────────────

const envArg = process.argv.indexOf('--env');
const envFile = envArg !== -1 ? process.argv[envArg + 1] : path.join(__dirname, '..', '.env');

if (!fs.existsSync(envFile)) {
    console.error(`\n❌  .env file not found at: ${envFile}`);
    console.error('    Copy .env.example → .env and fill in your values.\n');
    process.exit(1);
}

// Parse key=value pairs (skip comments and blank lines).
const raw = fs.readFileSync(envFile, 'utf8');
const env = {};
for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    env[key.trim()] = rest.join('=').trim();
}

// ─── Rule definitions ────────────────────────────────────────────────────────

const PLACEHOLDER_PATTERNS = [
    /^CHANGEME/i,
    /^your[-_]/i,
    /^XXXXXXXXX/,
    /^123456789012$/,           // default AWS account ID
    /^sk_test_CHANGEME/,
    /^pk_test_CHANGEME/,
    /^whsec_CHANGEME/,
];

const RULES = [
    // AWS
    { key: 'AWS_REGION',       label: 'AWS Region',                 pattern: /^[a-z]{2}-[a-z]+-\d$/ },
    { key: 'AWS_ACCOUNT_ID',   label: 'AWS Account ID',             pattern: /^\d{12}$/ },

    // Cognito
    { key: 'COGNITO_USER_POOL_ID', label: 'Cognito User Pool ID',   pattern: /^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/ },
    { key: 'COGNITO_CLIENT_ID',    label: 'Cognito Client ID',      pattern: /^[A-Za-z0-9]{10,}$/ },

    // Stripe
    { key: 'STRIPE_PUBLISHABLE_KEY', label: 'Stripe Publishable Key', pattern: /^pk_(test|live)_/ },
    { key: 'STRIPE_SECRET_KEY',      label: 'Stripe Secret Key',      pattern: /^sk_(test|live)_/, sensitive: true },
    { key: 'STRIPE_WEBHOOK_SECRET',  label: 'Stripe Webhook Secret',  pattern: /^whsec_/,           sensitive: true },

    // API
    { key: 'API_GATEWAY_URL',   label: 'API Gateway URL',           pattern: /^https:\/\/.+\.execute-api\..+\.amazonaws\.com/ },
    { key: 'ALLOWED_ORIGIN',    label: 'Allowed CORS Origin',       pattern: /^https?:\/\// },

    // S3
    { key: 'S3_BUCKET_FRONTEND', label: 'Frontend S3 Bucket',      pattern: /^[a-z0-9][a-z0-9\-]{2,62}[a-z0-9]$/ },
    { key: 'S3_BUCKET_UPLOADS',  label: 'Uploads S3 Bucket',        pattern: /^[a-z0-9][a-z0-9\-]{2,62}[a-z0-9]$/ },

    // CloudFront
    { key: 'CLOUDFRONT_DISTRIBUTION_ID', label: 'CloudFront Distribution ID', pattern: /^[A-Z0-9]{13,14}$/ },

    // DynamoDB
    { key: 'DYNAMODB_TABLE_STANDS', label: 'Stands DynamoDB Table', pattern: /^[a-zA-Z0-9_.-]{3,}$/ },
    { key: 'DYNAMODB_TABLE_ORDERS', label: 'Orders DynamoDB Table', pattern: /^[a-zA-Z0-9_.-]{3,}$/ },
];

// ─── Validation ──────────────────────────────────────────────────────────────

let errors = 0;
let warnings = 0;

console.log('\n🔍  AI Pavilion — Config Validator');
console.log('─'.repeat(50));

for (const rule of RULES) {
    const value = env[rule.key];
    const display = rule.sensitive ? '(hidden)' : value;

    if (!value || value === '') {
        console.error(`❌  MISSING   ${rule.key.padEnd(35)} — ${rule.label}`);
        errors++;
        continue;
    }

    const isPlaceholder = PLACEHOLDER_PATTERNS.some(p => p.test(value));
    if (isPlaceholder) {
        console.error(`❌  PLACEHOLDER  ${rule.key.padEnd(31)} = ${display}`);
        errors++;
        continue;
    }

    if (rule.pattern && !rule.pattern.test(value)) {
        console.warn(`⚠️   FORMAT   ${rule.key.padEnd(35)} = ${display}`);
        warnings++;
        continue;
    }

    console.log(`✅  OK        ${rule.key.padEnd(35)} = ${display}`);
}

// Warn if using live Stripe keys in non-production.
if (env.NODE_ENV !== 'production') {
    if (env.STRIPE_SECRET_KEY?.startsWith('sk_live_')) {
        console.warn('\n⚠️   DANGER: Live Stripe secret key in non-production environment!');
        warnings++;
    }
    if (env.STRIPE_PUBLISHABLE_KEY?.startsWith('pk_live_')) {
        console.warn('⚠️   DANGER: Live Stripe publishable key in non-production environment!');
        warnings++;
    }
}

console.log('─'.repeat(50));
if (errors > 0) {
    console.error(`\n❌  ${errors} error(s) found — fix before deploying.\n`);
    process.exit(1);
} else if (warnings > 0) {
    console.warn(`\n⚠️   ${warnings} warning(s) — review before deploying.\n`);
    process.exit(0);
} else {
    console.log('\n✅  All config values look good. Ready to deploy.\n');
    process.exit(0);
}
