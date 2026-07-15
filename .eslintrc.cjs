module.exports = {
    root: true,
    env: {
        browser: true,
        node: true,
        es2022: true,
        jest: true,
    },
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
    },
    extends: ['eslint:recommended'],
    ignorePatterns: ['dist/', '.aws-sam/', 'coverage/', 'docs/archive/', 'data/'],
    globals: {
        __APP_CONFIG__: 'readonly',
        Stripe: 'readonly',
        pannellum: 'readonly',
    },
    rules: {
        'no-console': 'off',
        'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        'no-constant-condition': ['error', { checkLoops: false }],
        'no-prototype-builtins': 'error',
        eqeqeq: ['error', 'always'],
        curly: ['error', 'all'],
    },
};
