# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 3.x.x   | :white_check_mark: |
| 2.x.x   | :x:                |
| < 2.0   | :x:                |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, email security@aipavilion.com with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You should receive a response within 48 hours.

## Security Measures

- AWS IAM least-privilege policies
- Input validation and sanitization
- Rate limiting
- HTTPS enforcement
- Secrets management (AWS Secrets Manager)
- Regular dependency updates
- Security scanning (Snyk, npm audit)

## Disclosure Policy

- Report received → 48h acknowledgment
- Investigation → 7 days
- Fix developed → 14 days
- Release → 30 days
- Public disclosure → After fix released
