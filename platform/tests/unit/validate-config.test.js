/**
 * Unit tests — Config Validator script
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '../../scripts/validate-config.js');

function runValidator(envContent) {
    const tmpFile = path.join(os.tmpdir(), `test-env-${Date.now()}.env`);
    fs.writeFileSync(tmpFile, envContent);
    try {
        execSync(`node ${SCRIPT} --env ${tmpFile}`, { encoding: 'utf8' });
        return { code: 0 };
    } catch (err) {
        return { code: err.status, stdout: err.stdout, stderr: err.stderr };
    } finally {
        fs.unlinkSync(tmpFile);
    }
}

const VALID_ENV = `
AWS_REGION=eu-west-1
AWS_ACCOUNT_ID=012345678901
COGNITO_USER_POOL_ID=eu-west-1_AbCdEfGhI
COGNITO_CLIENT_ID=abcdef1234567890abcdef1234
STRIPE_PUBLISHABLE_KEY=pk_test_abc123
STRIPE_SECRET_KEY=sk_test_abc123
STRIPE_WEBHOOK_SECRET=whsec_abc123
API_GATEWAY_URL=https://abc123.execute-api.eu-west-1.amazonaws.com/prod
ALLOWED_ORIGIN=https://d1234.cloudfront.net
S3_BUCKET_FRONTEND=ai-pavilion-frontend-eu
S3_BUCKET_UPLOADS=ai-pavilion-uploads-eu
CLOUDFRONT_DISTRIBUTION_ID=EABCDEF1234567
DYNAMODB_TABLE_STANDS=ai-pavilion-stands
DYNAMODB_TABLE_ORDERS=ai-pavilion-orders
NODE_ENV=development
`.trim();

describe('validate-config.js', () => {
    test('exits 0 with all valid values', () => {
        const result = runValidator(VALID_ENV);
        expect(result.code).toBe(0);
    });

    test('exits 1 when a required key is missing', () => {
        const env = VALID_ENV.split('\n').filter(l => !l.startsWith('STRIPE_SECRET_KEY=')).join('\n');
        const result = runValidator(env);
        expect(result.code).toBe(1);
    });

    test('exits 1 when a placeholder value is used', () => {
        const env = VALID_ENV.replace('pk_test_abc123', 'pk_test_CHANGEME');
        const result = runValidator(env);
        expect(result.code).toBe(1);
    });

    test('exits 1 when AWS Account ID is the default placeholder', () => {
        const env = VALID_ENV.replace('012345678901', '123456789012');
        const result = runValidator(env);
        expect(result.code).toBe(1);
    });

    test('exits 1 when .env file does not exist', () => {
        try {
            execSync(`node ${SCRIPT} --env /tmp/does-not-exist-${Date.now()}.env`, { encoding: 'utf8' });
            fail('Expected error');
        } catch (err) {
            expect(err.status).toBe(1);
        }
    });
});
