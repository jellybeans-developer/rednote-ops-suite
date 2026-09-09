# Threat model

## Protected assets

- Draft content and local media paths
- Publication approval decisions
- Public post identifiers and performance metrics
- MCP authentication tokens
- The user's Xiaohongshu account standing

## Main threats and controls

| Threat | Control |
|---|---|
| Prompt causes silent publication | Server exposes no undocumented publisher; approval and handoff are separate tools |
| Approval reused after editing | Approval is bound to SHA-256 of title, body, topics, and resolved asset paths |
| Public HTTP endpoint is unauthenticated | Non-loopback binding requires a bearer token; production guidance requires HTTPS/OAuth |
| Credential leakage | Tools never accept Xiaohongshu cookies, passwords, SMS codes, or private signatures |
| Sensitive body copied into audit logs | Audit records only action metadata and errors |
| Concurrent writes corrupt JSON | In-process transactions are serialized and files are atomically replaced |
| Malicious media path | Core stores paths but never reads, executes, uploads, or renders them |
| Platform enforcement evasion | Project policy rejects CAPTCHA bypass, private API reverse engineering, and anti-detection code |

## Known limits

- The JSON store is not a tenant boundary and is intended for one local user or trusted team.
- Bearer authentication does not provide per-user identity or revocation. Public services need OAuth and tenant isolation.
- Content checks are intentionally conservative and cannot guarantee legal or platform compliance.
- Anyone with filesystem access to the data directory can read its content unless the host encrypts storage.
