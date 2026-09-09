# Security Policy

## Reporting a vulnerability

Please do not open a public issue for credential exposure, authentication bypass, path traversal, or remote code execution. Use GitHub's private vulnerability reporting for this repository. Include affected version, reproduction steps, and impact; do not include real Xiaohongshu credentials or personal data.

## Security model

- The default stdio mode has no listening network socket.
- HTTP binds to `127.0.0.1` unless configured otherwise.
- Non-loopback binding requires a bearer token of at least 32 characters.
- This project never needs Xiaohongshu cookies, passwords, SMS codes, or private API signatures.
- Content approval is bound to a SHA-256 content hash.
- The JSON audit log excludes full post bodies and credentials.

For internet-facing multi-user deployments, put the MCP endpoint behind HTTPS and standards-based OAuth, isolate tenants, encrypt storage, rate-limit requests, and centralize security logs.
