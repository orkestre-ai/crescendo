# Security Policy

We take the security of Crescendo seriously. This document explains how to report vulnerabilities and what to expect from us in return.

## Supported Versions

Crescendo is currently in beta (0.x). Only the latest minor release on the `main` branch receives security fixes.

| Version | Supported |
|---------|-----------|
| 0.6.x   | ✅        |
| < 0.6   | ❌        |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Instead, report them privately via one of the following channels:

- **Email:** [security@orkestre.ai](mailto:security@orkestre.ai)
- **GitHub Security Advisories:** [Open a private advisory](https://github.com/orkestre-ai/crescendo/security/advisories/new)

When reporting, please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce, or a proof-of-concept
- The affected version (`0.6.x`, commit SHA, or branch)
- Any suggested mitigation, if you have one

You should receive an initial acknowledgement within **3 business days**. We aim to provide a status update within **7 business days**, including whether the report has been accepted and an estimated timeline for a fix.

## Disclosure Process

1. You submit a report privately via one of the channels above.
2. We confirm receipt and begin investigation.
3. We work with you to validate the issue and develop a fix.
4. We prepare a patched release and a security advisory.
5. We publish the advisory and credit you (if you wish) once a fix is available.

Please give us a reasonable window to address the issue before any public disclosure — typically **90 days**, or sooner if a fix ships earlier.

## Scope

The following are **in scope** for security reports:

- Authentication and authorization flaws
- Remote code execution, SSRF, SQL injection, XSS, CSRF
- Insecure handling of stored credentials (EN tokens, GA4 keys, Anthropic keys)
- Insecure use of the AES-256 encryption layer (`src/lib/crypto.ts`)
- Sensitive data exposure in logs (`src/lib/logging/`)
- Vulnerabilities in our dependency surface that affect Crescendo specifically
- Container-escape or privilege-escalation issues in our Docker setup

The following are **out of scope**:

- Vulnerabilities in third-party services we integrate with (report those to the upstream vendor — Engaging Networks, Google, Anthropic)
- Self-hosted misconfiguration that requires the attacker to already have admin access to your infrastructure
- Issues that require a malicious dependency or compromised npm registry
- Denial-of-service via resource exhaustion against your own local instance
- Social-engineering or physical-access attacks

## Handling of Credentials

Crescendo is designed to be self-hosted. You are responsible for:

- Generating a strong `ENCRYPTION_KEY` (64 hex chars / 32 bytes) and protecting it
- Restricting access to your `.env` / `.env.local` files
- Rotating EN API tokens, GA4 service account keys, and Anthropic API keys on a schedule
- Restricting network access to the application (it has no built-in user authentication)

If you believe Crescendo's code makes any of the above unnecessarily difficult or unsafe, please report it.

## Acknowledgements

We thank the following researchers for responsibly disclosing security issues:

<!-- Add named reporters here as advisories are resolved. -->

_None yet._
