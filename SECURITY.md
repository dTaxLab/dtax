# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, email **security@getdtax.com** with:

1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if any)

We will acknowledge receipt within 48 hours and aim to provide a fix within 7 days for critical issues.

## Scope

The following components are in scope:

- `packages/tax-engine/` — Core calculation engine
- `packages/cli/` — CLI tool
- `packages/shared-types/` — Type definitions
- `apps/api/` — Backend API (authentication, encryption, data handling)
- `apps/web/` — Frontend (XSS, CSRF, authentication flows)
- Docker configurations and deployment

## Security Measures

- API key encryption at rest (AES-256-CBC)
- JWT-based stateless authentication
- Bcrypt password hashing (12 rounds)
- Rate limiting on authentication endpoints
- Input validation at API boundaries (Zod schemas)
- No sensitive data in logs or error responses
- Role-based access control (USER/ADMIN)

## Responsible Disclosure

We follow responsible disclosure practices. If you report a vulnerability:

- We will not take legal action against you
- We will credit you in the fix (unless you prefer anonymity)
- We ask that you do not publicly disclose until a fix is available
